import { chamar } from '@/lib/supabase';

/**
 * A equipe mudou o status de uma conversa que veio de um canal (assumiu,
 * devolveu, encerrou, reabriu): avisa o canal. No ticket do Discord, isso
 * aparece no tópico e fecha ou reabre o tópico junto. Não trava a tela se
 * falhar: o status no painel já mudou.
 */
export function avisarNoCanal(conversa) {
  if (!conversa?.canal_id) return;
  chamar('canais', { action: 'sincronizar', conversation_id: conversa.id }).catch((e) => console.warn('[canal] sincronizar', e?.message));
}
