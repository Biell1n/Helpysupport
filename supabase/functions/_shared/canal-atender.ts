// ============================================================
// Atendimento pelos canais (WhatsApp, Instagram, Discord).
//
// Uma mensagem que chega por qualquer canal passa pelas mesmas regras do
// chat público: cotas do plano, equipe que assumiu, limite por conversa
// e o mesmo atendente. Quem chama devolve a resposta pelo canal.
// ============================================================

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { logUsage } from './ai.ts';
import { alertar, type Assistant, responder } from './atendimento.ts';
import { profileOf } from './db.ts';
import { inicioDoMes, planOf, trialExpirado } from './plans.ts';
import { type Canal, NOMES } from './canais.ts';

const PASSOU_PARA_EQUIPE =
  'Vou passar para alguém da equipe continuar daqui. É só aguardar: respondemos por aqui mesmo.';
const RECADO =
  'Recebemos sua mensagem! No momento o atendimento automático está indisponível, mas ela já chegou para a equipe, que responde por aqui mesmo.';
type Conversa = { id: string; status: string; escalado_em: string | null; last_message_at: string };

/**
 * Recebe a mensagem de um contato num canal e devolve o que responder
 * (ou null quando a equipe está no atendimento e a IA não deve falar).
 */
export async function atenderNoCanal(
  db: SupabaseClient,
  canal: Canal,
  contato: { id: string; nome?: string | null; telefone?: string | null },
  texto: string,
): Promise<string | null> {
  texto = texto.trim().slice(0, 2000);
  if (!texto) return null;

  const { data: assistant } = await db.from('assistants').select('*').eq('id', canal.assistant_id).maybeSingle();
  if (!assistant) return null;
  const profile = await profileOf(canal.owner_id);
  const plan = planOf(profile);
  await db.from('canais').update({ ultimo_evento_em: new Date().toISOString() }).eq('id', canal.id);

  if (canal.tipo !== 'discord' && plan.canaisMeta === 0) {
    await alertar(db, canal.owner_id, {
      origem: 'sistema', chave: `plano:canal:${canal.id}`,
      assunto: `Mensagem no ${NOMES[canal.tipo]} sem resposta automática`,
      detalhe: `Chegou uma mensagem pelo ${NOMES[canal.tipo]}, mas esse canal faz parte do plano Profissional em diante. Mude de plano para o assistente responder por lá.`,
    });
    return null;
  }

  // conversa aberta com este contato (ou uma nova)
  const { data: ultima } = await db.from('conversations')
    .select('id, status, escalado_em, last_message_at')
    .eq('canal_id', canal.id).eq('contato_externo', contato.id)
    .order('last_message_at', { ascending: false }).limit(1).maybeSingle();
  let c = ultima as Conversa | null;
  const velha = c && c.status === 'closed' && Date.now() - new Date(c.last_message_at).getTime() > 12 * 3600e3;
  let recado = false;

  if (!c || velha) {
    const { count: mes } = await db.from('conversations').select('id', { count: 'exact', head: true })
      .eq('owner_id', canal.owner_id).eq('teste', false).gte('created_at', inicioDoMes());
    if (trialExpirado(profile)) recado = true;
    else if ((mes ?? 0) >= plan.atendimentos) {
      if (profile.creditos_extra > 0) {
        await db.from('profiles').update({ creditos_extra: profile.creditos_extra - 1 }).eq('id', profile.id);
      } else recado = true;
    }
    const contatoTexto = contato.telefone ? `+${contato.telefone}` : `${NOMES[canal.tipo]} ${contato.id}`;
    const { data: nova, error } = await db.from('conversations').insert({
      assistant_id: canal.assistant_id,
      owner_id: canal.owner_id,
      visitor_id: `${canal.tipo}:${contato.id}`,
      canal_id: canal.id,
      contato_externo: contato.id,
      lead_nome: contato.nome?.slice(0, 120) || null,
      lead_contato: contatoTexto.slice(0, 120),
      ...(recado
        ? { status: 'waiting', titulo: 'Recado', motivo: 'Chegou com a cota do plano esgotada: o assistente não respondeu.', escalado_em: new Date().toISOString() }
        : {}),
    }).select('id, status, escalado_em, last_message_at').single();
    if (error) throw error;
    c = nova as Conversa;
  } else if (c.status === 'closed') {
    const status = c.escalado_em ? 'waiting' : 'bot';
    await db.from('conversations').update({ status, fechado_em: null, encerrado_por: null }).eq('id', c.id);
    c.status = status;
  }

  await db.from('conversation_messages').insert({ conversation_id: c.id, role: 'user', content: texto });

  if (recado) {
    await db.from('conversation_messages').insert({ conversation_id: c.id, role: 'system', content: RECADO });
    return RECADO;
  }
  // a equipe está no atendimento: a IA não fala por cima
  if (c.status === 'waiting' || c.status === 'human') return null;

  // teto por conversa e total de mensagens do mês: passa para a equipe
  const { count: daConversa } = await db.from('conversation_messages').select('id', { count: 'exact', head: true })
    .eq('conversation_id', c.id).eq('role', 'user');
  const { count: doMes } = await db.from('conversation_messages')
    .select('id, conversations!inner(owner_id, teste)', { count: 'exact', head: true })
    .eq('role', 'user').eq('conversations.owner_id', canal.owner_id).eq('conversations.teste', false)
    .gte('created_at', inicioDoMes());
  if ((daConversa ?? 0) > plan.msgsPorAtendimento || (doMes ?? 0) > plan.mensagens) {
    await db.from('conversations').update({
      status: 'waiting', titulo: 'Conversa longa', escalado_em: new Date().toISOString(),
      motivo: (doMes ?? 0) > plan.mensagens ? 'As mensagens do mês do plano acabaram.' : 'Passou do limite de mensagens por atendimento.',
    }).eq('id', c.id);
    await db.from('conversation_messages').insert({ conversation_id: c.id, role: 'assistant', content: PASSOU_PARA_EQUIPE });
    return PASSOU_PARA_EQUIPE;
  }

  const { data: hist } = await db.from('conversation_messages').select('role, content')
    .eq('conversation_id', c.id).in('role', ['user', 'assistant', 'agent'])
    .order('created_at', { ascending: false }).limit(24);

  const cfg = structuredClone((assistant as Assistant).config);
  if (!plan.chamadosAvancados) {
    delete cfg.fields.codigo_chamado;
    delete cfg.fields.nunca_chamar_humano;
  }
  const r = await responder({
    db,
    assistant: { ...(assistant as Assistant), config: cfg },
    conversationId: c.id,
    maxTicketsAbertos: plan.ticketsAbertos,
    integracoes: plan.integracoes,
    cliente: null,
    canal: { tipo: canal.tipo, contato: contato.id, nome: contato.nome ?? null },
    teste: false,
    sinais: {},
  }, (hist ?? []).reverse());
  await logUsage(db, canal.owner_id, canal.assistant_id, 'atendimento', r.model, r.usage);
  await db.from('conversation_messages').insert({ conversation_id: c.id, role: 'assistant', content: r.texto });
  return r.texto;
}
