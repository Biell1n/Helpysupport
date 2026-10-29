// ============================================================
// assistant-builder-chat
//
// Monta o assistente. A tela manda uma "action":
//   load       → abre (ou cria) o rascunho do usuário
//   message    → conversa com a IA, que preenche o documento por ferramentas
//   set_model  → define o modelo de negócio sem IA (modo formulário)
//   add_field  → cria um campo à mão
//   finalize   → publica: cria ou atualiza o assistente
//   reset      → descarta o rascunho e começa de novo
//   undo       → volta o documento para a versão anterior
//   remove_material → tira um documento anexado
//   share      → liga/desliga ou troca o link público
//
// O que o usuário digita direto no formulário não passa por aqui: a tela
// grava builder_sessions.config (RLS garante o dono).
//
// Herança do builder do Horizons (v34): núcleo universal + modelo de
// negócio, catálogo sob medida, fila de assuntos que não repete pergunta,
// filtro de "Consultar", oferta de levar a lista para uma tabela.
// O que mudou: a IA grava por ferramentas e recebe de volta, em cada
// resultado, o que ficou gravado e o próximo assunto. Não precisa mais de
// uma segunda chamada para "extrair" nem de rede de resgate.
// ============================================================

import type Anthropic from 'npm:@anthropic-ai/sdk@^0.131.0';
import { corsHeaders, json, UserError } from '../_shared/cors.ts';
import { admin, profileOf, requireUser } from '../_shared/db.ts';
import { addUsage, anthropic, emptyUsage, logUsage, MODELS, textOf } from '../_shared/ai.ts';
import { inicioDoMes, planOf, trialExpirado } from '../_shared/plans.ts';
import { colunasDe, lerAbas, registrosDe } from '../_shared/planilha.ts';
import { retomarComRetorno } from '../_shared/canal-atender.ts';
import {
  allCollections, allFields, buildSchema, type CollectionDef, computeState, type Config,
  EMPTY_CONFIG, type FieldDef, hardenCollection, limpo, type Material, type MensagemBuilder, type Meta, missingCritical,
  type Modelo, MODELOS, normalizeConfig, normalizeMeta, PRICE_RE, type Schema, semNoItem, slug, valueOf, VENDA_NAO, VENDA_SIM, VENDE,
} from '../_shared/schema.ts';

type Versao = { em: string; config: Config; meta: Meta };

type Session = {
  id: string;
  owner_id: string;
  assistant_id: string | null;
  config: Config;
  meta: Meta;
  schema: Schema;
  messages: MensagemBuilder[];
  historico: Versao[];
  /** true quando o desfazer mexeu no histórico (o banco não deve criar versão) */
  historicoMexido?: boolean;
};

/** Arquivo que veio junto da mensagem. */
type Anexo = { nome: string; tipo: string; dados: string };

const TIPOS_ANEXO = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/gif', 'text/plain', 'text/csv', 'text/markdown'];
const MAX_ANEXOS = 4;
const MAX_ANEXO_B64 = 9_000_000; // ~6,5 MB por arquivo
const MAX_MATERIAL = 40_000; // caracteres guardados por documento
const MAX_MATERIAIS = 6;

const token = () => crypto.randomUUID().replace(/-/g, '').slice(0, 16);
const SECOES_QUE_CRESCEM = ['assistente', 'conhecimento', 'operacao', 'escalonamento', 'catalogo'];
const DESCANSO_TURNOS = 3;
const TENTATIVAS_MAX = 3;

// ------------------------------------------------------------
// Rascunho
// ------------------------------------------------------------

function hydrate(row: Record<string, unknown>): Session {
  const config = normalizeConfig(row.config as Config);
  const meta = normalizeMeta(row.meta as Meta);
  return {
    ...(row as unknown as Session),
    config,
    meta,
    schema: buildSchema(meta, config),
    messages: Array.isArray(row.messages) ? (row.messages as Session['messages']) : [],
    historico: Array.isArray(row.historico) ? (row.historico as Versao[]) : [],
  };
}

async function loadSession(ownerId: string, assistantId: string | null): Promise<Session> {
  let q = admin.from('builder_sessions').select('*').eq('owner_id', ownerId).eq('status', 'active');
  q = assistantId ? q.eq('assistant_id', assistantId) : q.is('assistant_id', null);
  const { data } = await q.order('updated_at', { ascending: false }).limit(1).maybeSingle();
  return data ? hydrate(data) : createSession(ownerId, assistantId);
}

async function createSession(ownerId: string, assistantId: string | null): Promise<Session> {
  let config = structuredClone(EMPTY_CONFIG);
  let meta = normalizeMeta(null);
  let messages: MensagemBuilder[] = [];

  if (assistantId) {
    const { data: a } = await admin
      .from('assistants')
      .select('config, meta')
      .eq('id', assistantId)
      .eq('owner_id', ownerId)
      .maybeSingle();
    if (!a) throw new UserError('Assistente não encontrado.', 404);
    config = normalizeConfig(a.config);
    meta = normalizeMeta(a.meta);
    // editar um assistente retoma a conversa em que ele foi montado
    messages = Array.isArray(meta.conversa) ? meta.conversa.slice(-80) : [];
  }

  const schema = buildSchema(meta, config);
  const { data, error } = await admin
    .from('builder_sessions')
    .insert({ owner_id: ownerId, assistant_id: assistantId, config, meta, schema, messages })
    .select('*')
    .single();
  if (error) throw error;
  return hydrate(data);
}

async function saveSession(s: Session) {
  s.schema = buildSchema(s.meta, s.config);
  const { data, error } = await admin
    .from('builder_sessions')
    .update({
      config: s.config,
      meta: s.meta,
      schema: s.schema,
      messages: s.messages.slice(-80),
      business_type: s.meta.ramo,
      ...(s.historicoMexido ? { historico: s.historico } : {}),
    })
    .eq('id', s.id)
    .select('historico')
    .single();
  if (error) throw error;
  // o banco pode ter acabado de guardar a versão anterior
  if (Array.isArray(data?.historico)) s.historico = data.historico as Versao[];
  s.historicoMexido = false;
}

const sessionPayload = (s: Session) => ({
  session_id: s.id,
  business_type: s.meta.ramo,
  business_model: s.meta.business_model,
  schema: s.schema,
  config: s.config,
  materiais: (s.meta.materiais ?? []).map((m) => ({ id: m.id, nome: m.nome, tipo: m.tipo, caracteres: m.texto.length })),
  listas_em_tabela: s.meta.listas_em_tabela ?? {},
  desfazer: s.historico.length,
});

/** Volta o documento para versões anteriores. Devolve quantas voltou. */
function desfazer(s: Session, passos = 1): number {
  let n = 0;
  while (n < Math.max(1, Math.min(5, passos)) && s.historico.length) {
    const v = s.historico.shift()!;
    const metaVelha = normalizeMeta(v.meta);
    s.config = normalizeConfig(v.config);
    // o que é da conversa continua andando; o documento volta
    s.meta = { ...metaVelha, turno: s.meta.turno, ask_counts: s.meta.ask_counts, ask_turnos: s.meta.ask_turnos, conversa: s.meta.conversa };
    n++;
  }
  if (n) {
    s.historicoMexido = true;
    s.schema = buildSchema(s.meta, s.config);
  }
  return n;
}

// anotação que alguém deixou na planilha para resolver depois
const PENDENTE = /(a|precisa[m]? ser|serão|ser[aã]o|ainda n[aã]o)\s+(confirmad|definid|informad|verificad)|a confirmar|a definir|sob consulta|consultar dispon|em defini[cç][aã]o/i;

/**
 * Lê as tabelas do assistente atrás de anotações pendentes ("tons precisam ser
 * confirmados"). Sem IA: só procura o padrão e junta por anotação.
 */
async function pendenciasDasTabelas(s: Session): Promise<{ nota: string; produtos: string[] }[]> {
  const ids = new Set((s.meta.tabelas_criadas ?? []).filter((x) => typeof x === 'string'));
  if (s.assistant_id) {
    const { data } = await admin.from('assistente_tabelas').select('tabela_id').eq('assistant_id', s.assistant_id);
    for (const t of data ?? []) ids.add(t.tabela_id);
  }
  if (!ids.size) return [];
  const { data: cols } = await admin.from('tabela_colunas').select('tabela_id, chave, ordem').in('tabela_id', [...ids]);
  const { data: linhas } = await admin.from('tabela_linhas').select('tabela_id, dados').in('tabela_id', [...ids]).limit(1000);
  const nomeDe = (tid: string, dados: Record<string, string>) => {
    const ord = (cols ?? []).filter((c) => c.tabela_id === tid).sort((a, b) => a.ordem - b.ordem);
    // o nome do produto costuma ser a primeira coluna de texto que não é código
    for (const c of ord) {
      const v = String(dados?.[c.chave] ?? '').trim();
      if (v && !/^[A-Z0-9-]{3,}$/.test(v) && v.length < 80) return v;
    }
    return '';
  };
  const porNota = new Map<string, string[]>();
  for (const l of linhas ?? []) {
    for (const v of Object.values((l.dados ?? {}) as Record<string, string>)) {
      const texto = String(v ?? '').trim();
      if (texto.length > 160 || !PENDENTE.test(texto)) continue;
      const lista = porNota.get(texto) ?? [];
      const nome = nomeDe(l.tabela_id, l.dados as Record<string, string>);
      if (nome && !lista.includes(nome)) lista.push(nome);
      porNota.set(texto, lista);
    }
  }
  return [...porNota.entries()].slice(0, 5).map(([nota, produtos]) => ({ nota, produtos: produtos.slice(0, 8) }));
}

/** Só a conversa de verdade (sem os avisos de desfazer). */
function conversaDe(msgs: MensagemBuilder[]) {
  return msgs.filter((m) => m.role === 'user' || m.role === 'assistant');
}

/** Em uma frase, o que mudou no documento depois de desfazer. */
function oQueVoltou(antes: { config: Config; schema: Schema }, depois: Session, tabelas: string[]): string {
  const rotulo = new Map<string, string>();
  for (const f of [...allFields(antes.schema), ...allFields(depois.schema)]) rotulo.set(f.key, f.label);
  for (const c of [...allCollections(antes.schema), ...allCollections(depois.schema)]) rotulo.set(c.key, c.label);
  const mudou: string[] = [];
  const chaves = new Set([...Object.keys(antes.config.fields ?? {}), ...Object.keys(depois.config.fields ?? {})]);
  for (const k of chaves) {
    if (JSON.stringify(antes.config.fields?.[k] ?? null) !== JSON.stringify(depois.config.fields?.[k] ?? null)) mudou.push(rotulo.get(k) ?? k);
  }
  const listas = new Set([...Object.keys(antes.config.collections ?? {}), ...Object.keys(depois.config.collections ?? {})]);
  for (const k of listas) {
    if (JSON.stringify(antes.config.collections?.[k] ?? []) !== JSON.stringify(depois.config.collections?.[k] ?? [])) mudou.push(rotulo.get(k) ?? k);
  }
  const partes: string[] = [];
  if (mudou.length) partes.push(`Voltou como estava: ${mudou.slice(0, 6).join(', ')}${mudou.length > 6 ? ` e mais ${mudou.length - 6}` : ''}.`);
  if (tabelas.length) partes.push(`Apaguei de Dados ${tabelas.length === 1 ? 'a tabela' : 'as tabelas'} ${tabelas.map((t) => `"${t}"`).join(', ')}, ${tabelas.length === 1 ? 'criada' : 'criadas'} nesse trecho.`);
  return partes.join(' ') || 'Nada visível mudou no documento.';
}

/** Tabelas que o montador criou no trecho desfeito saem de Dados junto. */
async function apagarTabelasDesfeitas(dono: string, antes: Meta, depois: Meta): Promise<string[]> {
  const ficam = new Set(depois.tabelas_criadas ?? []);
  const sair = (antes.tabelas_criadas ?? []).filter((id) => typeof id === 'string' && !ficam.has(id));
  if (!sair.length) return [];
  const { data } = await admin.from('tabelas').delete().eq('owner_id', dono).in('id', sair).select('nome');
  return (data ?? []).map((t: { nome: string }) => t.nome);
}

async function publicInfo(assistantId: string | null) {
  if (!assistantId) return null;
  const { data } = await admin.from('assistants').select('public_token, is_public, name').eq('id', assistantId).maybeSingle();
  return data ? { token: data.public_token, is_public: data.is_public, name: data.name } : null;
}

async function planInfo(ownerId: string) {
  const profile = await profileOf(ownerId);
  const plan = planOf(profile);
  const { count } = await admin
    .from('usage_events')
    .select('id', { count: 'exact', head: true })
    .eq('owner_id', ownerId)
    .eq('kind', 'builder')
    .gte('created_at', inicioDoMes());
  return {
    plan,
    payload: {
      id: plan.id,
      nome: plan.nome,
      builderIA: plan.builderIA && !trialExpirado(profile),
      builderRestantes: Math.max(0, plan.builderMsgs - (count ?? 0)),
      expirado: trialExpirado(profile),
    },
  };
}

// ------------------------------------------------------------
// Fila de assuntos
//
// Recusar e mudar de assunto são coisas diferentes. Recusou → dispensado
// para sempre. Mudou de assunto → a pergunta descansa alguns turnos e
// volta. Só desiste depois de TENTATIVAS_MAX.
// ------------------------------------------------------------

type Goal = { key: string | null; text: string; extras?: { key: string; text: string }[] };

/** Até quantos assuntos curtos vão juntos numa resposta. */
const MAX_POR_VEZ = 3;
/** Assuntos que pedem resposta pensada: vão sempre sozinhos. */
const PENSADOS = new Set([
  'descricao_negocio', 'tom_de_voz', 'regras', 'quando_chamar_humano', 'nunca_chamar_humano',
  'saudacao', 'metodo_ensino', 'assuntos_cobertos', 'codigo_chamado',
]);

function nextGoal(s: Session): Goal {
  const { meta, schema, config } = s;
  const state = computeState(schema, config);
  const asks = meta.ask_counts;
  const turnos = meta.ask_turnos;

  const escolher = (chaves: string[], forcar = false): string | null => {
    const vivos = chaves.filter((k) => (asks[k] ?? 0) < TENTATIVAS_MAX);
    if (!vivos.length) return null;
    const descansados = vivos.filter((k) => meta.turno - (turnos[k] ?? -99) >= DESCANSO_TURNOS);
    if (descansados.length) {
      return descansados.sort((a, b) => (asks[a] ?? 0) - (asks[b] ?? 0) || (turnos[a] ?? 0) - (turnos[b] ?? 0))[0];
    }
    return forcar ? vivos.sort((a, b) => (turnos[a] ?? 0) - (turnos[b] ?? 0))[0] : null;
  };

  const F = (k: string) => allFields(schema).find((x) => x.key === k);
  const C = (k: string) => allCollections(schema).find((x) => x.key === k);
  const label = (k: string) => F(k)?.label ?? C(k)?.label ?? k;
  // Só o assunto, nunca a frase pronta: frase pronta vira formulário.
  const desc = (k: string) => {
    const f = F(k);
    if (f) return `${f.label}${f.hint ? ` (para você entender: ${f.hint})` : ''}`;
    const c = C(k);
    return c ? `a lista de ${c.label}` : k;
  };
  const insist = (k: string) =>
    (asks[k] ?? 0) >= 2
      ? ' Você já perguntou isto antes sem resposta clara. Reformule do zero, dê um exemplo de resposta possível e diga em meia frase por que precisa disso.'
      : '';

  if (!meta.business_model) {
    return { key: 'negocio', text: 'Descobrir o que o negócio faz e o que oferece, para escolher o modelo de negócio com definir_negocio.' };
  }

  // Assunto curto (campo de resposta rápida, não lista nem texto longo) pode
  // ir junto com outros curtos, de preferência da mesma seção. Se a pessoa
  // vem respondendo só um dos agrupados, volta a ser uma pergunta por vez.
  const curto = (k: string) => {
    const f = F(k);
    if (!f || C(k) || PENSADOS.has(k)) return false;
    // depende de outra resposta que ainda não veio (ex.: horário da equipe só se houver chamados)
    return !f.depende || !!valueOf(config, f.depende.campo);
  };
  const secaoDe = (k: string) => schema.sections.find((sec) => sec.fields.some((f) => f.key === k))?.key;
  const agrupar = (k: string, base: Goal): Goal => {
    if (!curto(k) || (meta.grupos_ignorados ?? 0) >= 2) return base;
    const candidatos = [...state.missing.critical, ...state.missing.important, ...state.missing.optional]
      .filter((x, i, arr) => x !== k && arr.indexOf(x) === i && curto(x))
      .filter((x) => (asks[x] ?? 0) < TENTATIVAS_MAX && meta.turno - (turnos[x] ?? -99) >= DESCANSO_TURNOS);
    const sec = secaoDe(k);
    candidatos.sort((a, b) => Number(secaoDe(b) === sec) - Number(secaoDe(a) === sec));
    const extras = candidatos.slice(0, MAX_POR_VEZ - 1).map((x) => ({ key: x, text: desc(x) }));
    return extras.length ? { ...base, extras } : base;
  };

  const kCrit = escolher(state.missing.critical, true);
  if (kCrit) return agrupar(kCrit, { key: kCrit, text: `${desc(kCrit)}. É obrigatório.${insist(kCrit)}` });

  // itens com dado faltando — em lote quando são muitos iguais
  const porLista = new Map<string, typeof state.incomplete>();
  for (const it of state.incomplete) porLista.set(it.collection, [...(porLista.get(it.collection) ?? []), it]);
  for (const [col, itens] of porLista) {
    const k = `${col}:itens`;
    if (!escolher([k])) continue;
    const campos = [...new Set(itens.flatMap((i) => i.fields))].join(', ');
    return itens.length >= 3
      ? {
        key: k,
        text: `Falta ${campos} em ${itens.length} itens de ${itens[0].label}: ${itens.slice(0, 12).map((i) => i.item).join(', ')}. Pergunte de UMA VEZ, listando os itens. Diga que dá para responder tudo numa mensagem, ou dizer se vale o mesmo valor para todos (aí use preencher_em_todos).`,
      }
      : { key: k, text: `Os dados que faltam do item "${itens[0].item}" em ${itens[0].label}: ${itens[0].fields.join(', ')}. Cite o item pelo nome.` };
  }

  // lista crescendo: é hora de oferecer a tabela
  if (!meta.tabela_oferecida && !meta.tabela_recusada) {
    const vendeCoisa = meta.business_model === 'produto' || meta.business_model === 'assinatura';
    const teto = vendeCoisa ? 3 : 8;
    const c = allCollections(schema).find(
      (x) => !['contatos', 'faq'].includes(x.key) && (config.collections[x.key]?.length ?? 0) >= teto,
    );
    if (c) {
      return {
        key: 'tabela',
        text: `A pessoa já listou ${config.collections[c.key].length} itens em ${c.label}. Ofereça levar essa lista para uma tabela em Dados (ferramenta mover_para_tabela, lista "${c.key}"). Explique o ganho concreto, nunca o nome do recurso:${vendeCoisa ? '\n- dá para ter coluna de estoque: o assistente responde "temos 3" em vez de "consulte"' : ''}
- ela atualiza preço e item na hora, sem refazer nada aqui
- dá para colar a planilha inteira de uma vez
- o que já foi listado vai junto
É oferta: se disser não, siga e nunca mais toque no assunto (ferramenta recusar_tabela).`,
      };
    }
  }

  // a planilha tem anotações do tipo "tons a confirmar": resolver na montagem, não com o cliente
  const pend = meta.pendencias_tabela ?? [];
  if (pend.length && (asks.pendencias ?? 0) < 2) {
    return {
      key: 'pendencias',
      text: `Na tabela de produtos há anotações pendentes que o assistente acabaria repetindo para o cliente:
${pend.map((p) => `- "${p.nota}"${p.produtos.length ? ` (em ${p.produtos.slice(0, 4).join(', ')}${p.produtos.length > 4 ? '…' : ''})` : ''}`).join('\n')}
Pergunte a informação certa (ex.: quais tons existem de cada produto) para o assistente vender sem precisar confirmar. Grave a resposta no campo que couber (tons, cores e tamanhos vão em variacoes) e diga que, se preferir, ela pode apagar a anotação da tabela em Dados. Se ela disser que não tem a informação, grave isso e siga.${insist('pendencias')}`,
    };
  }

  const kMais = escolher(state.askMore.map((k) => `more:${k}`));
  if (kMais) {
    const k = kMais.slice(5);
    return { key: kMais, text: `Saber se falta algum item em ${label(k)}. Uma pergunta só; se a pessoa disser que não, use sem_mais_itens.` };
  }

  const kImp = escolher(state.missing.important);
  if (kImp) return agrupar(kImp, { key: kImp, text: `${desc(kImp)}.${insist(kImp)}` });

  const kOpt = escolher(state.missing.optional);
  if (kOpt) return agrupar(kOpt, { key: kOpt, text: `${desc(kOpt)}. É opcional: se a pessoa não quiser, tudo bem, mas puxe o assunto.` });

  const kRet = escolher([...state.missing.important, ...state.missing.optional], true);
  if (kRet) {
    return { key: kRet, text: `${desc(kRet)}. Você já tocou nisso e ficou em aberto — a pessoa mudou de assunto, não recusou. Retome reconhecendo que está voltando a um ponto anterior.` };
  }

  const sobra = [...state.missing.important, ...state.missing.optional].map(label);
  if (!meta.review_done && sobra.length) {
    return {
      key: 'revisao',
      text: `REVISÃO. Liste com travessão o que ainda está vazio:\n${sobra.map((x) => `- ${x}`).join('\n')}\nDiga que nada disso é obrigatório e pergunte se quer preencher algum agora ou dispensar todos (dispensar_restantes). Esta é a única resposta em que você pode listar vários itens.`,
    };
  }

  return { key: null, text: 'Nada mais a perguntar. Resuma em duas frases o que o assistente sabe e avise que é só clicar em Publicar.' };
}

function marcarPergunta(s: Session, goal: Goal) {
  if (!goal.key) return;
  if (goal.key === 'revisao') s.meta.review_done = true;
  for (const k of [goal.key, ...(goal.extras ?? []).map((e) => e.key)]) {
    s.meta.ask_counts[k] = (s.meta.ask_counts[k] ?? 0) + 1;
    s.meta.ask_turnos[k] = s.meta.turno;
  }
  s.meta.last_goal = goal.key;
  s.meta.ultimo_grupo = goal.extras?.length ? [goal.key, ...goal.extras.map((e) => e.key)] : [];
}

/**
 * Antes de escolher o próximo assunto: a pessoa respondeu os assuntos que
 * foram juntos na última pergunta? Se duas vezes seguidas ela só respondeu
 * um (ou nenhum), o construtor volta a perguntar uma coisa por vez.
 */
function conferirGrupo(s: Session) {
  const grupo = s.meta.ultimo_grupo ?? [];
  if (grupo.length < 2) return;
  const respondidos = grupo.filter((k) => valueOf(s.config, k) || s.config.fields[k]?.status === 'ignorado').length;
  s.meta.grupos_ignorados = respondidos >= 2 ? 0 : (s.meta.grupos_ignorados ?? 0) + 1;
  s.meta.ultimo_grupo = [];
}

// ------------------------------------------------------------
// Ferramentas
// ------------------------------------------------------------

const strArr = { type: 'array', items: { type: 'string' } };

const TOOLS: Anthropic.Beta.BetaTool[] = [
  {
    name: 'definir_negocio',
    description:
      'Define o modelo de negócio e o ramo assim que ficar claro o que a pessoa faz. Pode também desenhar a lista do catálogo sob medida e reescrever rótulos do núcleo na língua deste negócio. Chame de novo só se a pessoa descrever um negócio de natureza claramente diferente.',
    input_schema: {
      type: 'object',
      properties: {
        modelo: {
          type: 'string',
          enum: [...MODELOS],
          description:
            'produto: vende coisa física · servico: presta serviço · curso: ensina e vende curso · assinatura: plano recorrente · agendamento: marca horário (clínica, salão) · informativo: só informa · educacional: professor/monitor que ajuda a aprender, NÃO vende · suporte: ajuda quem já é cliente a resolver problema',
        },
        ramo: { type: 'string', description: 'Nome legível do ramo. Ex.: Loja de tênis de corrida' },
        catalogo: {
          type: 'object',
          description:
            'Opcional. A lista do que o negócio oferece, sob medida, com 5 a 7 atributos. Se cobra por algo, preço é um deles. Ex. loja de tênis: nome, marca, categoria, tamanhos, cores, preço, disponibilidade. Professor: tema, como explicar, nível, onde costumam errar, exemplo (sem preço).',
          properties: {
            secao: { type: 'string', description: 'Título da seção. Ex.: Produtos' },
            lista: { type: 'string', description: 'Nome da lista. Ex.: Tênis' },
            atributos: {
              type: 'array',
              items: {
                type: 'object',
                properties: { rotulo: { type: 'string' }, longo: { type: 'boolean' } },
                required: ['rotulo'],
              },
            },
          },
          required: ['secao', 'lista', 'atributos'],
        },
        rotulos: {
          type: 'object',
          description:
            'Opcional. Rótulos do núcleo reescritos para este negócio, por chave: {"publico_alvo":{"label":"Quem são seus clientes","hint":"Ex.: ..."}}. Nunca use "cliente" para quem não tem cliente nem "produto" para quem não vende. Máximo 8.',
          additionalProperties: {
            type: 'object',
            properties: { label: { type: 'string' }, hint: { type: 'string' } },
          },
        },
      },
      required: ['modelo', 'ramo'],
    },
  },
  {
    name: 'preencher_campos',
    description:
      'Grava valores em campos simples. Use as chaves exatas do documento. Resposta vaga também é resposta: normalize em uma frase e grave. Em "regras", use acrescentar=true para não apagar as anteriores.',
    input_schema: {
      type: 'object',
      properties: {
        campos: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              chave: { type: 'string' },
              valor: { type: 'string' },
              acrescentar: { type: 'boolean' },
            },
            required: ['chave', 'valor'],
          },
        },
      },
      required: ['campos'],
    },
  },
  {
    name: 'salvar_itens',
    description:
      'Adiciona ou atualiza itens de uma lista. O item é reconhecido pelo primeiro atributo (nome, tema, pergunta…): se já existir, os atributos informados são atualizados. Item sem o identificador é rejeitado. Inclua só o que a pessoa disse. Até 20 itens por chamada; para mais, chame de novo com o próximo lote.',
    input_schema: {
      type: 'object',
      properties: {
        lista: { type: 'string' },
        itens: { type: 'array', items: { type: 'object', additionalProperties: { type: 'string' } } },
      },
      required: ['lista', 'itens'],
    },
  },
  {
    name: 'preencher_em_todos',
    description: 'Preenche um atributo em todos os itens da lista onde ele está vazio. Use quando a pessoa confirmar que "vale o mesmo para todos".',
    input_schema: {
      type: 'object',
      properties: { lista: { type: 'string' }, atributo: { type: 'string' }, valor: { type: 'string' } },
      required: ['lista', 'atributo', 'valor'],
    },
  },
  {
    name: 'remover_item',
    description: 'Remove um item de uma lista pelo identificador (nome, tema, pergunta…).',
    input_schema: {
      type: 'object',
      properties: { lista: { type: 'string' }, identificador: { type: 'string' } },
      required: ['lista', 'identificador'],
    },
  },
  {
    name: 'dispensar',
    description:
      'A pessoa disse que não tem ou não quer informar. Dispensa: um campo (chave); uma lista inteira (chave da lista); um atributo em TODOS os itens (chave da lista + atributo); ou um atributo de UM item só (chave da lista + atributo + identificador do item, ex.: "não quero pôr o preço do kit"). Nunca use só porque ela ainda não respondeu. Na tela, o que for dispensado aparece riscado e a pessoa pode reativar.',
    input_schema: {
      type: 'object',
      properties: {
        chave: { type: 'string', description: 'Campo ou lista' },
        atributo: { type: 'string', description: 'Atributo dos itens da lista' },
        identificador: { type: 'string', description: 'Nome (primeiro atributo) do item, quando é só para ele' },
      },
      required: ['chave'],
    },
  },
  {
    name: 'desfazer',
    description:
      'Volta o documento para como estava antes da última mudança (ou das últimas, até 5). Use quando a pessoa pedir para voltar, desfazer, ou disser que apagou ou mudou algo sem querer. Depois confira o estado e diga o que voltou.',
    input_schema: { type: 'object', properties: { passos: { type: 'integer', description: 'Quantas mudanças voltar. Padrão 1.' } } },
  },
  {
    name: 'sem_mais_itens',
    description: 'A pessoa disse que a lista está completa. Para de perguntar se falta item nela.',
    input_schema: { type: 'object', properties: { lista: { type: 'string' } }, required: ['lista'] },
  },
  {
    name: 'dispensar_restantes',
    description: 'Na revisão, a pessoa escolheu dispensar tudo o que ainda está vazio.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'criar_campo',
    description:
      'Cria um campo quando a pessoa pedir ("queria um campo de…") ou quando ela contar algo relevante que não cabe em campo nenhum. Se tiver opções fixas, use tipo select com opcoes. Pode já gravar o valor.',
    input_schema: {
      type: 'object',
      properties: {
        secao: { type: 'string', enum: SECOES_QUE_CRESCEM },
        rotulo: { type: 'string' },
        tipo: { type: 'string', enum: ['text', 'textarea', 'select'] },
        opcoes: strArr,
        valor: { type: 'string' },
      },
      required: ['secao', 'rotulo'],
    },
  },
  {
    name: 'criar_lista',
    description: 'Cria uma lista nova de coisas que o assistente consulta e que não cabem nas listas existentes (ex.: Profissionais de um salão, Unidades de uma rede). Nunca para registrar pedidos, solicitações, atendimentos ou clientes: isso o Helpy já guarda em Atendimentos e Pedidos.',
    input_schema: {
      type: 'object',
      properties: {
        secao: { type: 'string', enum: SECOES_QUE_CRESCEM },
        rotulo: { type: 'string' },
        atributos: strArr,
      },
      required: ['secao', 'rotulo', 'atributos'],
    },
  },
  {
    name: 'mover_para_tabela',
    description: 'A pessoa aceitou levar uma lista para uma tabela em Dados. Cria a tabela com as colunas da lista e leva os itens junto.',
    input_schema: { type: 'object', properties: { lista: { type: 'string' } }, required: ['lista'] },
  },
  {
    name: 'recusar_tabela',
    description: 'A pessoa não quis a tabela. Não ofereça de novo.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'lista_em_tabela',
    description: 'Uma planilha anexada já virou tabela em Dados e corresponde a uma lista do documento (ex.: produtos). Marca que essa lista mora na tabela, para não pedir os itens de novo.',
    input_schema: { type: 'object', properties: { lista: { type: 'string' }, tabela: { type: 'string' } }, required: ['lista'] },
  },
  {
    name: 'configurar_agenda',
    description:
      'Grava a agenda do negócio: dias e horários de atendimento, duração padrão, antecedência mínima e os serviços que dá para marcar (com duração e valor). Use quando a pessoa disser os horários ou os serviços. Mande só o que ela disse; o resto fica como está. Também liga a agenda.',
    input_schema: {
      type: 'object',
      properties: {
        horarios: {
          type: 'object',
          description: 'Dia da semana (0=domingo … 6=sábado) → faixas ["HH:MM","HH:MM"]. Dia fechado = []. Ex.: {"1":[["09:00","12:00"],["13:00","18:00"]],"0":[]}',
          additionalProperties: { type: 'array', items: { type: 'array', items: { type: 'string' } } },
        },
        duracao_min: { type: 'integer' },
        antecedencia_horas: { type: 'integer' },
        servicos: {
          type: 'array',
          items: {
            type: 'object',
            properties: { nome: { type: 'string' }, duracao_min: { type: 'integer' }, valor: { type: 'number' } },
            required: ['nome'],
          },
        },
      },
    },
  },
];

const HORA_OK = /^([01]?\d|2[0-3]):[0-5]\d$/;

type Ctx = { s: Session; userId: string; touched: Set<string>; maxTabelas: number };

async function runTool(ctx: Ctx, name: string, input: Record<string, unknown>): Promise<Record<string, unknown>> {
  const { s, touched } = ctx;
  const cfg = s.config;
  const fields = new Map(allFields(s.schema).map((f) => [f.key, f]));
  const cols = new Map(allCollections(s.schema).map((c) => [c.key, c]));
  const rebuild = () => {
    s.schema = buildSchema(s.meta, s.config);
  };

  const cleanItem = (c: CollectionDef, raw: unknown) => {
    const keys = new Set(c.item_fields.map((f) => f.key));
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries((raw ?? {}) as Record<string, unknown>)) {
      const kk = keys.has(k) ? k : slug(k);
      if (!keys.has(kk)) continue;
      const val = limpo(v, 2000);
      if (val) out[kk] = val;
    }
    return out;
  };
  const idKey = (c: CollectionDef) => c.item_fields[0]?.key;
  const findIdx = (c: CollectionDef, id: string) =>
    (cfg.collections[c.key] ?? []).findIndex((it) => slug(it?.[idKey(c)] ?? '') === slug(id));

  switch (name) {
    case 'definir_negocio': {
      const modelo = String(input.modelo) as Modelo;
      if (!MODELOS.includes(modelo)) return { erro: 'modelo inválido' };
      const trocou = s.meta.business_model && s.meta.business_model !== modelo;
      s.meta.business_model = modelo;
      s.meta.ramo = String(input.ramo ?? '').slice(0, 80) || s.meta.ramo;

      const cat = input.catalogo as { secao: string; lista: string; atributos: Array<{ rotulo: string; longo?: boolean }> } | undefined;
      if (cat && Array.isArray(cat.atributos) && cat.atributos.length >= 3) {
        const col = hardenCollection(
          {
            key: slug(cat.lista),
            label: cat.lista,
            importance: 'critical',
            item_fields: cat.atributos.map((a) => ({
              key: slug(a.rotulo), label: a.rotulo, type: a.longo ? 'textarea' : 'text',
            })),
          },
          VENDE.includes(modelo) || modelo === 'informativo',
        );
        s.meta.catalogo = { key: 'catalogo', label: String(cat.secao || cat.lista).slice(0, 50), fields: [], collections: [col], dynamic: true };
      } else if (trocou) {
        s.meta.catalogo = null; // volta ao catálogo de reserva do novo modelo
      }

      const rot = (input.rotulos ?? {}) as Meta['core_labels'];
      for (const [k, v] of Object.entries(rot).slice(0, 8)) {
        if (v && typeof v === 'object') s.meta.core_labels[slug(k)] = { label: v.label, hint: v.hint };
      }
      rebuild();
      touched.add('negocio');
      return {
        ok: true,
        listas: allCollections(s.schema).map((c) => ({ chave: c.key, atributos: c.item_fields.map((f) => f.key) })),
      };
    }

    case 'preencher_campos': {
      const gravados: string[] = [];
      const erros: string[] = [];
      for (const c of (input.campos as Array<{ chave: string; valor: string; acrescentar?: boolean }>) ?? []) {
        const def = fields.get(c.chave);
        if (!def) {
          erros.push(`campo inexistente: ${c.chave}`);
          continue;
        }
        let v = limpo(c.valor);
        if (!v) {
          erros.push(`${c.chave}: valor vazio ou de enfeite não é gravado`);
          continue;
        }
        if (def.type === 'select' && def.options?.length && !def.options.includes(v)) {
          const achou = def.options.find((o) => slug(o) === slug(v));
          if (!achou) {
            erros.push(`${c.chave}: use uma das opções: ${def.options.join(' / ')}`);
            continue;
          }
          v = achou;
        }
        const atual = valueOf(cfg, c.chave);
        if ((c.acrescentar || def.accumulates) && atual && !atual.includes(v)) v = `${atual}\n${v}`;
        cfg.fields[c.chave] = { value: v, status: 'confirmado' };
        touched.add(c.chave);
        gravados.push(def.label);
      }
      return { gravados, erros };
    }

    case 'salvar_itens': {
      const c = cols.get(String(input.lista));
      if (!c) return { erro: `lista inexistente: ${input.lista}. Listas: ${[...cols.keys()].join(', ')}` };
      const list = [...(cfg.collections[c.key] ?? [])];
      let novos = 0, atualizados = 0, rejeitados = 0;
      for (const raw of (input.itens as unknown[]) ?? []) {
        const item = cleanItem(c, raw);
        const id = item[idKey(c)];
        if (!id) {
          rejeitados++;
          continue;
        }
        const i = list.findIndex((it) => slug(it?.[idKey(c)] ?? '') === slug(id));
        if (i >= 0) {
          const juntos: Record<string, string> = { ...list[i], ...item };
          // informou agora o que antes tinha dispensado: deixa de ser dispensado
          const sem = semNoItem(juntos).filter((k) => !item[k]);
          if (sem.length) juntos._sem = sem.join(',');
          else delete juntos._sem;
          list[i] = juntos;
          atualizados++;
        } else {
          list.push(item);
          novos++;
        }
      }
      cfg.collections[c.key] = list;
      cfg.declined.collections = cfg.declined.collections.filter((k) => k !== c.key);
      touched.add(c.key);
      return {
        novos, atualizados, total: list.length,
        ...(rejeitados ? { rejeitados, motivo: `item sem ${c.item_fields[0].label}` } : {}),
      };
    }

    case 'preencher_em_todos': {
      const c = cols.get(String(input.lista));
      const attr = String(input.atributo);
      const v = limpo(input.valor, 2000);
      if (!c || !c.item_fields.some((f) => f.key === attr)) return { erro: 'lista ou atributo inexistente' };
      if (!v) return { erro: 'valor vazio' };
      let n = 0;
      cfg.collections[c.key] = (cfg.collections[c.key] ?? []).map((it) => {
        if (String(it?.[attr] ?? '').trim()) return it;
        n++;
        return { ...it, [attr]: v };
      });
      touched.add(c.key);
      return { preenchidos: n };
    }

    case 'remover_item': {
      const c = cols.get(String(input.lista));
      if (!c) return { erro: 'lista inexistente' };
      const i = findIdx(c, String(input.identificador));
      if (i < 0) return { erro: 'item não encontrado' };
      cfg.collections[c.key].splice(i, 1);
      touched.add(c.key);
      return { ok: true, total: cfg.collections[c.key].length };
    }

    case 'dispensar': {
      const k = String(input.chave);
      if (input.atributo && input.identificador && cols.has(k)) {
        const c = cols.get(k)!;
        const attr = slug(String(input.atributo));
        if (!c.item_fields.some((f) => f.key === attr)) return { erro: `atributo inexistente em ${k}: ${input.atributo}` };
        const i = findIdx(c, String(input.identificador));
        if (i < 0) return { erro: `item não encontrado: ${input.identificador}` };
        const item = { ...cfg.collections[k][i] };
        const sem = new Set(semNoItem(item));
        sem.add(attr);
        item._sem = [...sem].join(',');
        cfg.collections[k][i] = item;
        touched.add(k);
        return { ok: true };
      }
      if (input.atributo && cols.has(k)) {
        const cur = cfg.declined.item_fields[k] ?? [];
        if (!cur.includes(String(input.atributo))) cur.push(String(input.atributo));
        cfg.declined.item_fields[k] = cur;
      } else if (fields.has(k)) {
        cfg.fields[k] = { value: '', status: 'ignorado' };
      } else if (cols.has(k)) {
        if (!cfg.declined.collections.includes(k)) cfg.declined.collections.push(k);
      } else return { erro: `chave inexistente: ${k}` };
      touched.add(k);
      return { ok: true };
    }

    case 'sem_mais_itens': {
      const k = String(input.lista);
      if (!cfg.declined.more.includes(k)) cfg.declined.more.push(k);
      return { ok: true };
    }

    case 'dispensar_restantes': {
      for (const f of allFields(s.schema)) if (!valueOf(cfg, f.key) && cfg.fields[f.key]?.status !== 'ignorado') cfg.fields[f.key] = { value: '', status: 'ignorado' };
      for (const c of allCollections(s.schema)) {
        if ((cfg.collections[c.key]?.length ?? 0) < (c.min ?? 1) && !cfg.declined.collections.includes(c.key)) cfg.declined.collections.push(c.key);
        if (!cfg.declined.more.includes(c.key)) cfg.declined.more.push(c.key);
      }
      s.meta.review_done = true;
      return { ok: true };
    }

    case 'criar_campo': {
      const sec = SECOES_QUE_CRESCEM.includes(String(input.secao)) ? String(input.secao) : 'conhecimento';
      const rotulo = String(input.rotulo ?? '').trim().slice(0, 60);
      if (!rotulo) return { erro: 'rótulo vazio' };
      let key = slug(rotulo) || 'campo';
      while (fields.has(key) || cols.has(key)) key += '_2';
      const opcoes = Array.isArray(input.opcoes) ? (input.opcoes as string[]).map((o) => String(o).slice(0, 40)).slice(0, 12) : [];
      const def: FieldDef = {
        key, label: rotulo, importance: 'optional', custom: true,
        type: input.tipo === 'select' && opcoes.length ? 'select' : input.tipo === 'textarea' ? 'textarea' : 'text',
        ...(opcoes.length ? { options: opcoes } : {}),
      };
      s.meta.extra_fields[sec] = [...(s.meta.extra_fields[sec] ?? []), def];
      const v = limpo(input.valor);
      if (v) cfg.fields[key] = { value: v, status: 'confirmado' };
      rebuild();
      touched.add(key);
      return { chave: key };
    }

    case 'criar_lista': {
      const sec = SECOES_QUE_CRESCEM.includes(String(input.secao)) ? String(input.secao) : 'catalogo';
      const rotulo = String(input.rotulo ?? '').trim().slice(0, 50);
      const attrs = ((input.atributos as string[]) ?? []).filter(Boolean).slice(0, 8);
      if (!rotulo || !attrs.length) return { erro: 'rótulo e atributos são obrigatórios' };
      // registro do que acontece no atendimento não é lista: já existe em Atendimentos/Pedidos
      if (/\b(pedidos?|solicita\w*|atendimentos?|chamados?|registros?|tickets?|reclama\w*|leads?|ocorr[eê]ncias?)\b/i.test(rotulo)) {
        return { erro: 'Não crie isso: atendimentos e chamados já ficam em Atendimentos, e vendas em Pedidos. Explique isso em uma frase e siga.' };
      }
      let key = slug(rotulo) || 'lista';
      while (fields.has(key) || cols.has(key)) key += '_2';
      const col = { ...hardenCollection({ key, label: rotulo, importance: 'optional', item_fields: attrs.map((a) => ({ key: slug(a), label: a, type: 'text' as const })) }, false), importance: 'optional' as const, custom: true };
      s.meta.extra_collections[sec] = [...(s.meta.extra_collections[sec] ?? []), col];
      rebuild();
      touched.add(key);
      return { chave: key, atributos: col.item_fields.map((f) => f.key) };
    }

    case 'mover_para_tabela': {
      const c = cols.get(String(input.lista));
      if (!c) return { erro: 'lista inexistente' };
      const { count } = await admin.from('tabelas').select('id', { count: 'exact', head: true }).eq('owner_id', ctx.userId);
      if ((count ?? 0) >= ctx.maxTabelas) return { erro: 'O plano atual não comporta mais tabelas. Diga isso e siga com a lista aqui mesmo.' };

      const { data: tab, error } = await admin
        .from('tabelas')
        .insert({ owner_id: ctx.userId, nome: c.label, proposito: `${c.label} do negócio, consultado pelo assistente ao responder` })
        .select('id, nome')
        .single();
      if (error) return { erro: 'não consegui criar a tabela' };

      const colunas = c.item_fields.map((f, i) => ({
        tabela_id: tab.id, chave: f.key, rotulo: f.label, ordem: i,
        tipo: PRICE_RE.test(f.key) ? 'moeda' : f.type === 'textarea' ? 'texto_longo' : 'texto',
        obrigatoria: !!f.required, identifica: i === 0, chave_primaria: i === 0, unica: i === 0,
      }));
      // estoque: a quantidade que a pessoa contou ("12 em estoque", "esgotado") vai para uma coluna de número,
      // que é a que a venda pelo chat consulta e baixa
      const campoQtd = c.item_fields.find((f) => /estoque|quantidade|qtd|stock|dispon/i.test(`${f.key} ${f.label}`));
      const qtdDe = (v: unknown) => {
        const t = String(v ?? '').toLowerCase();
        if (/esgotad|sem estoque|acabou|indispon|em falta/.test(t)) return '0';
        const n = /(\d+)/.exec(t);
        return n ? n[1] : '';
      };
      const comEstoque = s.meta.business_model === 'produto';
      if (comEstoque) {
        colunas.push({ tabela_id: tab.id, chave: 'estoque', rotulo: 'Estoque', ordem: colunas.length, tipo: 'numero', obrigatoria: false, identifica: false, chave_primaria: false, unica: false });
      }
      await admin.from('tabela_colunas').insert(colunas);
      const itens = cfg.collections[c.key] ?? [];
      if (itens.length) {
        await admin.from('tabela_linhas').insert(itens.map((dados) => ({
          tabela_id: tab.id,
          dados: comEstoque && campoQtd ? { ...dados, estoque: qtdDe(dados?.[campoQtd.key]) } : dados,
        })));
      }

      // a lista sai do documento: a fonte passa a ser a tabela
      cfg.collections[c.key] = [];
      if (!cfg.declined.collections.includes(c.key)) cfg.declined.collections.push(c.key);
      s.meta.tabela_oferecida = true;
      s.meta.tabelas_criadas = [...(s.meta.tabelas_criadas ?? []), tab.id];
      s.meta.listas_em_tabela = { ...(s.meta.listas_em_tabela ?? {}), [c.key]: tab.nome };
      if (ctx.s.assistant_id) await admin.from('assistente_tabelas').upsert({ assistant_id: ctx.s.assistant_id, tabela_id: tab.id });
      touched.add(c.key);
      return { ok: true, tabela: tab.nome, itens_levados: itens.length, mensagem: 'Diga que a tabela está em Dados e que ela pode atualizar lá quando quiser.' };
    }

    case 'lista_em_tabela': {
      const c = cols.get(String(input.lista));
      if (!c) return { erro: 'lista inexistente' };
      if (!cfg.declined.collections.includes(c.key)) cfg.declined.collections.push(c.key);
      s.meta.tabela_oferecida = true;
      touched.add(c.key);
      return { ok: true, mensagem: `A lista "${c.label}" fica na tabela${input.tabela ? ` "${String(input.tabela).slice(0, 80)}"` : ''}, em Dados.` };
    }

    case 'recusar_tabela':
      s.meta.tabela_recusada = true;
      return { ok: true };

    case 'configurar_agenda': {
      const { data: atual } = await admin.from('agenda_config').select('*').eq('owner_id', ctx.userId).maybeSingle();
      const novo: Record<string, unknown> = { owner_id: ctx.userId, ativa: true };
      if (input.horarios && typeof input.horarios === 'object') {
        const h: Record<string, Array<[string, string]>> = { ...(atual?.horarios ?? {}) };
        for (const [dia, faixas] of Object.entries(input.horarios as Record<string, unknown>)) {
          if (!/^[0-6]$/.test(dia) || !Array.isArray(faixas)) continue;
          h[dia] = faixas
            .filter((f): f is [string, string] => Array.isArray(f) && HORA_OK.test(String(f[0])) && HORA_OK.test(String(f[1])) && String(f[0]).padStart(5, '0') < String(f[1]).padStart(5, '0'))
            .map(([a, b]): [string, string] => [a.padStart(5, '0'), b.padStart(5, '0')])
            .slice(0, 4);
        }
        novo.horarios = h;
      }
      if (Number(input.duracao_min) >= 5) novo.duracao_min = Math.min(480, Math.round(Number(input.duracao_min)));
      if (Number(input.antecedencia_horas) >= 0 && input.antecedencia_horas != null) novo.antecedencia_horas = Math.min(720, Math.round(Number(input.antecedencia_horas)));
      if (Array.isArray(input.servicos)) {
        const porNome = new Map<string, Record<string, unknown>>((atual?.servicos ?? []).map((x: Record<string, unknown>) => [slug(String(x.nome)), x]));
        for (const x of input.servicos as Array<Record<string, unknown>>) {
          const nome = String(x.nome ?? '').trim().slice(0, 80);
          if (!nome) continue;
          const antes = porNome.get(slug(nome)) ?? {};
          porNome.set(slug(nome), {
            ...antes,
            nome,
            ...(Number(x.duracao_min) >= 5 ? { duracao_min: Math.min(480, Math.round(Number(x.duracao_min))) } : {}),
            ...(x.valor != null && Number.isFinite(Number(x.valor)) ? { valor: Number(x.valor) } : {}),
          });
        }
        novo.servicos = [...porNome.values()].slice(0, 40);
      }
      const { error } = await admin.from('agenda_config').upsert(novo);
      if (error) return { erro: 'Não consegui gravar a agenda.' };
      if (!/^sim/i.test(valueOf(cfg, 'usar_agenda'))) {
        cfg.fields.usar_agenda = { value: 'Sim, marca sozinho', status: 'confirmado' };
      }
      touched.add('usar_agenda');
      // o que a agenda ainda não sabe: o modelo pergunta antes de seguir
      const final = { ...(atual ?? {}), ...novo } as { horarios?: Record<string, unknown[]>; servicos?: Array<{ nome: string; duracao_min?: number; valor?: number }> };
      const falta: string[] = [];
      if (!Object.values(final.horarios ?? {}).some((f) => Array.isArray(f) && f.length)) falta.push('os dias e horários de atendimento');
      if (!final.servicos?.length) falta.push('os serviços que dá para marcar, com quanto tempo leva cada um');
      const semTempo = (final.servicos ?? []).filter((x) => !x.duracao_min).map((x) => x.nome);
      if (semTempo.length) falta.push(`quanto tempo leva: ${semTempo.join(', ')}`);
      return {
        ok: true,
        mensagem: falta.length
          ? `Agenda gravada e ligada. AINDA FALTA: ${falta.join('; ')}. Diga em poucas palavras como ficou e pergunte a próxima coisa que falta (uma só).`
          : 'Agenda gravada e ligada, completa. Diga em poucas palavras como ficou.',
      };
    }

    case 'desfazer': {
      const n = desfazer(s, Number(input.passos) || 1);
      touched.add('desfazer');
      return n ? { ok: true, versoes_voltadas: n, mensagem: 'O documento voltou. O ESTADO ATUAL do sistema ainda mostra a versão antiga desta mensagem: confie no resultado e diga, em uma frase, o que voltou.' } : { erro: 'Não há versão anterior para voltar.' };
    }
  }
  return { erro: `ferramenta desconhecida: ${name}` };
}

// ------------------------------------------------------------
// Prompt
// ------------------------------------------------------------

const STATIC_PROMPT = `Você é o Helpy. Ajuda o dono de um negócio a montar o assistente que vai atender as pessoas dele.

Pense assim: ele está contratando um funcionário e você escreve o treinamento. Tudo que você não perguntar é uma pergunta que o funcionário não vai saber responder.

COMO VOCÊ TRABALHA
Ao lado desta conversa há um documento com tudo que o assistente vai saber. Você o preenche com as ferramentas, e a pessoa vê cada campo mudando na hora. Toda informação que a pessoa der vai para o documento NA MESMA RESPOSTA — se ela colar uma lista de preços, salve todos os itens nessa resposta. Lista grande vai em lotes de até 20 itens por chamada de salvar_itens (pode chamar várias vezes seguidas); uma chamada gigante é cortada e nada é gravado.
Cada resultado de ferramenta traz o que foi gravado e o próximo assunto. Só diga que registrou o que as ferramentas confirmaram.
Se uma ferramenta devolver erro, corrija e tente de novo ou pergunte à pessoa.

PRIMEIRO, ENTENDA O NEGÓCIO
Assim que ficar claro o que a pessoa faz, chame definir_negocio com o modelo certo e, de preferência, desenhe o catálogo sob medida e reescreva os rótulos do núcleo na língua dela.
Atenção ao arquétipo: quem ENSINA ou TIRA DÚVIDA de aluno é "educacional" — o catálogo não tem preço. Quem ajuda cliente com problema é "suporte".

PENSE NO QUE O ASSISTENTE VAI PRECISAR
Antes de cada pergunta, imagine o assistente atendendo de verdade e pergunte o que ele não saberia responder. Uma loja precisa dos produtos, e cada produto precisa de preço, descrição e variações. Uma clínica precisa dos procedimentos com duração e valor. Um professor precisa da série dos alunos, do conteúdo e de como ensinar.
Cobre cada item: se a pessoa listou cinco produtos e deu preço de três, peça o preço dos outros dois pelo nome. Item sem dado obrigatório é uma resposta que o assistente não vai saber dar.
Se o negócio precisa de algo que o documento não tem, crie: um campo (criar_campo) ou uma lista (criar_lista). Não espere a pessoa pedir.

QUANDO A PESSOA NÃO QUER INFORMAR
Recusa vale para o que ela recusou, e só para isso:
- "não quero pôr o endereço" → dispensar o campo
- "o kit não tem preço fixo, não quero pôr" → dispensar com lista + atributo + identificador do item
- "não vou colocar preço em nada" → dispensar com lista + atributo (todos os itens)
- "nada de FAQ" → dispensar a lista
O dispensado aparece riscado na tela e ela pode reativar quando quiser. Se ela voltar atrás e informar, é só gravar normalmente.

DESFAZER
"Volta como estava", "desfaz", "apaguei sem querer", "não era isso" → ferramenta desfazer. Depois diga em uma frase o que voltou. Se ela quiser um dado específico de volta e você lembrar dele pela conversa, também pode simplesmente gravar de novo.

ARQUIVOS ANEXADOS
Quando vier um PDF, imagem ou planilha, leia tudo e grave o que servir para o documento: campos, itens das listas, perguntas frequentes, regras. PDF e imagem chegam já transcritos em texto. Planilha anexada vira sozinha uma tabela em Dados (o aviso diz qual): não copie as linhas para o documento; use a amostra para entender o negócio e, se ela for uma lista do documento (produtos, serviços…), chame lista_em_tabela. Diga em uma frase que a tabela foi criada e que ela atualiza em Dados quando quiser. O texto completo do arquivo fica guardado sozinho como material de apoio, e o assistente consulta ao atender — não copie o arquivo inteiro para os campos.
Diga em uma frase o que encontrou ("li a prova: 10 questões de adição e subtração para o 2º ano") e siga com o que ainda falta.
Se for prova, lista de exercícios ou atividade de aluno: o modelo é educacional, grave em regras que ele nunca entrega a resposta das questões (ele guia com perguntas e exemplos parecidos), e grave a série e o conteúdo.

CHAMADOS
Em algum momento pergunte se o assistente pode passar a conversa para uma pessoa da equipe (campo chamados_ativos). Se sim: em que situações abrir chamado, em quais não abrir, e se só quem tem uma senha pode abrir. Para um monitor de estudos sem ninguém para responder, sugira desligar.
"Ele nunca deve…" ou "não pode falar de…" são regras: grave em regras com acrescentar=true, na hora.

AGENDA
Se o negócio marca horário (salão, barbearia, clínica, aula, consultoria, loja com provador…), pergunte se ele quer que o assistente marque sozinho, deixe pendente para ele confirmar, ou não use agenda (campo usar_agenda). Negócio que não marca horário: não insista, deixe "Não usa agenda".
Se usar a agenda, a agenda só fica certa com estas respostas. Pergunte UMA de cada vez, na ordem, e grave cada uma com configurar_agenda assim que ouvir:
1. Dias e horários em que atende, e se tem pausa (almoço). Pausa vira duas faixas no mesmo dia (09:00–12:00 e 13:00–18:00).
2. Quanto tempo leva CADA serviço que dá para marcar. Serviços diferentes levam tempos diferentes (ex.: corte 1h, corte e barba 1h30): pergunte de cada um, nunca chute e nunca use um tempo só para todos.
3. O valor de cada serviço (ou "sem valor", se o horário não é cobrado, como hora para provar roupa).
4. Com quanta antecedência alguém pode marcar (ex.: até 2h antes).
5. Se quer registrar cada agendamento nos Dados com o valor (campo agenda_registrar).
6. Se qualquer pessoa pode marcar ou só quem entrou na conta (campo agenda_quem). Só pergunte se fizer sentido para o negócio; o padrão é qualquer pessoa.
O resultado de configurar_agenda diz o que ainda falta: pergunte isso antes de passar para outro assunto.

TUDO QUE A PESSOA CLICA, VOCÊ TAMBÉM FAZ
O documento à direita tem interruptores e caixinhas (ex.: o painel de chamados). Qualquer coisa que ela poderia clicar ela pode pedir no chat, e você faz na hora, sem mandar ela clicar:
- "desativa o ticket / não quero chamado" → preencher_campos chamados_ativos = "Não, ele resolve sozinho". "Ativa de novo" → "Sim".
- "coloca a senha 1234" → codigo_chamado = 1234 (e chamados_ativos = Sim, se estava desligado). "Tira a senha" → dispensar codigo_chamado.
- "não abre chamado pra reclamação de preço" → nunca_chamar_humano (acrescentar=true). "Só chama gente se…" → quando_chamar_humano.
- "Desliga a agenda" → usar_agenda = "Não usa agenda". "Quero confirmar antes" → "Sim, mas eu confirmo". "Abre sábado de manhã" / "o corte custa 45" → configurar_agenda.
- Trocar um valor que já existe → preencher_campos sem acrescentar substitui. Apagar um campo → dispensar.
- "Só quem tem login pode marcar" → agenda_quem = "Só quem entrou na conta".

PEDIDO QUE NÃO TEM OPÇÃO NO DOCUMENTO
A pessoa pode pedir um comportamento que não existe como campo ("não deixa marcar sem login", "não fala de concorrente", "pede o CEP antes de falar de frete", "só passa desconto para cliente cadastrado"). Nunca responda que não dá: entenda a intenção e grave em regras (acrescentar=true) como uma instrução clara e cumprível pelo atendente, no imperativo, com o que ele deve fazer no lugar. Ex.: "Para falar de pedido ou desconto, a pessoa precisa ter entrado na conta; se não entrou, peça para entrar (pedir_login) antes de seguir." Se existir um campo que resolve, use o campo. Confirme em uma frase como ficou a regra.
Depois de mudar, diga em poucas palavras o que ficou ("pronto, chamados desligados — ele resolve tudo sozinho").

VOCÊ É UMA PESSOA, NÃO UM FORMULÁRIO
Consultor experiente, português do Brasil, informal. Varia o tamanho da resposta. Pergunta concreta — nunca "mais alguma coisa?". Em geral uma pergunta por vez; quando a nota interna trouxer assuntos curtos agrupados, junte-os (no máximo 3) numa mensagem só, numerados e curtos, para a pessoa responder tudo de uma vez.

REAJA ANTES DE PERGUNTAR. Toda resposta começa reconhecendo o que a pessoa acabou de dizer, mostrando que você leu:
- ela mandou uma lista longa → "boa, são 38 produtos"
- ela deu um nome → "Max, então"
- ela contou algo específico → devolva o detalhe: "atendimento consultivo, entendi — isso muda como ele aborda"
- ela corrigiu → "corrigido"
Uma frase basta; não comece sempre com "Ótimo!" ou "Perfeito!".

APROFUNDE, NÃO REPITA. Antes de perguntar, olhe o documento: se a informação já existe, não pergunte de novo. Se dá para aprofundar a partir do que ela disse, aprofunde:
- "vendemos para todo o Brasil" → ruim: "entregam para quais estados?" · bom: "tem região onde o frete muda ou onde não entregam?"
- "loja em Campinas e e-commerce" → ruim: "vocês têm loja física?" · bom: "o estoque da loja e do site é o mesmo?"
Se ela responder vários itens de uma vez, reconheça o conjunto e mude de assunto.

ENTENDA A INTENÇÃO
- Respondeu, mesmo curto ou torto → grave. Resposta vaga é resposta: "qualquer cliente" vira publico_alvo = "Qualquer pessoa, sem perfil específico". Correção ("não, é 50") também é resposta.
- Recusou, de qualquer jeito ("não", "negativo", "deixa pra lá", "não se aplica", "n") → dispensar, na hora, e nunca mais toque no assunto.
- Não entendeu e devolveu pergunta → explique com um exemplo concreto e pergunte de novo.
- Mudou de assunto → siga com ela; o assunto anterior volta depois.
- Respondeu só parte das perguntas agrupadas → grave o que veio; o que faltou volta depois, sem repetir o que ela já respondeu.

O QUE O HELPY JÁ FAZ SOZINHO (nunca crie lista, campo ou tabela para isto)
- Conversas e pedidos de ajuda viram chamados em Atendimentos, com resumo, contato e status. A equipe assume e responde ali.
- Vendas fechadas no chat viram pedidos em Pedidos (itens, total, pagamento por Pix ou cartão), e o estoque da tabela baixa sozinho quando o pagamento cai. Isso depende da Carteira e de "Fechar a venda no chat?".
- Horários marcados ficam na Agenda. Contatos que o cliente deixa ficam no próprio atendimento e nos Relatórios.
Tabelas em Dados servem só para o que o assistente CONSULTA ao responder: produtos, serviços, preços, estoque, unidades. O assistente não escreve em tabelas. Se a pessoa pedir para "registrar pedidos", "guardar solicitações" ou "anotar clientes", explique em uma frase onde isso já aparece (Atendimentos, Pedidos, Agenda) e siga. Nunca ofereça isso por conta própria.

CAMPOS QUE SE CONFUNDEM
- tom_de_voz = o jeito de falar, inclusive listas de comportamento ("simpático, nunca pressionar").
- regras = proibições. Sempre acrescentar, nunca substituir.
- assuntos_cobertos = lista de temas. Não é FAQ.
- faq = pares pergunta/resposta concretos. Se ela citou a pergunta sem a resposta, salve só a pergunta e peça a resposta.
- horario = quando existe gente para assumir um chamado. O assistente funciona 24h.
- contatos = contatos que o assistente PASSA AO CLIENTE para falar com a empresa fora do chat. Não é para onde o Helpy avisa a equipe (chamados chegam em Atendimentos, no painel) nem canal do assistente.
  Com chamados ligados, o cliente JÁ fala com a equipe na própria conversa (a equipe assume o chamado e responde ali). Então o contato é só um extra opcional: pergunte uma vez só, no fim, deixando claro que pode pular. Ex.: "Quando alguém precisa de vocês, o chamado já cai no painel e vocês respondem por aqui mesmo. Quer deixar também um WhatsApp ou telefone para casos fora disso? Se preferir tudo pelo Helpy, é só pular." Nunca diga que esse contato é necessário para o cliente falar com vocês.
  Com chamados desligados, o contato é o único jeito de o cliente falar com alguém: aí vale perguntar normalmente.
- Pagamento, entrega, garantia, endereço ficam em "Como funciona". Se não houver campo, crie.

NUNCA PREENCHA COM ENFEITE
Nunca grave "Consultar", "Sob consulta", "A definir", "Varia", "N/A" ou parecido. Se ela não disse o preço, deixe o preço de fora do item. Campo vazio é uma pergunta que ainda será feita; "Consultar" é uma resposta errada para sempre.
Nunca invente dado que a pessoa não disse.

FORA DO ESCOPO
Você só monta este assistente. Se puxarem outro tema, uma frase avisando e volta ao assunto. Nada de JSON na resposta.
FORMATO: texto corrido e curto. Quando listar, use "- " no começo da linha; para destacar, **negrito** só no nome do item. Nada de títulos, tabelas ou outro markdown.
DESFAZER: quando a conversa trouxer "[O dono desfez mudanças…]", o que foi dito antes sobre aquilo não vale mais. O documento atual é a verdade: nunca cite como existente tabela, lista ou campo que não está nele.`;

function docState(s: Session): string {
  const linhas: string[] = [];
  const mats = s.meta.materiais ?? [];
  if (mats.length) {
    linhas.push(`Materiais de apoio guardados (o assistente lê o texto completo ao atender): ${mats.map((m) => `"${m.nome}" (${m.texto.length} caracteres; começa com: ${JSON.stringify(m.texto.slice(0, 200))})`).join('; ')}`);
  }
  linhas.push(`Modelo de negócio: ${s.meta.business_model ?? '(ainda não definido)'} · Ramo: ${s.meta.ramo ?? '(ainda não definido)'}`);
  for (const sec of s.schema.sections) {
    linhas.push(`\nSeção "${sec.label}" (${sec.key})`);
    for (const f of sec.fields) {
      const e = s.config.fields[f.key];
      const v = valueOf(s.config, f.key);
      const estado = e?.status === 'ignorado' ? 'DISPENSADO' : v ? `= ${JSON.stringify(v.slice(0, 300))}` : 'vazio';
      linhas.push(`  campo ${f.key} · ${f.label} [${f.importance}]${f.options ? ` opções: ${f.options.join(' / ')}` : ''} → ${estado}`);
    }
    for (const c of sec.collections) {
      const list = s.config.collections[c.key] ?? [];
      const dispensada = s.config.declined.collections.includes(c.key);
      linhas.push(`  lista ${c.key} · ${c.label} [${c.importance}] atributos: ${c.item_fields.map((f) => `${f.key}${f.required ? '*' : ''}`).join(', ')} → ${dispensada ? 'DISPENSADA' : `${list.length} itens`}`);
      list.slice(0, 40).forEach((item) => linhas.push(`    · ${JSON.stringify(item)}`));
      if (list.some((it) => it?._sem)) linhas.push('    (_sem = atributos que o dono não quis informar naquele item)');
      if (list.length > 40) linhas.push(`    … e mais ${list.length - 40}`);
    }
  }
  return `ESTADO ATUAL DO DOCUMENTO\n${linhas.join('\n')}`;
}

function goalNote(s: Session, goal: Goal) {
  const faltam = missingCritical(s.schema, s.config);
  const topo = `[nota interna — a pessoa não vê]
${faltam.length ? `Ainda falta (obrigatório): ${faltam.join(', ')}.` : 'Nada obrigatório faltando: já dá para publicar.'}`;
  if (goal.extras?.length) {
    const todos = [goal.text, ...goal.extras.map((e) => e.text)];
    return `${topo}
PRÓXIMOS ASSUNTOS (curtos, vão juntos):
${todos.map((t, i) => `${i + 1}) ${t}`).join('\n')}
Primeiro grave o que a mensagem trouxer. Depois pergunte esses ${todos.length} assuntos numa mensagem só, com as SUAS palavras: perguntas curtas e numeradas, e diga que dá para responder tudo junto, do jeito da pessoa. Se algum já ficou respondido pelo que ela acabou de dizer, pule.`;
  }
  return `${topo}
PRÓXIMO ASSUNTO: ${goal.text}
Primeiro grave o que a mensagem trouxer. Depois puxe o próximo assunto com as SUAS palavras, uma pergunta só.`;
}

/** O arquivo como bloco que a IA lê. */
function blocoDoAnexo(a: Anexo): Anthropic.Beta.BetaContentBlockParam {
  if (a.tipo === 'application/pdf') {
    return { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: a.dados }, title: a.nome };
  }
  if (a.tipo.startsWith('image/')) {
    return { type: 'image', source: { type: 'base64', media_type: a.tipo as 'image/png', data: a.dados } };
  }
  return { type: 'text', text: `Conteúdo do arquivo "${a.nome}":\n${textoDoAnexo(a)}` };
}

function textoDoAnexo(a: Anexo) {
  return new TextDecoder().decode(Uint8Array.from(atob(a.dados), (c) => c.charCodeAt(0)));
}

/**
 * Transcreve o arquivo em texto: vira material de consulta do assistente e é
 * o que o construtor lê (texto custa bem menos que o PDF/imagem em cada
 * rodada). `completo` é falso se a transcrição foi cortada pelo tamanho.
 */
async function virarMaterial(a: Anexo, usage: ReturnType<typeof emptyUsage>): Promise<Material & { completo: boolean }> {
  let texto = '';
  let completo = true;
  if (a.tipo.startsWith('text/')) {
    texto = textoDoAnexo(a);
  } else {
    const res = await anthropic.messages.create({
      model: MODELS.atendimento,
      max_tokens: 16000,
      output_config: { effort: 'low' }, // transcrever não pede raciocínio
      messages: [{
        role: 'user',
        content: [
          blocoDoAnexo(a) as Anthropic.ContentBlockParam,
          {
            type: 'text',
            text:
              'Transcreva fielmente todo o conteúdo deste arquivo em texto simples, em português, para um assistente consultar depois. ' +
              'Mantenha títulos, questões numeradas, alternativas, valores e nomes exatamente como estão. Tabelas: uma linha por registro, no formato "coluna: valor". ' +
              'Se houver gabarito ou respostas, transcreva numa seção "GABARITO". Imagens e gráficos: descreva em uma frase o que mostram. ' +
              'Não resuma, não comente, não acrescente nada.',
          },
        ],
      }],
    });
    addUsage(usage, res.usage);
    texto = textOf(res.content as Array<{ type: string; text?: string }>);
    completo = res.stop_reason !== 'max_tokens';
  }
  return {
    completo,
    id: crypto.randomUUID().slice(0, 8),
    nome: a.nome.slice(0, 120),
    tipo: a.tipo,
    texto: texto.trim().slice(0, MAX_MATERIAL),
    em: new Date().toISOString(),
  };
}

const ehPlanilha = (a: Anexo) => a.tipo === 'text/csv' || /\.(xlsx|csv|tsv)$/i.test(a.nome);

/**
 * Planilha anexada vira tabela em Dados (uma por aba com dados), ligada ao
 * assistente. O construtor recebe só o resumo e uma amostra, não as linhas.
 */
async function planilhaParaTabela(ctx: Ctx, a: Anexo): Promise<string | null> {
  const todasAbas = lerAbas(textoDoAnexo(a));
  if (!todasAbas.length) return null;
  // aba de instruções, testes ou exemplos não é dado para o atendimento: vira só contexto
  const ehNota = (nome: string | null) => !!nome && /leia|readme|instru|teste|exemplo|sobre|ajuda|como usar|legenda/i.test(nome);
  const notas = todasAbas.filter((x) => ehNota(x.nome));
  const abas = todasAbas.filter((x) => !ehNota(x.nome));
  const contexto = notas.map((x) => `Aba "${x.nome}" (não virou tabela; é instrução/teste da planilha):\n${[x.cabecalho, ...x.linhas.slice(0, 30)].map((l) => l.join(' | ')).join('\n')}`).join('\n\n');
  if (!abas.length) return null;
  const { count } = await admin.from('tabelas').select('id', { count: 'exact', head: true }).eq('owner_id', ctx.userId);
  const cabem = Math.max(0, ctx.maxTabelas - (count ?? 0));
  if (!cabem) return null;
  const base = a.nome.replace(/\.(xlsx|csv|tsv|txt)$/i, '').replace(/[_]+/g, ' ').trim().slice(0, 60) || 'Planilha';
  const partes: string[] = [];
  for (const aba of abas.slice(0, cabem)) {
    const nome = (abas.length > 1 && aba.nome ? `${base} – ${aba.nome}` : base).slice(0, 80);
    const { data: tab, error } = await admin.from('tabelas')
      .insert({ owner_id: ctx.userId, nome, proposito: `Dados de "${a.nome}", consultados pelo assistente ao responder` })
      .select('id, nome').single();
    if (error || !tab) continue;
    const colunas = colunasDe(aba.cabecalho, aba.linhas);
    const { error: eCol } = await admin.from('tabela_colunas').insert(colunas.map((c, i) => ({ ...c, tabela_id: tab.id, identifica: i === 0 })));
    if (eCol) {
      await admin.from('tabelas').delete().eq('id', tab.id);
      continue;
    }
    const registros = registrosDe(colunas, aba.linhas);
    for (let i = 0; i < registros.length; i += 500) {
      await admin.from('tabela_linhas').insert(registros.slice(i, i + 500).map((dados) => ({ tabela_id: tab.id, dados })));
    }
    ctx.s.meta.tabelas_criadas = [...(ctx.s.meta.tabelas_criadas ?? []), tab.id];
    if (ctx.s.assistant_id) await admin.from('assistente_tabelas').upsert({ assistant_id: ctx.s.assistant_id, tabela_id: tab.id });
    const amostra = registros.slice(0, 12)
      .map((r) => colunas.filter((c) => r[c.chave]).map((c) => `${c.rotulo}: ${r[c.chave].slice(0, 80)}`).join(' | '))
      .join('\n');
    partes.push(`Tabela "${tab.nome}" (${registros.length} linhas). Colunas: ${colunas.map((c) => `${c.rotulo} (${c.tipo})`).join(', ')}.\nPrimeiras linhas:\n${amostra}`);
  }
  if (!partes.length) return null;
  const sobrou = abas.length - Math.min(abas.length, cabem);
  return [
    `A planilha "${a.nome}" já virou ${partes.length === 1 ? 'uma tabela' : `${partes.length} tabelas`} em Dados, ligada${partes.length === 1 ? '' : 's'} a este assistente. Ele consulta sozinho ao atender: não copie as linhas para o documento.`,
    ...partes,
    sobrou ? `(${sobrou} aba(s) ficaram de fora: o plano não comporta mais tabelas. Avise a pessoa.)` : '',
    contexto,
  ].filter(Boolean).join('\n\n');
}

function validarAnexos(bruto: unknown): Anexo[] {
  if (!Array.isArray(bruto) || !bruto.length) return [];
  if (bruto.length > MAX_ANEXOS) throw new UserError(`Mande até ${MAX_ANEXOS} arquivos por mensagem.`);
  return bruto.map((x) => {
    const a = (x ?? {}) as Record<string, unknown>;
    const nome = String(a.nome ?? 'arquivo').slice(0, 120);
    const tipo = String(a.tipo ?? '');
    const dados = String(a.dados ?? '');
    if (!TIPOS_ANEXO.includes(tipo)) {
      throw new UserError(`"${nome}": mande PDF, imagem (PNG, JPG), planilha (.xlsx ou .csv) ou texto. Documento do Word: salve como PDF.`);
    }
    if (!dados || dados.length > MAX_ANEXO_B64) throw new UserError(`"${nome}" passa de 6 MB.`);
    return { nome, tipo, dados };
  });
}

async function chat(s: Session, userText: string, ctx: Ctx, anexos: Anexo[] = []) {
  const model = MODELS.builder;
  const usage = emptyUsage();
  const usageMateriais = emptyUsage();
  s.meta.turno += 1;
  s.meta.pendencias_tabela = await pendenciasDasTabelas(s);
  let goal = nextGoal(s);

  // Antes da conversa, cada arquivo vira o que o construtor lê:
  //  - planilha → tabela em Dados (ele recebe só o resumo e uma amostra)
  //  - PDF e imagem → texto transcrito pelo modelo barato (o mesmo texto
  //    fica como material de consulta); se a transcrição sair cortada, vai
  //    o arquivo original, para não perder nada
  //  - texto → como está
  const preparados = await Promise.all(anexos.map(async (a) => {
    try {
      if (ehPlanilha(a)) {
        const resumo = await planilhaParaTabela(ctx, a);
        if (resumo) return { bloco: { type: 'text', text: resumo } as Anthropic.Beta.BetaContentBlockParam, material: null };
      }
      const m = await virarMaterial(a, usageMateriais);
      const { completo, ...material } = m;
      const bloco: Anthropic.Beta.BetaContentBlockParam = !a.tipo.startsWith('text/') && completo && m.texto.trim()
        ? { type: 'text', text: `Conteúdo do arquivo "${a.nome}" (transcrito):\n${m.texto}` }
        : blocoDoAnexo(a);
      return { bloco, material: material as Material };
    } catch (e) {
      console.error('[anexo]', a.nome, (e as Error)?.message ?? e);
      return { bloco: blocoDoAnexo(a), material: null };
    }
  }));

  // os avisos de desfazer entram como nota antes da próxima fala do dono: sem
  // isso a IA lê a conversa antiga e trata como feito o que foi desfeito
  const recentes = s.messages.slice(-34);
  const history: Anthropic.Beta.BetaMessageParam[] = [];
  let notas: string[] = [];
  const comNotas = (texto: string) => (notas.length ? `${notas.map((n) => `[O dono desfez mudanças no documento: ${n} O que foi combinado na conversa sobre isso não vale mais; o documento atual é a verdade.]`).join('\n')}\n\n${texto}` : texto);
  for (const m of recentes) {
    if (m.role === 'aviso') {
      notas.push(m.content);
      continue;
    }
    if (m.role !== 'user' && m.role !== 'assistant') continue;
    const texto = m.anexos?.length ? `${m.content}\n[anexou: ${m.anexos.join(', ')}]` : m.content;
    if (m.role === 'user') {
      history.push({ role: 'user', content: comNotas(texto) });
      notas = [];
    } else {
      history.push({ role: 'assistant', content: texto });
    }
  }
  // a conversa precisa começar pela fala do dono
  while (history.length && history[0].role !== 'user') history.shift();
  history.push({
    role: 'user',
    content: [
      ...preparados.map((p) => p.bloco),
      { type: 'text', text: comNotas(userText) },
      // ponto de cache: nas rodadas seguintes desta resposta, tudo até aqui sai por 10%
      { type: 'text', text: goalNote(s, goal), cache_control: { type: 'ephemeral' } },
    ],
  });

  // instruções fixas em cache; o estado do documento muda a cada turno
  const system: Anthropic.Beta.BetaTextBlockParam[] = [
    { type: 'text', text: STATIC_PROMPT, cache_control: { type: 'ephemeral' } },
    { type: 'text', text: docState(s) },
  ];
  const usesFallback = /claude-(sonnet|opus)-5-5/.test(model);

  // nota do sistema no fim do último turno da pessoa (a conversa precisa alternar papéis)
  const anotar = (nota: string) => {
    const ultimo = history[history.length - 1];
    if (ultimo?.role === 'user' && Array.isArray(ultimo.content)) {
      (ultimo.content as Anthropic.Beta.BetaContentBlockParam[]).push({ type: 'text', text: nota });
    } else history.push({ role: 'user', content: nota });
  };

  let reply = '';
  for (let i = 0; i < 10; i++) {
    const res = await anthropic.beta.messages.create({
      model,
      max_tokens: 8000,
      system,
      tools: TOOLS,
      messages: history,
      output_config: { effort: 'medium' },
      ...(usesFallback ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' } : {}),
    } as Anthropic.Beta.MessageCreateParamsNonStreaming);
    addUsage(usage, res.usage);

    if (res.stop_reason === 'refusal') {
      reply = 'Não consigo ajudar com isso. Vamos voltar ao seu assistente?';
      break;
    }
    const text = textOf(res.content as Array<{ type: string; text?: string }>);
    if (text) reply = text;

    // resposta cortada no meio (ex.: catálogo inteiro numa chamada só): a
    // ferramenta incompleta não roda; pede para gravar em lotes menores
    if (res.stop_reason === 'max_tokens') {
      const usou = res.content.some((b) => b.type === 'tool_use');
      if (!usou || i >= 8) break;
      if (text) history.push({ role: 'assistant', content: text });
      anotar('[sistema] Sua última resposta ficou grande demais e foi cortada: nada foi gravado. Grave de novo em lotes de no máximo 20 itens por chamada de salvar_itens, até terminar.');
      reply = '';
      continue;
    }

    if (res.stop_reason === 'pause_turn') {
      history.push({ role: 'assistant', content: res.content as Anthropic.Beta.BetaContentBlockParam[] });
      continue;
    }
    if (res.stop_reason !== 'tool_use') break;

    history.push({ role: 'assistant', content: res.content as Anthropic.Beta.BetaContentBlockParam[] });
    const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    const usos = res.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use');
    for (const [n, b] of usos.entries()) {
      let out: Record<string, unknown>;
      try {
        out = await runTool(ctx, b.name, b.input as Record<string, unknown>);
      } catch (e) {
        out = { erro: (e as Error).message };
      }
      // o último resultado leva o próximo assunto, já com o documento atualizado
      if (n === usos.length - 1) {
        goal = nextGoal(s);
        out = { ...out, proximo_assunto: goal.text, falta_obrigatorio: missingCritical(s.schema, s.config) };
      }
      results.push({ type: 'tool_result', tool_use_id: b.id, content: JSON.stringify(out), ...(out.erro ? { is_error: true } : {}) });
    }
    history.push({ role: 'user', content: results });
  }

  // terminou sem texto (muitas rodadas de ferramentas): pede só a resposta para a pessoa
  if (!reply) {
    try {
      anotar('[sistema] Agora responda à pessoa em poucas frases: o que você gravou no documento e o próximo assunto. Sem ferramentas.');
      const fim = await anthropic.beta.messages.create({
        model, max_tokens: 1500, system, tools: TOOLS, tool_choice: { type: 'none' }, messages: history,
        ...(usesFallback ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' } : {}),
      } as Anthropic.Beta.MessageCreateParamsNonStreaming);
      addUsage(usage, fim.usage);
      reply = textOf(fim.content as Array<{ type: string; text?: string }>);
    } catch (e) {
      console.error('[builder] resposta final', (e as Error).message);
    }
  }

  conferirGrupo(s); // com o que esta mensagem gravou: ela respondeu o grupo anterior?
  marcarPergunta(s, goal);
  if (!reply) reply = 'Recebi e já gravei o que deu no documento. Quer que eu continue de onde parei?';

  const novos = preparados.map((p) => p.material).filter((m): m is Material => !!m && !!m.texto);
  if (novos.length) s.meta.materiais = [...(s.meta.materiais ?? []), ...novos].slice(-MAX_MATERIAIS);

  s.messages = [
    ...s.messages,
    { role: 'user', content: userText, ...(anexos.length ? { anexos: anexos.map((a) => a.nome) } : {}) },
    { role: 'assistant', content: reply, id: crypto.randomUUID().slice(0, 8) },
  ];
  return { reply, usage, usageMateriais, model };
}

/** Resume a conversa de montagem no que o dono quer, para o assistente seguir. */
async function resumirIntencao(s: Session): Promise<string> {
  const conversa = conversaDe(s.messages).filter((m) => m.content?.trim()).slice(-60);
  if (conversa.length < 2) return s.meta.briefing ?? '';
  const texto = conversa
    .map((m) => `${m.role === 'user' ? 'DONO' : 'HELPY'}: ${m.content.slice(0, 1500)}${m.anexos?.length ? ` [anexou: ${m.anexos.join(', ')}]` : ''}`)
    .join('\n');
  const usage = emptyUsage();
  const res = await anthropic.messages.create({
    model: MODELS.atendimento,
    max_tokens: 2000,
    output_config: { effort: 'low' },
    messages: [{
      role: 'user',
      content:
        'Abaixo está a conversa em que o dono de um negócio montou um assistente virtual. Escreva, em tópicos curtos começando com "- ", ' +
        'o que o dono quer deste assistente e que um atendente precisa lembrar: objetivo, público, jeito de tratar as pessoas, ' +
        'o que evitar, como usar os arquivos anexados, preferências e cuidados ditos na conversa. Só o que o dono disse ou deixou claro; ' +
        'nada de dados que já estão em ficha (preço, endereço). Máximo 12 tópicos.\n\n' + texto,
    }],
  });
  addUsage(usage, res.usage);
  // o resumo ao publicar é custo do Helpy, não uma "mensagem de montagem" do dono: não entra na cota do montador
  await logUsage(admin, s.owner_id, s.assistant_id, 'atendimento', MODELS.atendimento, usage);
  return textOf(res.content as Array<{ type: string; text?: string }>).slice(0, 2500);
}

// ------------------------------------------------------------
// Handler
// ------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const user = await requireUser(req);
    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? 'load');
    const assistantId: string | null = body.assistant_id || null;
    // montar assistente é da empresa: funcionário e cliente não gastam IA aqui
    const { data: quem } = await admin.from('profiles').select('tipo').eq('id', user.id).maybeSingle();
    if (quem?.tipo && quem.tipo !== 'empresa') throw new UserError('Só a conta da empresa monta assistentes.', 403);

    if (assistantId) {
      const { data } = await admin.from('assistants').select('id').eq('id', assistantId).eq('owner_id', user.id).maybeSingle();
      if (!data) throw new UserError('Assistente não encontrado.', 404);
    }

    if (action === 'load') {
      const s = await loadSession(user.id, assistantId);
      const { payload } = await planInfo(user.id);
      return json({ ...sessionPayload(s), messages: s.messages, publico: await publicInfo(assistantId), plano: payload });
    }

    if (action === 'message') {
      const anexos = validarAnexos(body.anexos);
      const text = String(body.message ?? '').trim().slice(0, 12000) || (anexos.length ? 'Segue o arquivo.' : '');
      if (!text) throw new UserError('Mensagem vazia.');
      const { plan, payload } = await planInfo(user.id);
      if (payload.expirado) throw new UserError('Seu teste grátis terminou. Escolha um plano para continuar.', 402);
      if (!plan.builderIA) {
        throw new UserError(`Montar conversando com a IA não faz parte do plano ${plan.nome}. Preencha o documento ao lado.`, 402);
      }
      if (payload.builderRestantes <= 0) {
        throw new UserError('Você usou todas as mensagens de montagem deste mês. O documento continua editável à mão.', 429);
      }

      const s = await loadSession(user.id, assistantId);
      const before = JSON.stringify(s.config);
      const { reply, usage, usageMateriais, model } = await chat(s, text, { s, userId: user.id, touched: new Set(), maxTabelas: plan.tabelas }, anexos);
      // a pessoa cancelou a resposta (fechou o pedido): o documento fica como estava
      if (req.signal?.aborted) {
        await logUsage(admin, user.id, assistantId, 'builder', model, usage);
        return json({ cancelado: true });
      }
      await saveSession(s);
      // a resposta guarda a versão mais nova do documento logo depois dela: é o
      // ponto para onde "desfazer até aqui" volta
      const ultima = s.messages[s.messages.length - 1];
      if (ultima?.role === 'assistant') {
        ultima.marco = s.historico[0]?.em ?? '';
        await saveSession(s);
      }
      await logUsage(admin, user.id, assistantId, 'builder', model, usage);
      // a transcrição dos arquivos é Haiku; entra no custo sem contar como mensagem de montagem
      if (usageMateriais.input) await logUsage(admin, user.id, assistantId, 'atendimento', MODELS.atendimento, usageMateriais);

      // o que mudou, para a tela piscar os campos certos
      const after = s.config;
      const prev = JSON.parse(before) as Config;
      const ops = [
        ...Object.keys(after.fields).filter((k) => JSON.stringify(after.fields[k]) !== JSON.stringify(prev.fields[k])),
        ...Object.keys(after.collections).filter((k) => JSON.stringify(after.collections[k]) !== JSON.stringify(prev.collections[k])),
      ].map((key) => ({ key }));

      return json({
        ...sessionPayload(s),
        message: reply,
        ops,
        plano: { ...payload, builderRestantes: Math.max(0, payload.builderRestantes - 1) },
      });
    }

    if (action === 'set_model') {
      const modelo = String(body.modelo) as Modelo;
      if (!MODELOS.includes(modelo)) throw new UserError('Modelo de negócio inválido.');
      const s = await loadSession(user.id, assistantId);
      s.meta.business_model = modelo;
      if (body.ramo) s.meta.ramo = String(body.ramo).slice(0, 80);
      s.meta.catalogo = null;
      await saveSession(s);
      return json(sessionPayload(s));
    }

    if (action === 'add_field') {
      const s = await loadSession(user.id, assistantId);
      const sec = SECOES_QUE_CRESCEM.includes(String(body.section)) ? String(body.section) : 'conhecimento';
      const rotulo = String(body.label ?? '').trim().slice(0, 60);
      if (!rotulo) throw new UserError('Dê um nome ao campo.');
      let key = slug(rotulo) || 'campo';
      const existentes = new Set([...allFields(s.schema).map((f) => f.key), ...allCollections(s.schema).map((c) => c.key)]);
      while (existentes.has(key)) key += '_2';
      s.meta.extra_fields[sec] = [
        ...(s.meta.extra_fields[sec] ?? []),
        { key, label: rotulo, type: body.type === 'textarea' ? 'textarea' : 'text', importance: 'optional', hint: String(body.hint ?? '').slice(0, 160) || undefined, custom: true },
      ];
      await saveSession(s);
      return json(sessionPayload(s));
    }

    if (action === 'definir_venda') {
      // ligar/desligar a venda pelo chat direto da Carteira (sem IA)
      if (!assistantId) throw new UserError('Escolha o assistente.');
      const { data: a } = await admin.from('assistants').select('config').eq('id', assistantId).eq('owner_id', user.id).maybeSingle();
      if (!a) throw new UserError('Assistente não encontrado.', 404);
      const campos = {
        venda_no_chat: { value: body.vender ? VENDA_SIM : VENDA_NAO, status: 'confirmado' },
        venda_estoque: { value: body.estoque === false ? 'Não mexer no estoque' : 'Sim, baixa na tabela de Dados', status: 'confirmado' },
        // regra de frete escolhida na Carteira (texto livre: "R$ 12", "grátis acima de R$ 100, senão R$ 12", "só retirada")
        ...(typeof body.frete === 'string'
          ? { frete_chat: body.frete.trim() ? { value: body.frete.trim().slice(0, 200), status: 'confirmado' } : { value: '', status: 'vazio' } }
          : {}),
      };
      const config = normalizeConfig(a.config);
      Object.assign(config.fields, campos);
      await admin.from('assistants').update({ config }).eq('id', assistantId).eq('owner_id', user.id);
      // a edição aberta no montador também passa a ter a mesma escolha
      const { data: abertas } = await admin.from('builder_sessions').select('id, config').eq('owner_id', user.id).eq('assistant_id', assistantId).eq('status', 'active');
      for (const sessao of abertas ?? []) {
        const c = normalizeConfig(sessao.config);
        Object.assign(c.fields, campos);
        await admin.from('builder_sessions').update({ config: c }).eq('id', sessao.id);
      }
      return json({ ok: true, vender: !!body.vender, estoque: body.estoque !== false });
    }

    if (action === 'ensinar') {
      // resposta da equipe a um aviso ou a uma pergunta sem resposta: vira
      // pergunta frequente do assistente, sem passar pelo montador (sem IA)
      if (!assistantId) throw new UserError('Escolha o assistente.');
      const pergunta = String(body.pergunta ?? '').trim().slice(0, 300);
      const resposta = String(body.resposta ?? '').trim().slice(0, 2000);
      if (!pergunta || !resposta) throw new UserError('Escreva a resposta.');
      const { data: a } = await admin.from('assistants').select('config').eq('id', assistantId).eq('owner_id', user.id).maybeSingle();
      if (!a) throw new UserError('Assistente não encontrado.', 404);
      // equipe: confirmada em Avisos, o atendimento dá prioridade a ela
      const item = { pergunta, resposta, equipe: 'sim' };
      const juntar = (cfgIn: Partial<Config> | null) => {
        const c = normalizeConfig(cfgIn);
        const faq = (c.collections.faq ?? []).filter((x) => String(x.pergunta ?? '').trim().toLowerCase() !== pergunta.toLowerCase());
        c.collections.faq = [...faq, item].slice(-200);
        return c;
      };
      await admin.from('assistants').update({ config: juntar(a.config) }).eq('id', assistantId).eq('owner_id', user.id);
      const { data: abertas } = await admin.from('builder_sessions').select('id, config').eq('owner_id', user.id).eq('assistant_id', assistantId).eq('status', 'active');
      for (const sessao of abertas ?? []) await admin.from('builder_sessions').update({ config: juntar(sessao.config) }).eq('id', sessao.id);
      const agora = new Date().toISOString();
      if (body.alerta_id) {
        await admin.from('alertas').update({ visto_em: agora, resposta, respondido_em: agora }).eq('id', String(body.alerta_id)).eq('owner_id', user.id);
      }
      let entregue = false;
      if (body.lacuna_id) {
        const { data: g } = await admin.from('assistant_gaps').update({ resolvida: true }).eq('id', String(body.lacuna_id)).eq('assistant_id', assistantId).select('conversa_id').maybeSingle();
        // quem perguntou ainda está na conversa: a resposta chega para ele também
        // o assistente recebe a informação e continua o atendimento de quem perguntou
        if (g?.conversa_id) entregue = await retomarComRetorno(admin, g.conversa_id, user.id, { pergunta, resposta }).catch((e) => {
          console.error('[ensinar] retomar', e);
          return false;
        });
      }
      return json({ ok: true, entregue });
    }

    if (action === 'undo') {
      const s = await loadSession(user.id, assistantId);
      const antes = { config: structuredClone(s.config), meta: structuredClone(s.meta), schema: s.schema };
      if (!desfazer(s, 1)) throw new UserError('Não há mais nada para desfazer.');
      const removidas = await apagarTabelasDesfeitas(user.id, antes.meta, s.meta);
      s.messages = [...s.messages, { role: 'aviso', content: `Desfiz um passo. ${oQueVoltou(antes, s, removidas)}` }];
      await saveSession(s);
      return json({ ...sessionPayload(s), messages: s.messages });
    }

    if (action === 'undo_ate') {
      // volta o documento e a conversa para logo depois de uma resposta do Helpy
      const s = await loadSession(user.id, assistantId);
      const i = s.messages.findIndex((m) => m.role === 'assistant' && m.id && m.id === String(body.mensagem ?? ''));
      const alvo = s.messages[i];
      if (i < 0 || alvo.marco === undefined) throw new UserError('Não dá para voltar até essa mensagem.');
      const antes = { config: structuredClone(s.config), meta: structuredClone(s.meta), schema: s.schema };
      const limite = alvo.marco ? new Date(alvo.marco).getTime() : -Infinity;
      let passos = 0;
      while (s.historico.length && new Date(s.historico[0].em).getTime() > limite) passos += desfazer(s, 1);
      const removidas = passos ? await apagarTabelasDesfeitas(user.id, antes.meta, s.meta) : [];
      const sairam = s.messages.length - (i + 1);
      s.messages = [
        ...s.messages.slice(0, i + 1),
        { role: 'aviso', content: `Voltei até aqui${sairam ? ` (${sairam} ${sairam === 1 ? 'mensagem saiu' : 'mensagens saíram'})` : ''}. ${passos ? oQueVoltou(antes, s, removidas) : 'O documento já estava assim.'}` },
      ];
      s.historicoMexido = true;
      await saveSession(s);
      return json({ ...sessionPayload(s), messages: s.messages });
    }

    if (action === 'remove_material') {
      const s = await loadSession(user.id, assistantId);
      s.meta.materiais = (s.meta.materiais ?? []).filter((m) => m.id !== String(body.material_id));
      await saveSession(s);
      return json(sessionPayload(s));
    }

    if (action === 'finalize') {
      const s = await loadSession(user.id, assistantId);
      if (!s.meta.business_model) throw new UserError('Conte o que o negócio faz (ou escolha o tipo de negócio) antes de publicar.');
      const faltando = missingCritical(s.schema, s.config);
      if (faltando.length) throw new UserError(`Ainda falta: ${faltando.join(', ')}.`);

      const { plan, payload } = await planInfo(user.id);
      if (payload.expirado) throw new UserError('Seu teste grátis terminou. Escolha um plano para publicar.', 402);

      // o assistente leva a memória da montagem: o que o dono quer e a conversa
      try {
        s.meta.briefing = await resumirIntencao(s);
      } catch (e) {
        console.error('[briefing]', (e as Error).message);
      }
      s.meta.conversa = conversaDe(s.messages).slice(-80);

      const name = valueOf(s.config, 'nome_assistente') || valueOf(s.config, 'nome_negocio') || 'Assistente';
      const row = {
        name: name.slice(0, 80),
        business_type: s.meta.ramo,
        business_model: s.meta.business_model,
        schema: s.schema,
        config: s.config,
        meta: s.meta,
      };

      let assistant;
      if (assistantId) {
        const { data, error } = await admin.from('assistants').update(row).eq('id', assistantId).select('*').single();
        if (error) throw error;
        assistant = data;
      } else {
        const { count } = await admin.from('assistants').select('id', { count: 'exact', head: true }).eq('owner_id', user.id);
        if ((count ?? 0) >= plan.assistentes) {
          throw new UserError(`O plano ${plan.nome} permite ${plan.assistentes} assistente${plan.assistentes > 1 ? 's' : ''}. Mude de plano para criar mais.`, 402);
        }
        const { data, error } = await admin
          .from('assistants')
          .insert({ ...row, owner_id: user.id, public_token: token(), is_public: true })
          .select('*')
          .single();
        if (error) throw error;
        assistant = data;
      }

      // tabelas criadas durante a montagem passam a ser consultadas por ele
      // (só as que são desta conta: a lista mora na sessão, que o navegador consegue editar)
      const pedidas = (s.meta.tabelas_criadas ?? []).filter((id: unknown) => typeof id === 'string');
      const { data: minhas } = pedidas.length
        ? await admin.from('tabelas').select('id').eq('owner_id', user.id).in('id', pedidas)
        : { data: [] };
      const criadas = (minhas ?? []).map((t) => t.id);
      if (criadas.length) {
        await admin.from('assistente_tabelas').upsert(criadas.map((tabela_id) => ({ assistant_id: assistant.id, tabela_id })));
      }

      await admin.from('builder_sessions').update({ status: 'done', assistant_id: assistant.id }).eq('id', s.id);
      // loja que ainda não vende pelo chat: a tela sugere a Carteira (sem gastar mensagem do montador)
      const vendeProduto = s.meta.business_model === 'produto' || s.meta.business_model === 'assinatura';
      return json({ assistant, sugerir_venda: vendeProduto && !/^sim/i.test(valueOf(s.config, 'venda_no_chat')) });
    }

    if (action === 'reset') {
      let q = admin.from('builder_sessions').update({ status: 'done' }).eq('owner_id', user.id).eq('status', 'active');
      q = assistantId ? q.eq('assistant_id', assistantId) : q.is('assistant_id', null);
      await q;
      const s = await createSession(user.id, assistantId);
      return json({ ...sessionPayload(s), messages: [] });
    }

    if (action === 'share') {
      if (!assistantId) throw new UserError('Publique o assistente antes de gerar o link.');
      const patch: Record<string, unknown> = { is_public: body.ligado !== false };
      if (body.regenerar === true) patch.public_token = token();
      const { data, error } = await admin.from('assistants').update(patch).eq('id', assistantId).select('public_token, is_public').single();
      if (error) throw error;
      return json({ token: data.public_token, is_public: data.is_public });
    }

    throw new UserError(`Ação desconhecida: ${action}`);
  } catch (err) {
    if (err instanceof UserError) return json({ error: err.message }, err.status);
    console.error('[builder]', err);
    return json({ error: 'Algo deu errado do nosso lado. Tente de novo em instantes.' }, 500);
  }
});

