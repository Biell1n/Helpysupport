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
import {
  allCollections, allFields, buildSchema, type CollectionDef, computeState, type Config,
  EMPTY_CONFIG, type FieldDef, hardenCollection, limpo, type Material, type MensagemBuilder, type Meta, missingCritical,
  type Modelo, MODELOS, normalizeConfig, normalizeMeta, PRICE_RE, type Schema, semNoItem, slug, valueOf, VENDE,
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

type Goal = { key: string | null; text: string };

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

  const kCrit = escolher(state.missing.critical, true);
  if (kCrit) return { key: kCrit, text: `${desc(kCrit)}. É obrigatório.${insist(kCrit)}` };

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

  const kMais = escolher(state.askMore.map((k) => `more:${k}`));
  if (kMais) {
    const k = kMais.slice(5);
    return { key: kMais, text: `Saber se falta algum item em ${label(k)}. Uma pergunta só; se a pessoa disser que não, use sem_mais_itens.` };
  }

  const kImp = escolher(state.missing.important);
  if (kImp) return { key: kImp, text: `${desc(kImp)}.${insist(kImp)}` };

  const kOpt = escolher(state.missing.optional);
  if (kOpt) return { key: kOpt, text: `${desc(kOpt)}. É opcional: se a pessoa não quiser, tudo bem, mas puxe o assunto.` };

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
  s.meta.ask_counts[goal.key] = (s.meta.ask_counts[goal.key] ?? 0) + 1;
  s.meta.ask_turnos[goal.key] = s.meta.turno;
  s.meta.last_goal = goal.key;
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
      'Adiciona ou atualiza itens de uma lista. O item é reconhecido pelo primeiro atributo (nome, tema, pergunta…): se já existir, os atributos informados são atualizados. Item sem o identificador é rejeitado. Inclua só o que a pessoa disse.',
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
    description: 'Cria uma lista nova para coisas que se repetem e não cabem nas listas existentes (ex.: Profissionais de um salão, Unidades de uma rede).',
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
];

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
      if (s.meta.business_model === 'produto') {
        colunas.push({ tabela_id: tab.id, chave: 'estoque', rotulo: 'Estoque', ordem: colunas.length, tipo: 'numero', obrigatoria: false, identifica: false, chave_primaria: false, unica: false });
      }
      await admin.from('tabela_colunas').insert(colunas);
      const itens = cfg.collections[c.key] ?? [];
      if (itens.length) await admin.from('tabela_linhas').insert(itens.map((dados) => ({ tabela_id: tab.id, dados })));

      // a lista sai do documento: a fonte passa a ser a tabela
      cfg.collections[c.key] = [];
      if (!cfg.declined.collections.includes(c.key)) cfg.declined.collections.push(c.key);
      s.meta.tabela_oferecida = true;
      s.meta.tabelas_criadas = [...(s.meta.tabelas_criadas ?? []), tab.id];
      if (ctx.s.assistant_id) await admin.from('assistente_tabelas').upsert({ assistant_id: ctx.s.assistant_id, tabela_id: tab.id });
      touched.add(c.key);
      return { ok: true, tabela: tab.nome, itens_levados: itens.length, mensagem: 'Diga que a tabela está em Dados e que ela pode atualizar lá quando quiser.' };
    }

    case 'recusar_tabela':
      s.meta.tabela_recusada = true;
      return { ok: true };

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
Ao lado desta conversa há um documento com tudo que o assistente vai saber. Você o preenche com as ferramentas, e a pessoa vê cada campo mudando na hora. Toda informação que a pessoa der vai para o documento NA MESMA RESPOSTA — se ela colar uma lista de preços, salve todos os itens de uma vez.
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
Quando vier um PDF, imagem ou planilha, leia tudo e grave de uma vez o que servir para o documento: campos, itens das listas, perguntas frequentes, regras. O texto completo do arquivo fica guardado sozinho como material de apoio, e o assistente consulta ao atender — não copie o arquivo inteiro para os campos.
Diga em uma frase o que encontrou ("li a prova: 10 questões de adição e subtração para o 2º ano") e siga com o que ainda falta.
Se for prova, lista de exercícios ou atividade de aluno: o modelo é educacional, grave em regras que ele nunca entrega a resposta das questões (ele guia com perguntas e exemplos parecidos), e grave a série e o conteúdo.

CHAMADOS
Em algum momento pergunte se o assistente pode passar a conversa para uma pessoa da equipe (campo chamados_ativos). Se sim: em que situações abrir chamado, em quais não abrir, e se só quem tem uma senha pode abrir. Para um monitor de estudos sem ninguém para responder, sugira desligar.
"Ele nunca deve…" ou "não pode falar de…" são regras: grave em regras com acrescentar=true, na hora.

VOCÊ É UMA PESSOA, NÃO UM FORMULÁRIO
Consultor experiente, português do Brasil, informal. Varia o tamanho da resposta. Faz UMA pergunta por vez, concreta — nunca "mais alguma coisa?".

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

CAMPOS QUE SE CONFUNDEM
- tom_de_voz = o jeito de falar, inclusive listas de comportamento ("simpático, nunca pressionar").
- regras = proibições. Sempre acrescentar, nunca substituir.
- assuntos_cobertos = lista de temas. Não é FAQ.
- faq = pares pergunta/resposta concretos. Se ela citou a pergunta sem a resposta, salve só a pergunta e peça a resposta.
- horario = quando existe gente para assumir um chamado. O assistente funciona 24h.
- contatos = os contatos da pessoa para encaminhar casos. Não são canais do assistente.
- Pagamento, entrega, garantia, endereço ficam em "Como funciona". Se não houver campo, crie.

NUNCA PREENCHA COM ENFEITE
Nunca grave "Consultar", "Sob consulta", "A definir", "Varia", "N/A" ou parecido. Se ela não disse o preço, deixe o preço de fora do item. Campo vazio é uma pergunta que ainda será feita; "Consultar" é uma resposta errada para sempre.
Nunca invente dado que a pessoa não disse.

FORA DO ESCOPO
Você só monta este assistente. Se puxarem outro tema, uma frase avisando e volta ao assunto. Nada de markdown pesado, nada de JSON na resposta.`;

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
  return `[nota interna — a pessoa não vê]
${faltam.length ? `Ainda falta (obrigatório): ${faltam.join(', ')}.` : 'Nada obrigatório faltando: já dá para publicar.'}
PRÓXIMO ASSUNTO: ${goal.text}
Primeiro grave o que a mensagem trouxer. Depois puxe o próximo assunto com as SUAS palavras, uma pergunta só.`;
}

/** O arquivo como bloco que o Claude lê. */
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

/** Transcreve o arquivo em texto para o assistente consultar depois. */
async function virarMaterial(a: Anexo, usage: ReturnType<typeof emptyUsage>): Promise<Material> {
  let texto = '';
  if (a.tipo.startsWith('text/')) {
    texto = textoDoAnexo(a);
  } else {
    const res = await anthropic.messages.create({
      model: MODELS.atendimento,
      max_tokens: 12000,
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
  }
  return {
    id: crypto.randomUUID().slice(0, 8),
    nome: a.nome.slice(0, 120),
    tipo: a.tipo,
    texto: texto.trim().slice(0, MAX_MATERIAL),
    em: new Date().toISOString(),
  };
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
  let goal = nextGoal(s);

  // a transcrição dos arquivos roda junto com a conversa
  const materiaisPromessa = Promise.all(anexos.map((a) => virarMaterial(a, usageMateriais).catch((e) => {
    console.error('[material]', a.nome, e?.message ?? e);
    return null;
  })));

  const history: Anthropic.Beta.BetaMessageParam[] = s.messages.slice(-30).map((m) => ({
    role: m.role,
    content: m.anexos?.length ? `${m.content}\n[anexou: ${m.anexos.join(', ')}]` : m.content,
  }));
  history.push({
    role: 'user',
    content: [
      ...anexos.map(blocoDoAnexo),
      { type: 'text', text: userText },
      { type: 'text', text: goalNote(s, goal) },
    ],
  });

  // instruções fixas em cache; o estado do documento muda a cada turno
  const system: Anthropic.Beta.BetaTextBlockParam[] = [
    { type: 'text', text: STATIC_PROMPT, cache_control: { type: 'ephemeral' } },
    { type: 'text', text: docState(s) },
  ];
  const usesFallback = /claude-(sonnet|opus)-5-5/.test(model);

  let reply = '';
  for (let i = 0; i < 6; i++) {
    const res = await anthropic.beta.messages.create({
      model,
      max_tokens: 6000,
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

  marcarPergunta(s, goal);
  if (!reply) reply = 'Anotei no documento. Me conta mais sobre o negócio?';

  const novos = (await materiaisPromessa).filter((m): m is Material => !!m && !!m.texto);
  if (novos.length) s.meta.materiais = [...(s.meta.materiais ?? []), ...novos].slice(-MAX_MATERIAIS);

  s.messages = [
    ...s.messages,
    { role: 'user', content: userText, ...(anexos.length ? { anexos: anexos.map((a) => a.nome) } : {}) },
    { role: 'assistant', content: reply },
  ];
  return { reply, usage, usageMateriais, model };
}

/** Resume a conversa de montagem no que o dono quer, para o assistente seguir. */
async function resumirIntencao(s: Session): Promise<string> {
  const conversa = s.messages.filter((m) => m.content?.trim()).slice(-60);
  if (conversa.length < 2) return s.meta.briefing ?? '';
  const texto = conversa
    .map((m) => `${m.role === 'user' ? 'DONO' : 'HELPY'}: ${m.content.slice(0, 1500)}${m.anexos?.length ? ` [anexou: ${m.anexos.join(', ')}]` : ''}`)
    .join('\n');
  const usage = emptyUsage();
  const res = await anthropic.messages.create({
    model: MODELS.atendimento,
    max_tokens: 900,
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
  await logUsage(admin, s.owner_id, s.assistant_id, 'builder', MODELS.atendimento, usage);
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
        throw new UserError(`Montar conversando com a IA faz parte do plano Profissional. No ${plan.nome}, preencha o documento ao lado.`, 402);
      }
      if (payload.builderRestantes <= 0) {
        throw new UserError('Você usou todas as mensagens de montagem deste mês. O documento continua editável à mão.', 429);
      }

      const s = await loadSession(user.id, assistantId);
      const before = JSON.stringify(s.config);
      const { reply, usage, usageMateriais, model } = await chat(s, text, { s, userId: user.id, touched: new Set(), maxTabelas: plan.tabelas }, anexos);
      await saveSession(s);
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

    if (action === 'undo') {
      const s = await loadSession(user.id, assistantId);
      if (!desfazer(s, 1)) throw new UserError('Não há mais nada para desfazer.');
      await saveSession(s);
      return json(sessionPayload(s));
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
      s.meta.conversa = s.messages.slice(-80);

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
      const criadas = s.meta.tabelas_criadas ?? [];
      if (criadas.length) {
        await admin.from('assistente_tabelas').upsert(criadas.map((tabela_id) => ({ assistant_id: assistant.id, tabela_id })));
      }

      await admin.from('builder_sessions').update({ status: 'done', assistant_id: assistant.id }).eq('id', s.id);
      return json({ assistant });
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

