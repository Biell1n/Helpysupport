// ============================================================
// public-chat — o atendimento pelo link público /c/:token
//
// Verify JWT DESLIGADO (ver supabase/config.toml): visitante não tem
// conta. Quando há login do dono e "teste: true", é o modo de testar o
// assistente — não conta na cota e não aparece nos atendimentos.
//
// Ações: info · history · message (padrão) · poll · feedback · encerrar · reabrir
//
// Proteções, já que o endereço é público:
//   - só responde com token válido e link ligado
//   - conversa nova sem login exige uma prova de trabalho feita pelo
//     navegador (meio segundo para uma pessoa, caro para um robô)
//   - até 8 conversas novas por visitante e 20 por rede (hash do IP) por dia
//   - enxurrada no mesmo assistente (30 conversas anônimas em 10 min):
//     daí em diante só com login, para não queimar a cota do dono
//   - até 6 mensagens por minuto, e um teto por atendimento
//   - chamado para a equipe e recado só com login; sem login é só conversa
// ============================================================

import { corsHeaders, json, UserError } from '../_shared/cors.ts';
import { admin, profileOf, requireUser, userFrom } from '../_shared/db.ts';
import { logUsage } from '../_shared/ai.ts';
import { type Assistant, responder } from '../_shared/atendimento.ts';
import { inicioDoMes, planOf, trialExpirado } from '../_shared/plans.ts';
import { normalizeConfig, valueOf } from '../_shared/schema.ts';

const MAX_CHARS = 2000;
const BITS_DESAFIO = 17;
const RAJADA_ANONIMA = 30;
const PEDE_LOGIN =
  'Para falar com a equipe, entre com sua conta tocando em "Entrar para falar com a equipe", aqui embaixo. Leva poucos segundos e a conversa continua de onde parou.';
const MUITA_PROCURA =
  'Estamos recebendo muitas conversas agora. Para continuar, entre com sua conta tocando em "Entrar", aqui embaixo. Leva poucos segundos.';

const RECADO =
  'Obrigado pela mensagem! No momento o atendimento automático está indisponível, mas sua mensagem já chegou para a equipe. Se quiser, deixe aqui seu nome e um contato (WhatsApp ou e-mail) que respondemos por esta mesma conversa.';

type Conversa = {
  id: string;
  assistant_id: string;
  visitor_id: string;
  cliente_id?: string | null;
  status: 'bot' | 'waiting' | 'human' | 'closed';
  numero: number | null;
  assumido_nome: string | null;
  assumido_em: string | null;
  escalado_em: string | null;
  nota: number | null;
  teste: boolean;
  last_message_at: string;
};

/**
 * Prova de trabalho: o navegador acha um número que, junto do link, do
 * visitante e da hora que o servidor deu, gera um SHA-256 com
 * BITS_DESAFIO zeros no começo. Para quem conversa é invisível; para quem
 * quer abrir milhares de conversas, custa caro.
 */
async function provaOk(token: string, visitorId: string, prova: unknown): Promise<boolean> {
  const p = (prova ?? {}) as { ts?: unknown; nonce?: unknown };
  const ts = Number(p.ts);
  const nonce = Number(p.nonce);
  if (!Number.isSafeInteger(ts) || !Number.isSafeInteger(nonce)) return false;
  const idade = Date.now() - ts;
  if (idade < -60_000 || idade > 6 * 3600_000) return false;
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${token}:${visitorId}:${ts}:${nonce}`)));
  let zeros = 0;
  for (const b of h) {
    if (b === 0) {
      zeros += 8;
      continue;
    }
    zeros += Math.clz32(b) - 24;
    break;
  }
  return zeros >= BITS_DESAFIO;
}

/** IP do visitante virado em hash (com sal do servidor): dá para contar, não dá para saber quem é. */
async function hashDoIp(req: Request): Promise<string | null> {
  const ip = (req.headers.get('cf-connecting-ip') ?? req.headers.get('x-forwarded-for')?.split(',')[0] ?? '').trim();
  if (!ip) return null;
  const sal = Deno.env.get('IP_SAL') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${sal}:${ip}`));
  return [...new Uint8Array(bytes)].slice(0, 16).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * A conversa só abre para quem a começou: o mesmo navegador (visitor_id
 * aleatório) ou, se ela está ligada a uma conta, essa conta logada.
 */
async function conversaDo(assistantId: string, visitorId: string, clienteId: string | null, id: unknown): Promise<Conversa | null> {
  if (!id || !visitorId || !/^[0-9a-f-]{36}$/i.test(String(id))) return null;
  const { data } = await admin
    .from('conversations')
    .select('id, assistant_id, visitor_id, cliente_id, status, numero, assumido_nome, assumido_em, escalado_em, nota, teste, last_message_at')
    .eq('id', String(id))
    .maybeSingle();
  if (!data || data.assistant_id !== assistantId) return null;
  // ligada a uma conta: abre para essa conta em qualquer aparelho, e só para ela
  if (data.cliente_id) return data.cliente_id === clienteId ? (data as Conversa) : null;
  if (data.visitor_id !== visitorId) return null;
  return data as Conversa;
}

const estado = (c: Conversa) => ({
  conversation_id: c.id,
  numero: c.numero,
  status: c.status,
  assumido: !!c.assumido_em,
  assumido_nome: c.assumido_nome,
  ja_avaliou: c.nota != null,
});

/** O cliente vê a conversa e os avisos de agenda; avisos internos do sistema ficam só para a equipe. */
const paraOCliente = (m: { role: string; author_name?: string | null }) =>
  m.role !== 'system' || String(m.author_name ?? '').startsWith('evento:');

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? 'message');
    const visitorId = String(body.visitor_id ?? '').slice(0, 64);

    // ---- qual assistente ----
    const teste = body.teste === true;
    let assistant: (Assistant & { is_public: boolean; public_token: string }) | null = null;

    if (teste) {
      const user = await requireUser(req);
      const { data } = await admin.from('assistants').select('*').eq('id', String(body.assistant_id ?? '')).eq('owner_id', user.id).maybeSingle();
      assistant = data;
    } else {
      const token = String(body.token ?? '').trim();
      if (token.length < 10) throw new UserError('Link inválido.', 400);
      const { data } = await admin.from('assistants').select('*').eq('public_token', token).maybeSingle();
      if (data && !data.is_public) throw new UserError('Este atendimento está desligado no momento.', 403);
      assistant = data;
    }
    if (!assistant) throw new UserError('Este link não existe ou foi trocado.', 404);
    const cfg = normalizeConfig(assistant.config);

    if (action === 'info') {
      return json({
        name: valueOf(cfg, 'nome_assistente') || assistant.name,
        negocio: valueOf(cfg, 'nome_negocio'),
        saudacao: valueOf(cfg, 'saudacao'),
        business_model: assistant.business_model,
        desafio: { agora: Date.now(), bits: BITS_DESAFIO },
      });
    }

    if (!visitorId) throw new UserError('Visitante não identificado.', 400);
    // visitante que entrou com a conta: pode abrir chamado e deixar recado
    const cliente = teste ? null : await userFrom(req);
    const clienteId = cliente?.id ?? null;

    if (action === 'history') {
      const c = await conversaDo(assistant.id, visitorId, clienteId, body.conversation_id);
      if (!c || Date.now() - new Date(c.last_message_at).getTime() > 7 * 864e5) return json({ messages: [] });
      const { data: msgs } = await admin
        .from('conversation_messages')
        .select('role, content, author_name, created_at')
        .eq('conversation_id', c.id)
        .in('role', ['user', 'assistant', 'agent', 'system'])
        .order('created_at', { ascending: true })
        .limit(100);
      return json({ ...estado(c), messages: (msgs ?? []).filter(paraOCliente) });
    }

    if (action === 'poll') {
      const c = await conversaDo(assistant.id, visitorId, clienteId, body.conversation_id);
      if (!c) return json({ messages: [] });
      let q = admin
        .from('conversation_messages')
        .select('role, content, author_name, created_at')
        .eq('conversation_id', c.id)
        .in('role', ['agent', 'system'])
        .order('created_at', { ascending: true })
        .limit(30);
      if (body.desde) q = q.gt('created_at', String(body.desde));
      const { data: msgs } = await q;
      return json({ ...estado(c), messages: (msgs ?? []).filter(paraOCliente) });
    }

    if (action === 'feedback') {
      const c = await conversaDo(assistant.id, visitorId, clienteId, body.conversation_id);
      const nota = Math.round(Number(body.nota));
      if (!c || !(nota >= 1 && nota <= 5)) throw new UserError('Avaliação inválida.');
      await admin.from('conversations').update({ nota, feedback_texto: String(body.texto ?? '').slice(0, 600) || null }).eq('id', c.id);
      return json({ ok: true });
    }

    if (action === 'encerrar') {
      const c = await conversaDo(assistant.id, visitorId, clienteId, body.conversation_id);
      if (!c) throw new UserError('Conversa não encontrada.', 404);
      await admin.from('conversations').update({ status: 'closed', fechado_em: new Date().toISOString(), encerrado_por: 'cliente' }).eq('id', c.id);
      return json({ ok: true, status: 'closed' });
    }

    if (action === 'reabrir') {
      const c = await conversaDo(assistant.id, visitorId, clienteId, body.conversation_id);
      if (!c) throw new UserError('Conversa não encontrada.', 404);
      // se já tinha ido para a equipe, volta para a fila dela
      const status = c.escalado_em ? 'waiting' : 'bot';
      await admin.from('conversations').update({ status, fechado_em: null, encerrado_por: null, nota: null, feedback_texto: null }).eq('id', c.id);
      return json({ ok: true, status });
    }

    if (action !== 'message') throw new UserError(`Ação desconhecida: ${action}`);

    // ================= mensagem do visitante =================
    const texto = String(body.content ?? '').trim().slice(0, MAX_CHARS);
    if (!texto) throw new UserError('Mensagem vazia.');

    const profile = await profileOf(assistant.owner_id);
    const plan = planOf(profile);
    const clienteInfo = cliente
      ? { id: cliente.id, email: cliente.email ?? null, nome: String(cliente.user_metadata?.full_name ?? cliente.user_metadata?.name ?? '') || null }
      : null;
    let c = await conversaDo(assistant.id, visitorId, clienteId, body.conversation_id);
    let recado = false;
    const ipHash = c ? null : await hashDoIp(req);

    if (!c) {
      if (!teste && !cliente) {
        if (!(await provaOk(assistant.public_token, visitorId, body.prova))) {
          return json({ error: 'Não consegui confirmar seu navegador. Recarregue a página e tente de novo.', desafio: true }, 400);
        }
        const dezMin = new Date(Date.now() - 10 * 60_000).toISOString();
        const { count: rajada } = await admin.from('conversations').select('id', { count: 'exact', head: true })
          .eq('assistant_id', assistant.id).eq('teste', false).is('cliente_id', null).gte('created_at', dezMin);
        if ((rajada ?? 0) >= RAJADA_ANONIMA) {
          return json({ conversation_id: null, status: 'bot', message: MUITA_PROCURA, modo: 'login', precisa_login: true });
        }
      }
      if (!teste) {
        const umDia = new Date(Date.now() - 864e5).toISOString();
        const { count: hoje } = await admin.from('conversations').select('id', { count: 'exact', head: true })
          .eq('assistant_id', assistant.id).eq('visitor_id', visitorId).gte('created_at', umDia);
        if ((hoje ?? 0) >= 8) throw new UserError('Muitas conversas novas em pouco tempo. Continue na conversa que você já abriu.', 429);
        // o visitor_id vem do navegador e pode ser trocado; o IP (só o hash) segura quem abre conversa em massa
        if (ipHash) {
          const { count: doIp } = await admin.from('conversations').select('id', { count: 'exact', head: true })
            .eq('ip_hash', ipHash).gte('created_at', umDia);
          if ((doIp ?? 0) >= 20) throw new UserError('Muitas conversas novas a partir desta rede. Tente de novo mais tarde.', 429);
        }

        const { count: mes } = await admin.from('conversations').select('id', { count: 'exact', head: true })
          .eq('owner_id', assistant.owner_id).eq('teste', false).gte('created_at', inicioDoMes());
        if (trialExpirado(profile)) recado = true;
        else if ((mes ?? 0) >= plan.atendimentos) {
          if (profile.creditos_extra > 0) {
            await admin.from('profiles').update({ creditos_extra: profile.creditos_extra - 1 }).eq('id', profile.id);
          } else recado = true;
        }
        // sem login não vira recado na fila da equipe (seria a porta do spam)
        if (recado && !cliente) {
          return json({
            conversation_id: null,
            status: 'bot',
            message: 'O atendimento automático está indisponível no momento. Para deixar um recado para a equipe, entre com sua conta tocando em "Entrar para falar com a equipe", aqui embaixo.',
            modo: 'login',
            precisa_login: true,
          });
        }
      }

      const { data: nova, error } = await admin
        .from('conversations')
        .insert({
          assistant_id: assistant.id,
          owner_id: assistant.owner_id,
          visitor_id: visitorId,
          ip_hash: ipHash,
          teste,
          ...(clienteInfo ? { cliente_id: clienteInfo.id, cliente_email: clienteInfo.email, lead_nome: clienteInfo.nome, lead_contato: clienteInfo.email } : {}),
          ...(recado
            ? { status: 'waiting', titulo: 'Recado', motivo: 'Chegou com a cota do plano esgotada: o assistente não respondeu.', escalado_em: new Date().toISOString() }
            : {}),
        })
        .select('id, assistant_id, visitor_id, status, numero, assumido_nome, assumido_em, escalado_em, nota, teste, last_message_at')
        .single();
      if (error) throw error;
      c = nova as Conversa;
    } else {
      const minuto = new Date(Date.now() - 60_000).toISOString();
      const { count: recentes } = await admin.from('conversation_messages').select('id', { count: 'exact', head: true })
        .eq('conversation_id', c.id).eq('role', 'user').gte('created_at', minuto);
      if ((recentes ?? 0) >= 6) throw new UserError('Calma aí, ainda estou respondendo as anteriores.', 429);
      if (clienteInfo) {
        await admin.from('conversations').update({ cliente_id: clienteInfo.id, cliente_email: clienteInfo.email })
          .eq('id', c.id).is('cliente_id', null);
      }

      if (c.status === 'closed') {
        // escreveu numa conversa encerrada: reabre no lugar certo
        const status = c.escalado_em ? 'waiting' : 'bot';
        await admin.from('conversations').update({ status, fechado_em: null, encerrado_por: null }).eq('id', c.id);
        c.status = status;
      }
    }

    await admin.from('conversation_messages').insert({ conversation_id: c.id, role: 'user', content: texto });

    if (recado) {
      await admin.from('conversation_messages').insert({ conversation_id: c.id, role: 'system', content: RECADO });
      return json({ ...estado(c), message: RECADO, modo: 'recado' });
    }

    // a equipe assumiu (ou vai assumir): a IA sai de cena e não custa nada
    if (c.status === 'waiting' || c.status === 'human') {
      return json({ ...estado(c), message: null, modo: 'humano' });
    }

    // teto por atendimento: passa para a equipe em vez de girar
    const { count: doVisitante } = await admin.from('conversation_messages').select('id', { count: 'exact', head: true })
      .eq('conversation_id', c.id).eq('role', 'user');
    if ((doVisitante ?? 0) > plan.msgsPorAtendimento) {
      if (!cliente && !teste) {
        // sem login a conversa longa termina aqui, em vez de virar chamado
        await admin.from('conversations').update({ status: 'closed', fechado_em: new Date().toISOString(), encerrado_por: 'assistente' }).eq('id', c.id);
        const fimTexto = `Nossa conversa chegou ao limite por aqui. ${PEDE_LOGIN}`;
        await admin.from('conversation_messages').insert({ conversation_id: c.id, role: 'assistant', content: fimTexto });
        return json({ ...estado(c), status: 'closed', message: fimTexto, modo: 'login', precisa_login: true });
      }
      await admin.from('conversations').update({
        status: 'waiting', titulo: 'Conversa longa', motivo: 'Passou do limite de mensagens por atendimento.', escalado_em: new Date().toISOString(),
      }).eq('id', c.id);
      const aviso = 'Nossa conversa já está longa, então vou passar para alguém da equipe continuar daqui. Pode deixar seu contato que respondemos por aqui mesmo.';
      await admin.from('conversation_messages').insert({ conversation_id: c.id, role: 'assistant', content: aviso });
      return json({ ...estado(c), status: 'waiting', message: aviso, modo: 'humano' });
    }

    const { data: hist } = await admin
      .from('conversation_messages')
      .select('role, content')
      .eq('conversation_id', c.id)
      .in('role', ['user', 'assistant', 'agent'])
      .order('created_at', { ascending: false })
      .limit(24);

    let resposta: string;
    const sinais: { pedirLogin?: boolean; motivoLogin?: string } = {};
    const inicioRodada = new Date().toISOString();
    try {
      // o plano decide o que dos chamados vale, não importa o que está no documento
      const cfgDoPlano = structuredClone(cfg);
      if (!plan.chamados) cfgDoPlano.fields.chamados_ativos = { value: 'Não, ele resolve sozinho', status: 'confirmado' };
      if (!plan.chamadosAvancados) {
        delete cfgDoPlano.fields.codigo_chamado;
        delete cfgDoPlano.fields.nunca_chamar_humano;
      }
      const r = await responder(
        {
          db: admin,
          assistant: { ...assistant, config: cfgDoPlano },
          conversationId: c.id,
          maxTicketsAbertos: plan.ticketsAbertos,
          cliente: clienteInfo,
          teste,
          sinais,
        },
        (hist ?? []).reverse(),
      );
      resposta = r.texto;
      await logUsage(admin, assistant.owner_id, assistant.id, 'atendimento', r.model, r.usage);
    } catch (e) {
      console.error('[public-chat] IA falhou:', e);
      throw new UserError('Não consegui responder agora. Pode mandar de novo?', 502);
    }

    // avisos que as ferramentas deixaram nesta rodada (horário marcado, remarcado, cancelado)
    const { data: eventos } = await admin
      .from('conversation_messages')
      .select('role, content, author_name, created_at')
      .eq('conversation_id', c.id)
      .eq('role', 'system')
      .like('author_name', 'evento:%')
      .gte('created_at', inicioRodada)
      .order('created_at');
    await admin.from('conversation_messages').insert({ conversation_id: c.id, role: 'assistant', content: resposta });
    const atual = (await conversaDo(assistant.id, visitorId, clienteId, c.id)) ?? c;
    return json({
      ...estado(atual),
      message: resposta,
      eventos: eventos ?? [],
      modo: atual.status === 'bot' || atual.status === 'closed' ? 'bot' : 'humano',
      precisa_login: sinais.pedirLogin === true,
      motivo_login: sinais.motivoLogin ?? null,
    });
  } catch (err) {
    if (err instanceof UserError) return json({ error: err.message }, err.status);
    console.error('[public-chat]', err);
    return json({ error: 'Algo deu errado do nosso lado. Tente de novo em instantes.' }, 500);
  }
});
