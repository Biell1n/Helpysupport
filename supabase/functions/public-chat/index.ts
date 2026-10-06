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
//   - cota mensal de atendimentos do plano; estourou, vira recado
//   - até 8 conversas novas por visitante por dia
//   - até 6 mensagens por minuto, e um teto por atendimento
// ============================================================

import { corsHeaders, json, UserError } from '../_shared/cors.ts';
import { admin, profileOf, userFrom } from '../_shared/db.ts';
import { logUsage } from '../_shared/ai.ts';
import { type Assistant, responder } from '../_shared/atendimento.ts';
import { inicioDoMes, planOf, trialExpirado } from '../_shared/plans.ts';
import { normalizeConfig, valueOf } from '../_shared/schema.ts';

const MAX_CHARS = 2000;

const RECADO =
  'Obrigado pela mensagem! No momento o atendimento automático está indisponível, mas sua mensagem já chegou para a equipe. Se quiser, deixe aqui seu nome e um contato (WhatsApp ou e-mail) que respondemos por esta mesma conversa.';

type Conversa = {
  id: string;
  assistant_id: string;
  visitor_id: string;
  status: 'bot' | 'waiting' | 'human' | 'closed';
  numero: number | null;
  assumido_nome: string | null;
  assumido_em: string | null;
  escalado_em: string | null;
  nota: number | null;
  teste: boolean;
  last_message_at: string;
};

async function conversaDo(assistantId: string, visitorId: string, id: unknown): Promise<Conversa | null> {
  if (!id || !visitorId) return null;
  const { data } = await admin
    .from('conversations')
    .select('id, assistant_id, visitor_id, status, numero, assumido_nome, assumido_em, escalado_em, nota, teste, last_message_at')
    .eq('id', String(id))
    .maybeSingle();
  if (!data || data.assistant_id !== assistantId || data.visitor_id !== visitorId) return null;
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
      const user = await userFrom(req);
      if (!user) throw new UserError('Entre na sua conta para testar o assistente.', 401);
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
      });
    }

    if (!visitorId) throw new UserError('Visitante não identificado.', 400);

    if (action === 'history') {
      const c = await conversaDo(assistant.id, visitorId, body.conversation_id);
      if (!c || Date.now() - new Date(c.last_message_at).getTime() > 7 * 864e5) return json({ messages: [] });
      const { data: msgs } = await admin
        .from('conversation_messages')
        .select('role, content, author_name, created_at')
        .eq('conversation_id', c.id)
        .in('role', ['user', 'assistant', 'agent'])
        .order('created_at', { ascending: true })
        .limit(100);
      return json({ ...estado(c), messages: msgs ?? [] });
    }

    if (action === 'poll') {
      const c = await conversaDo(assistant.id, visitorId, body.conversation_id);
      if (!c) return json({ messages: [] });
      let q = admin
        .from('conversation_messages')
        .select('role, content, author_name, created_at')
        .eq('conversation_id', c.id)
        .eq('role', 'agent')
        .order('created_at', { ascending: true })
        .limit(30);
      if (body.desde) q = q.gt('created_at', String(body.desde));
      const { data: msgs } = await q;
      return json({ ...estado(c), messages: msgs ?? [] });
    }

    if (action === 'feedback') {
      const c = await conversaDo(assistant.id, visitorId, body.conversation_id);
      const nota = Math.round(Number(body.nota));
      if (!c || !(nota >= 1 && nota <= 5)) throw new UserError('Avaliação inválida.');
      await admin.from('conversations').update({ nota, feedback_texto: String(body.texto ?? '').slice(0, 600) || null }).eq('id', c.id);
      return json({ ok: true });
    }

    if (action === 'encerrar') {
      const c = await conversaDo(assistant.id, visitorId, body.conversation_id);
      if (!c) throw new UserError('Conversa não encontrada.', 404);
      await admin.from('conversations').update({ status: 'closed', fechado_em: new Date().toISOString(), encerrado_por: 'cliente' }).eq('id', c.id);
      return json({ ok: true, status: 'closed' });
    }

    if (action === 'reabrir') {
      const c = await conversaDo(assistant.id, visitorId, body.conversation_id);
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
    let c = await conversaDo(assistant.id, visitorId, body.conversation_id);
    let recado = false;

    if (!c) {
      if (!teste) {
        const umDia = new Date(Date.now() - 864e5).toISOString();
        const { count: hoje } = await admin.from('conversations').select('id', { count: 'exact', head: true })
          .eq('assistant_id', assistant.id).eq('visitor_id', visitorId).gte('created_at', umDia);
        if ((hoje ?? 0) >= 8) throw new UserError('Muitas conversas novas em pouco tempo. Continue na conversa que você já abriu.', 429);

        const { count: mes } = await admin.from('conversations').select('id', { count: 'exact', head: true })
          .eq('owner_id', assistant.owner_id).eq('teste', false).gte('created_at', inicioDoMes());
        if (trialExpirado(profile)) recado = true;
        else if ((mes ?? 0) >= plan.atendimentos) {
          if (profile.creditos_extra > 0) {
            await admin.from('profiles').update({ creditos_extra: profile.creditos_extra - 1 }).eq('id', profile.id);
          } else recado = true;
        }
      }

      const { data: nova, error } = await admin
        .from('conversations')
        .insert({
          assistant_id: assistant.id,
          owner_id: assistant.owner_id,
          visitor_id: visitorId,
          teste,
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
    try {
      const r = await responder(
        { db: admin, assistant: { ...assistant, config: cfg }, conversationId: c.id, maxTicketsAbertos: plan.ticketsAbertos },
        (hist ?? []).reverse(),
      );
      resposta = r.texto;
      await logUsage(admin, assistant.owner_id, assistant.id, 'atendimento', r.model, r.usage);
    } catch (e) {
      console.error('[public-chat] IA falhou:', e);
      throw new UserError('Não consegui responder agora. Pode mandar de novo?', 502);
    }

    await admin.from('conversation_messages').insert({ conversation_id: c.id, role: 'assistant', content: resposta });
    const atual = (await conversaDo(assistant.id, visitorId, c.id)) ?? c;
    return json({ ...estado(atual), message: resposta, modo: atual.status === 'bot' || atual.status === 'closed' ? 'bot' : 'humano' });
  } catch (err) {
    if (err instanceof UserError) return json({ error: err.message }, err.status);
    console.error('[public-chat]', err);
    return json({ error: 'Algo deu errado do nosso lado. Tente de novo em instantes.' }, 500);
  }
});
