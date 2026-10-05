// ============================================================
// assistant-builder-chat
//
// Monta o assistente. A tela manda uma "action":
//   load      → abre (ou cria) o rascunho do usuário
//   message   → conversa com a IA, que preenche o documento por ferramentas
//   finalize  → publica: cria ou atualiza o assistente
//   reset     → descarta o rascunho e começa de novo
//   share     → liga/desliga ou troca o link público
//
// Edições manuais no formulário não passam por aqui: a tela grava o
// rascunho direto em builder_sessions (RLS garante o dono).
// ============================================================

import type Anthropic from 'npm:@anthropic-ai/sdk@^0.131.0';
import { corsHeaders, json, UserError } from '../_shared/cors.ts';
import { admin, profileOf, requireUser } from '../_shared/db.ts';
import { addUsage, anthropic, emptyUsage, logUsage, MODELS, textOf } from '../_shared/ai.ts';
import { inicioDoMes, planOf, trialExpirado } from '../_shared/plans.ts';
import {
  allCollections, allFields, BASE_SCHEMA, type Config, describeConfig, EMPTY_CONFIG, missingCritical,
  normalizeConfig, normalizeSchema, type Schema, slug, valueOf,
} from '../_shared/schema.ts';

type Session = {
  id: string;
  owner_id: string;
  assistant_id: string | null;
  business_type: string | null;
  schema: Schema;
  config: Config;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
};

const token = () => crypto.randomUUID().replace(/-/g, '').slice(0, 14);

// ------------------------------------------------------------
// Rascunho
// ------------------------------------------------------------

async function loadSession(ownerId: string, assistantId: string | null): Promise<Session> {
  let q = admin.from('builder_sessions').select('*').eq('owner_id', ownerId).eq('status', 'active');
  q = assistantId ? q.eq('assistant_id', assistantId) : q.is('assistant_id', null);
  const { data: found } = await q.order('updated_at', { ascending: false }).limit(1).maybeSingle();
  if (found) {
    return { ...found, schema: normalizeSchema(found.schema), config: normalizeConfig(found.config) } as Session;
  }
  return createSession(ownerId, assistantId);
}

async function createSession(ownerId: string, assistantId: string | null): Promise<Session> {
  let schema: Schema = structuredClone(BASE_SCHEMA);
  let config: Config = structuredClone(EMPTY_CONFIG);
  let businessType: string | null = null;

  if (assistantId) {
    const { data: a } = await admin
      .from('assistants')
      .select('schema, config, business_type')
      .eq('id', assistantId)
      .eq('owner_id', ownerId)
      .maybeSingle();
    if (!a) throw new UserError('Assistente não encontrado.', 404);
    schema = normalizeSchema(a.schema);
    config = normalizeConfig(a.config);
    businessType = a.business_type;
  }

  const { data, error } = await admin
    .from('builder_sessions')
    .insert({ owner_id: ownerId, assistant_id: assistantId, schema, config, business_type: businessType, messages: [] })
    .select('*')
    .single();
  if (error) throw error;
  return { ...data, schema, config } as Session;
}

async function saveSession(s: Session) {
  const { error } = await admin
    .from('builder_sessions')
    .update({ schema: s.schema, config: s.config, messages: s.messages, business_type: s.business_type })
    .eq('id', s.id);
  if (error) throw error;
}

async function publicInfo(assistantId: string | null) {
  if (!assistantId) return null;
  const { data } = await admin.from('assistants').select('public_token, is_public, name').eq('id', assistantId).maybeSingle();
  return data ? { token: data.public_token, is_public: data.is_public, name: data.name } : null;
}

async function builderUsage(ownerId: string) {
  const { count } = await admin
    .from('usage_events')
    .select('id', { count: 'exact', head: true })
    .eq('owner_id', ownerId)
    .eq('kind', 'builder')
    .gte('created_at', inicioDoMes());
  return count ?? 0;
}

async function planInfo(ownerId: string) {
  const profile = await profileOf(ownerId);
  const plan = planOf(profile);
  const usados = await builderUsage(ownerId);
  return {
    profile,
    plan,
    payload: {
      id: plan.id,
      nome: plan.nome,
      builderIA: plan.builderIA && !trialExpirado(profile),
      builderRestantes: Math.max(0, plan.builderMsgs - usados),
      expirado: trialExpirado(profile),
    },
  };
}

// ------------------------------------------------------------
// Ferramentas que a IA usa para mexer no documento
// ------------------------------------------------------------

const TOOLS: Anthropic.Beta.BetaTool[] = [
  {
    name: 'preencher_campos',
    description:
      'Grava valores em campos simples do documento. Use as chaves exatas listadas no estado do documento. Chame sempre que o usuário informar algo que caiba num campo.',
    input_schema: {
      type: 'object',
      properties: {
        campos: {
          type: 'array',
          items: {
            type: 'object',
            properties: { chave: { type: 'string' }, valor: { type: 'string' } },
            required: ['chave', 'valor'],
          },
        },
      },
      required: ['campos'],
    },
  },
  {
    name: 'adicionar_itens',
    description:
      'Acrescenta itens a uma lista (ex.: serviços, perguntas frequentes). Cada item é um objeto cujas chaves são as chaves dos atributos da lista.',
    input_schema: {
      type: 'object',
      properties: {
        lista: { type: 'string', description: 'Chave da lista' },
        itens: { type: 'array', items: { type: 'object', additionalProperties: { type: 'string' } } },
      },
      required: ['lista', 'itens'],
    },
  },
  {
    name: 'editar_item',
    description: 'Altera atributos de um item já listado. A posição começa em 1.',
    input_schema: {
      type: 'object',
      properties: {
        lista: { type: 'string' },
        posicao: { type: 'integer' },
        valores: { type: 'object', additionalProperties: { type: 'string' } },
      },
      required: ['lista', 'posicao', 'valores'],
    },
  },
  {
    name: 'remover_item',
    description: 'Remove um item de uma lista. A posição começa em 1.',
    input_schema: {
      type: 'object',
      properties: { lista: { type: 'string' }, posicao: { type: 'integer' } },
      required: ['lista', 'posicao'],
    },
  },
  {
    name: 'dispensar',
    description:
      'Marca um campo ou lista como "não se aplica" quando o usuário disser que não tem ou não quer informar. Não use só porque ele ainda não respondeu.',
    input_schema: {
      type: 'object',
      properties: { chave: { type: 'string' } },
      required: ['chave'],
    },
  },
  {
    name: 'criar_campo',
    description:
      'Cria um campo novo numa seção quando o negócio tem uma informação importante que não cabe em nenhum campo existente (ex.: "Convênios aceitos" numa clínica). Pode já gravar o valor.',
    input_schema: {
      type: 'object',
      properties: {
        secao: { type: 'string', description: 'Chave da seção' },
        rotulo: { type: 'string' },
        tipo: { type: 'string', enum: ['text', 'textarea'] },
        valor: { type: 'string' },
      },
      required: ['secao', 'rotulo'],
    },
  },
  {
    name: 'criar_lista',
    description:
      'Cria uma lista nova numa seção para coisas que se repetem e não cabem nas listas existentes (ex.: "Profissionais" de um salão, "Planos" de uma academia).',
    input_schema: {
      type: 'object',
      properties: {
        secao: { type: 'string' },
        rotulo: { type: 'string' },
        atributos: {
          type: 'array',
          items: {
            type: 'object',
            properties: { rotulo: { type: 'string' }, obrigatorio: { type: 'boolean' } },
            required: ['rotulo'],
          },
        },
      },
      required: ['secao', 'rotulo', 'atributos'],
    },
  },
];

function runTool(s: Session, name: string, input: Record<string, unknown>, touched: Set<string>): string {
  const fields = new Map(allFields(s.schema).map((f) => [f.key, f]));
  const cols = new Map(allCollections(s.schema).map((c) => [c.key, c]));
  const cfg = s.config;

  const cleanItem = (lista: string, raw: unknown) => {
    const def = cols.get(lista)!;
    const keys = new Set(def.item_fields.map((f) => f.key));
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries((raw ?? {}) as Record<string, unknown>)) {
      if (keys.has(k) && v != null && String(v).trim()) out[k] = String(v).trim().slice(0, 2000);
    }
    return out;
  };

  switch (name) {
    case 'preencher_campos': {
      const feitos: string[] = [];
      const erros: string[] = [];
      for (const c of (input.campos as Array<{ chave: string; valor: string }>) ?? []) {
        if (!fields.has(c.chave)) {
          erros.push(`chave desconhecida: ${c.chave}`);
          continue;
        }
        const v = String(c.valor ?? '').trim().slice(0, 4000);
        cfg.fields[c.chave] = { value: v, status: v ? 'confirmado' : 'vazio' };
        if (c.chave === 'segmento' && v) s.business_type = v.slice(0, 80);
        touched.add(c.chave);
        feitos.push(c.chave);
      }
      return JSON.stringify({ gravados: feitos, erros });
    }
    case 'adicionar_itens': {
      const lista = String(input.lista);
      if (!cols.has(lista)) return JSON.stringify({ erro: `lista desconhecida: ${lista}` });
      const itens = ((input.itens as unknown[]) ?? []).map((i) => cleanItem(lista, i)).filter((i) => Object.keys(i).length);
      cfg.collections[lista] = [...(cfg.collections[lista] ?? []), ...itens];
      cfg.declined.collections = cfg.declined.collections.filter((k) => k !== lista);
      touched.add(lista);
      return JSON.stringify({ adicionados: itens.length, total: cfg.collections[lista].length });
    }
    case 'editar_item': {
      const lista = String(input.lista);
      const list = cfg.collections[lista];
      const i = Number(input.posicao) - 1;
      if (!cols.has(lista) || !list || !list[i]) return JSON.stringify({ erro: 'item não encontrado' });
      list[i] = { ...list[i], ...cleanItem(lista, input.valores) };
      touched.add(lista);
      return JSON.stringify({ ok: true });
    }
    case 'remover_item': {
      const lista = String(input.lista);
      const list = cfg.collections[lista];
      const i = Number(input.posicao) - 1;
      if (!list || !list[i]) return JSON.stringify({ erro: 'item não encontrado' });
      list.splice(i, 1);
      touched.add(lista);
      return JSON.stringify({ ok: true, total: list.length });
    }
    case 'dispensar': {
      const k = String(input.chave);
      if (fields.has(k)) cfg.fields[k] = { value: '', status: 'ignorado' };
      else if (cols.has(k)) {
        if (!cfg.declined.collections.includes(k)) cfg.declined.collections.push(k);
      } else return JSON.stringify({ erro: `chave desconhecida: ${k}` });
      touched.add(k);
      return JSON.stringify({ ok: true });
    }
    case 'criar_campo': {
      const sec = s.schema.sections.find((x) => x.key === input.secao) ?? s.schema.sections.at(-1)!;
      const rotulo = String(input.rotulo ?? '').trim().slice(0, 60);
      if (!rotulo) return JSON.stringify({ erro: 'rótulo vazio' });
      let key = slug(rotulo) || 'campo';
      while (fields.has(key) || cols.has(key)) key += '_2';
      sec.fields.push({
        key, label: rotulo, type: input.tipo === 'textarea' ? 'textarea' : 'text', importance: 'optional', custom: true,
      });
      const v = String(input.valor ?? '').trim();
      if (v) cfg.fields[key] = { value: v, status: 'confirmado' };
      touched.add(key);
      return JSON.stringify({ chave: key });
    }
    case 'criar_lista': {
      const sec = s.schema.sections.find((x) => x.key === input.secao) ?? s.schema.sections.at(-1)!;
      const rotulo = String(input.rotulo ?? '').trim().slice(0, 60);
      let key = slug(rotulo) || 'lista';
      while (fields.has(key) || cols.has(key)) key += '_2';
      const attrs = ((input.atributos as Array<{ rotulo: string; obrigatorio?: boolean }>) ?? []).slice(0, 8);
      const item_fields = attrs.map((a, i) => ({
        key: slug(a.rotulo) || `campo_${i + 1}`,
        label: String(a.rotulo).slice(0, 40),
        type: 'text' as const,
        required: i === 0 || !!a.obrigatorio,
      }));
      if (!item_fields.length) item_fields.push({ key: 'nome', label: 'Nome', type: 'text', required: true });
      sec.collections.push({ key, label: rotulo, importance: 'optional', min: 1, item_fields, custom: true });
      touched.add(key);
      return JSON.stringify({ chave: key, atributos: item_fields.map((f) => f.key) });
    }
  }
  return JSON.stringify({ erro: `ferramenta desconhecida: ${name}` });
}

// ------------------------------------------------------------
// Prompt
// ------------------------------------------------------------

const STATIC_PROMPT = `Você é a Helpy, consultora que ajuda donos de pequenos negócios brasileiros a montar o atendente virtual da empresa deles. A conversa acontece em português do Brasil.

Como você trabalha:
- Ao lado desta conversa existe um documento com o que o atendente vai saber. Você preenche esse documento usando as ferramentas. O usuário vê cada campo sendo preenchido na hora.
- Sempre que o usuário disser algo que caiba no documento, grave com a ferramenta na mesma resposta. Extraia tudo o que der de uma mensagem só: se ele colar uma lista de preços, adicione todos os itens.
- Nunca invente informação do negócio (preço, horário, política, endereço). Se faltar, pergunte.
- Faça no máximo duas perguntas por vez, começando pelo que ainda falta e é obrigatório. Depois vá para o importante. O opcional você só oferece.
- Se o negócio tiver algo que não cabe nos campos existentes, crie um campo ou uma lista.
- Se o usuário disser que não tem ou não quer informar algo, use "dispensar".
- Respostas curtas, calorosas e diretas, como uma pessoa no WhatsApp. Sem listas longas, sem markdown pesado.
- Quando não faltar nada obrigatório, avise que já dá para publicar e sugira o que ainda deixaria o atendente melhor.
- Se o usuário pedir algo fora disso (ex.: escrever um texto qualquer), traga a conversa de volta para montar o atendente.`;

function docState(s: Session): string {
  const linhas: string[] = [];
  const missing = missingCritical(s.schema, s.config);
  for (const sec of s.schema.sections) {
    linhas.push(`Seção "${sec.title}" (chave: ${sec.key})`);
    for (const f of sec.fields) {
      const e = s.config.fields[f.key];
      const estado = e?.status === 'ignorado' ? '(dispensado)' : valueOf(s.config, f.key) ? `= ${JSON.stringify(valueOf(s.config, f.key))}` : '(vazio)';
      const extra = f.options ? ` opções: ${f.options.join(' / ')}` : '';
      linhas.push(`  campo ${f.key} — ${f.label} [${f.importance}]${extra} ${estado}`);
    }
    for (const c of sec.collections) {
      const list = s.config.collections[c.key] ?? [];
      const dispensada = s.config.declined.collections.includes(c.key);
      const attrs = c.item_fields.map((f) => `${f.key}${f.required ? '*' : ''}`).join(', ');
      linhas.push(
        `  lista ${c.key} — ${c.label} [${c.importance}] atributos: ${attrs} ${dispensada ? '(dispensada)' : `— ${list.length} itens`}`,
      );
      list.forEach((item, i) => linhas.push(`    ${i + 1}. ${JSON.stringify(item)}`));
    }
  }
  linhas.push('');
  linhas.push(missing.length ? `Ainda falta (obrigatório): ${missing.join(', ')}` : 'Nada obrigatório faltando: já dá para publicar.');
  return `Estado atual do documento:\n${linhas.join('\n')}`;
}

async function chat(s: Session, userText: string) {
  const model = MODELS.builder;
  const usage = emptyUsage();
  const touched = new Set<string>();

  const history: Anthropic.Beta.BetaMessageParam[] = s.messages
    .slice(-30)
    .map((m) => ({ role: m.role, content: m.content }));
  history.push({ role: 'user', content: userText });

  // o estado do documento muda a cada turno; as instruções não — ficam em cache
  const system: Anthropic.Beta.BetaTextBlockParam[] = [
    { type: 'text', text: STATIC_PROMPT, cache_control: { type: 'ephemeral' } },
    { type: 'text', text: docState(s) },
  ];

  const usesFallback = /claude-(sonnet|opus)-5-5/.test(model);
  let reply = '';

  for (let i = 0; i < 6; i++) {
    const res = await anthropic.beta.messages.create({
      model,
      max_tokens: 4000,
      system,
      tools: TOOLS,
      messages: history,
      output_config: { effort: 'medium' },
      ...(usesFallback ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' } : {}),
    } as Anthropic.Beta.MessageCreateParamsNonStreaming);
    addUsage(usage, res.usage);

    if (res.stop_reason === 'refusal') {
      reply = 'Não consigo ajudar com isso. Vamos voltar ao seu atendente?';
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
    for (const b of res.content) {
      if (b.type !== 'tool_use') continue;
      let out: string;
      try {
        out = runTool(s, b.name, b.input as Record<string, unknown>, touched);
      } catch (e) {
        out = JSON.stringify({ erro: (e as Error).message });
      }
      results.push({ type: 'tool_result', tool_use_id: b.id, content: out });
    }
    history.push({ role: 'user', content: results });
  }

  if (!reply) reply = 'Anotei aqui no documento. O que mais você quer contar?';

  s.messages = [...s.messages, { role: 'user', content: userText }, { role: 'assistant', content: reply }];
  return { reply, touched: [...touched], usage, model };
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
      return json({
        session_id: s.id,
        business_type: s.business_type,
        schema: s.schema,
        config: s.config,
        messages: s.messages,
        publico: await publicInfo(assistantId),
        plano: payload,
      });
    }

    if (action === 'message') {
      const text = String(body.message ?? '').trim().slice(0, 6000);
      if (!text) throw new UserError('Mensagem vazia.');
      const { plan, payload } = await planInfo(user.id);
      if (payload.expirado) throw new UserError('Seu teste grátis terminou. Escolha um plano para continuar.', 402);
      if (!plan.builderIA) {
        throw new UserError(`Montar conversando com a IA faz parte do plano Profissional. No ${plan.nome}, preencha o documento à direita.`, 402);
      }
      if (payload.builderRestantes <= 0) {
        throw new UserError('Você usou todas as mensagens de montagem deste mês. O documento continua editável à mão.', 429);
      }

      const s = await loadSession(user.id, assistantId);
      // o formulário pode ter gravado mudanças depois do último load
      const { reply, touched, usage, model } = await chat(s, text);
      await saveSession(s);
      await logUsage(admin, user.id, assistantId, 'builder', model, usage);

      return json({
        session_id: s.id,
        business_type: s.business_type,
        schema: s.schema,
        config: s.config,
        message: reply,
        ops: touched.map((key) => ({ key })),
        plano: { ...payload, builderRestantes: Math.max(0, payload.builderRestantes - 1) },
      });
    }

    if (action === 'finalize') {
      const s = await loadSession(user.id, assistantId);
      const faltando = missingCritical(s.schema, s.config);
      if (faltando.length) throw new UserError(`Ainda falta: ${faltando.join(', ')}.`);

      const { plan, payload } = await planInfo(user.id);
      if (payload.expirado) throw new UserError('Seu teste grátis terminou. Escolha um plano para publicar.', 402);

      const name = valueOf(s.config, 'nome_assistente') || valueOf(s.config, 'nome_negocio') || 'Atendente';
      const row = {
        name: name.slice(0, 80),
        business_type: s.business_type ?? (valueOf(s.config, 'segmento') || null),
        schema: s.schema,
        config: s.config,
      };

      let assistant;
      if (assistantId) {
        const { data, error } = await admin.from('assistants').update(row).eq('id', assistantId).select('*').single();
        if (error) throw error;
        assistant = data;
      } else {
        const { count } = await admin
          .from('assistants')
          .select('id', { count: 'exact', head: true })
          .eq('owner_id', user.id);
        if ((count ?? 0) >= plan.assistentes) {
          throw new UserError(
            `O plano ${plan.nome} permite ${plan.assistentes} assistente${plan.assistentes > 1 ? 's' : ''}. Mude de plano para criar mais.`,
            402,
          );
        }
        const { data, error } = await admin
          .from('assistants')
          .insert({ ...row, owner_id: user.id, public_token: token(), is_public: true })
          .select('*')
          .single();
        if (error) throw error;
        assistant = data;
      }

      await admin.from('builder_sessions').update({ status: 'done', assistant_id: assistant.id }).eq('id', s.id);
      return json({ assistant });
    }

    if (action === 'reset') {
      let q = admin.from('builder_sessions').update({ status: 'done' }).eq('owner_id', user.id).eq('status', 'active');
      q = assistantId ? q.eq('assistant_id', assistantId) : q.is('assistant_id', null);
      await q;
      const s = await createSession(user.id, assistantId);
      return json({ session_id: s.id, schema: s.schema, config: s.config, messages: [] });
    }

    if (action === 'share') {
      if (!assistantId) throw new UserError('Publique o assistente antes de gerar o link.');
      const patch: Record<string, unknown> = { is_public: body.ligado !== false };
      if (body.regenerar === true) patch.public_token = token();
      const { data, error } = await admin
        .from('assistants')
        .update(patch)
        .eq('id', assistantId)
        .select('public_token, is_public')
        .single();
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
