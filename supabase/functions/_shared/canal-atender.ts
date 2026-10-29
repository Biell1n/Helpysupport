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
import { profileOf, usoDoMes } from './db.ts';
import { planOf, trialExpirado } from './plans.ts';
import { type Canal, enviarPeloCanal, noPrivadoDoDiscord, NOMES } from './canais.ts';
import { MOTIVO_RECADO, recadoPodeSeguir, usarExtra } from './extra.ts';

const PASSOU_PARA_EQUIPE =
  'Vou passar para alguém da equipe continuar daqui. É só aguardar: respondemos por aqui mesmo.';
const RECADO =
  'Recebemos sua mensagem! No momento o atendimento automático está indisponível, mas ela já chegou para a equipe, que responde por aqui mesmo.';
/**
 * Cada app formata de um jeito: o WhatsApp usa *negrito*, o Discord entende
 * **negrito** e o Instagram não tem formatação (os asteriscos apareceriam).
 */
export function paraOCanal(tipo: string, texto: string | null): string | null {
  if (!texto) return texto;
  const lista = texto.replace(/^(\s*)[-*]\s+/gm, '$1• ');
  if (tipo === 'discord') return texto;
  if (tipo === 'whatsapp') return lista.replace(/\*\*([^*\n]+)\*\*/g, '*$1*');
  return lista.replace(/\*\*([^*\n]+)\*\*/g, '$1');
}

/** Quanto esperar por mais mensagens do mesmo contato antes de responder. */
const ESPERA_MS = 3500;
/** Acima disso por minuto, o contato está disparando: não chama a IA. */
const MAX_POR_MINUTO = 12;
type Conversa = { id: string; status: string; escalado_em: string | null; last_message_at: string; motivo?: string | null };

/**
 * Recebe a mensagem de um contato num canal e devolve o que responder
 * (ou null quando a equipe está no atendimento e a IA não deve falar).
 */
export async function atenderNoCanal(
  db: SupabaseClient,
  canal: Canal,
  contato: { id: string; nome?: string | null; telefone?: string | null; rotulo?: string | null },
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
      detalhe: `Chegou uma mensagem pelo ${NOMES[canal.tipo]}, mas o seu plano não inclui esse canal. Mude de plano para o assistente responder por lá.`,
    });
    return null;
  }

  // conversa aberta com este contato (ou uma nova)
  const { data: ultima } = await db.from('conversations')
    .select('id, status, escalado_em, last_message_at, motivo')
    .eq('owner_id', canal.owner_id).eq('canal_id', canal.id).eq('contato_externo', contato.id)
    .order('last_message_at', { ascending: false }).limit(1).maybeSingle();
  let c = ultima as Conversa | null;
  const parada = c ? Date.now() - new Date(c.last_message_at).getTime() : 0;
  // conversa só com o assistente, parada há um dia: o atendimento acabou. Fecha e a
  // próxima mensagem abre outro (senão um contato vira um atendimento eterno)
  if (c && c.status === 'bot' && parada > 24 * 3600e3) {
    await db.from('conversations').update({ status: 'closed', fechado_em: new Date().toISOString(), encerrado_por: 'assistente' }).eq('id', c.id);
    c.status = 'closed';
  }
  const velha = c && c.status === 'closed' && parada > 12 * 3600e3;
  let recado = false;

  if (!c || velha) {
    const { atendimentos: mes } = await usoDoMes(db, canal.owner_id);
    if (trialExpirado(profile)) recado = true;
    else if (mes >= plan.atendimentos) {
      const { data: gastou } = profile.creditos_extra > 0 ? await db.rpc('helpy_gastar_credito', { p_dono: profile.id }) : { data: false };
      if (!gastou && !(await usarExtra(db, profile, 'atendimento'))) recado = true;
    }
    const contatoTexto = contato.rotulo || (contato.telefone ? `+${contato.telefone}` : `${NOMES[canal.tipo]} ${contato.id}`);
    const { data: nova, error } = await db.from('conversations').insert({
      assistant_id: canal.assistant_id,
      owner_id: canal.owner_id,
      visitor_id: `${canal.tipo}:${contato.id}`,
      canal_id: canal.id,
      contato_externo: contato.id,
      lead_nome: contato.nome?.slice(0, 120) || null,
      lead_contato: contatoTexto.slice(0, 120),
      ...(recado
        ? { status: 'waiting', titulo: 'Recado', motivo: MOTIVO_RECADO, escalado_em: new Date().toISOString() }
        : {}),
    }).select('id, status, escalado_em, last_message_at').single();
    if (error) throw error;
    c = nova as Conversa;
  } else if (c.status === 'closed') {
    const status = c.escalado_em ? 'waiting' : 'bot';
    await db.from('conversations').update({ status, fechado_em: null, encerrado_por: null }).eq('id', c.id);
    c.status = status;
  }

  const { data: minha } = await db.from('conversation_messages')
    .insert({ conversation_id: c.id, role: 'user', content: texto }).select('id, created_at').single();

  if (recado) {
    await db.from('conversation_messages').insert({ conversation_id: c.id, role: 'system', content: RECADO });
    return RECADO;
  }
  // a equipe está no atendimento: a IA não fala por cima
  if (c.status === 'waiting' || c.status === 'human') return null;

  // no WhatsApp/Instagram a pessoa manda várias mensagens seguidas: espera um pouco e
  // só a última responde, já lendo todas (uma resposta, na ordem, e sem gastar IA à toa)
  if (canal.tipo !== 'discord' && minha) {
    await new Promise((r) => setTimeout(r, ESPERA_MS));
    const { data: ultimaMsg } = await db.from('conversation_messages').select('id')
      .eq('conversation_id', c.id).eq('role', 'user')
      .order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (ultimaMsg && ultimaMsg.id !== minha.id) return null;
    // contato disparando mensagens (robô ou abuso): guarda, mas não chama a IA
    const { count: noMinuto } = await db.from('conversation_messages').select('id', { count: 'exact', head: true })
      .eq('conversation_id', c.id).eq('role', 'user').gte('created_at', new Date(Date.now() - 60e3).toISOString());
    if ((noMinuto ?? 0) > MAX_POR_MINUTO) return null;
  }
  // recado que a equipe devolveu ao assistente: só responde se a conta cobrir este atendimento
  if (c.motivo === MOTIVO_RECADO && !(await recadoPodeSeguir(db, c.id, profile, plan))) {
    await db.from('conversation_messages').insert({ conversation_id: c.id, role: 'system', content: RECADO });
    return RECADO;
  }

  // teto por conversa e total de mensagens do mês: passa para a equipe
  const { count: daConversa } = await db.from('conversation_messages').select('id', { count: 'exact', head: true })
    .eq('conversation_id', c.id).eq('role', 'user');
  const doMes = (await usoDoMes(db, canal.owner_id)).mensagens;
  // além das mensagens do plano, o uso extra pode cobrir (se estiver ligado e couber no limite)
  const passouConversa = (daConversa ?? 0) > plan.msgsPorAtendimento;
  const semMensagens = !passouConversa && doMes > plan.mensagens && !(await usarExtra(db, profile, 'mensagem'));
  if (passouConversa || semMensagens) {
    await db.from('conversations').update({
      status: 'waiting', titulo: 'Conversa longa', escalado_em: new Date().toISOString(),
      motivo: semMensagens ? 'As mensagens do mês do plano acabaram.' : 'Passou do limite de mensagens por atendimento.',
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
  return paraOCanal(canal.tipo, r.texto);
}

/**
 * A equipe respondeu em Avisos uma dúvida que o assistente não sabia. O
 * assistente recebe a informação (o cliente não vê o texto da equipe) e
 * continua o atendimento ele mesmo: responde a dúvida que estava aberta e
 * segue para o próximo passo, pelo mesmo canal.
 */
export async function retomarComRetorno(
  db: SupabaseClient,
  conversaId: string,
  dono: string,
  retorno: { pergunta: string; resposta: string },
): Promise<boolean> {
  const { data: c } = await db.from('conversations')
    .select('id, owner_id, assistant_id, status, canal_id, contato_externo, lead_nome, last_message_at, teste').eq('id', conversaId).maybeSingle();
  if (!c || c.owner_id !== dono || c.status === 'closed' || c.status === 'human') return false;
  // passou de um dia: a pessoa já foi embora (e o WhatsApp só deixa responder em 24 h)
  if (Date.now() - new Date(c.last_message_at).getTime() > 24 * 3600e3) return false;
  const { data: assistant } = await db.from('assistants').select('*').eq('id', c.assistant_id).maybeSingle();
  if (!assistant) return false;
  const plan = planOf(await profileOf(dono));
  const canal = c.canal_id ? ((await db.from('canais').select('*').eq('id', c.canal_id).maybeSingle()).data as Canal | null) : null;

  const { data: hist } = await db.from('conversation_messages').select('role, content')
    .eq('conversation_id', c.id).in('role', ['user', 'assistant', 'agent'])
    .order('created_at', { ascending: false }).limit(24);
  const historico = [
    ...(hist ?? []).reverse(),
    { role: 'user', content: '[o cliente aguarda o retorno da equipe]' },
  ];
  const cfg = structuredClone((assistant as Assistant).config);
  if (!plan.chamadosAvancados) {
    delete cfg.fields.codigo_chamado;
    delete cfg.fields.nunca_chamar_humano;
  }
  const tipo = canal?.tipo as 'whatsapp' | 'instagram' | 'discord' | undefined;
  const r = await responder({
    db,
    assistant: { ...(assistant as Assistant), config: cfg },
    conversationId: c.id,
    maxTicketsAbertos: plan.ticketsAbertos,
    integracoes: plan.integracoes,
    cliente: null,
    canal: canal && tipo ? { tipo, contato: c.contato_externo, nome: c.lead_nome ?? null } : null,
    teste: !!c.teste,
    sinais: {},
    retorno,
  }, historico);
  if (!r.texto) return false;
  await logUsage(db, dono, c.assistant_id, 'atendimento', r.model, r.usage);
  // "retorno": o chat do site busca e mostra mesmo sem ninguém da equipe atendendo
  await db.from('conversation_messages').insert({ conversation_id: c.id, role: 'assistant', content: r.texto, author_name: 'retorno' });
  await db.from('conversations').update({ last_message_at: new Date().toISOString() }).eq('id', c.id);
  if (canal && c.contato_externo) {
    const texto = paraOCanal(canal.tipo, r.texto);
    if (texto) await enviarPeloCanal(db, canal, c.contato_externo, texto).catch((e) => console.warn('[retorno] canal', e?.message));
    // Discord: avisa no privado que a resposta chegou (a pessoa pode ter saído do servidor)
    if (canal.tipo === 'discord' && c.contato_externo.startsWith('ticket:')) {
      await noPrivadoDoDiscord(db, canal, c.contato_externo.slice(7), '💬 Chegou a resposta da sua dúvida. Veja no seu atendimento.');
    }
  }
  return true;
}
