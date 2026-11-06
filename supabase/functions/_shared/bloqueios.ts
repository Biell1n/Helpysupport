// ============================================================
// Bloqueios: timeout (com prazo) ou banimento (sem prazo) de quem gasta o
// atendimento à toa. Vale para a pessoa: navegador, conta, contato do
// WhatsApp/Instagram/Discord e, no primeiro dia, a rede.
// ============================================================

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

export type Bloqueio = { ate: string | null; banido: boolean };
type Quem = { visitorId?: string | null; ipHash?: string | null; clienteId?: string | null };

/** Tempo que o assistente pode dar sozinho (minutos). Banir é só com a equipe. */
export const TIMEOUT_MIN = 15;
export const TIMEOUT_MAX = 24 * 60;

/** Bloqueio que vale agora para esta pessoa, ou null. */
export async function bloqueioAtivo(db: SupabaseClient, ownerId: string, q: Quem): Promise<Bloqueio | null> {
  const agora = new Date().toISOString();
  const umDia = new Date(Date.now() - 864e5).toISOString();
  const base = () =>
    db.from('bloqueios').select('ate').eq('owner_id', ownerId).is('removido_em', null).or(`ate.is.null,ate.gt.${agora}`).limit(5);
  // consultas separadas (e não um "or" com o texto do visitante dentro, que vem do navegador)
  const consultas = [
    q.visitorId ? base().eq('visitor_id', q.visitorId) : null,
    q.clienteId ? base().eq('cliente_id', q.clienteId) : null,
    q.ipHash ? base().eq('ip_hash', q.ipHash).gte('criado_em', umDia) : null,
  ].filter(Boolean);
  if (!consultas.length) return null;
  const linhas = (await Promise.all(consultas)).flatMap((r) => (r as { data: { ate: string | null }[] | null }).data ?? []);
  if (!linhas.length) return null;
  if (linhas.some((l) => l.ate == null)) return { ate: null, banido: true };
  const ate = linhas.map((l) => l.ate as string).sort().at(-1) as string;
  return { ate, banido: false };
}

/** O que a pessoa bloqueada lê no chat. */
export function textoDoBloqueio(b: Bloqueio): string {
  if (b.banido || !b.ate) return 'O atendimento por aqui não está disponível para você.';
  const d = new Date(b.ate);
  const fuso = { timeZone: 'America/Sao_Paulo' } as const;
  const hora = d.toLocaleTimeString('pt-BR', { ...fuso, hour: '2-digit', minute: '2-digit' });
  const dia = d.toLocaleDateString('pt-BR', { ...fuso, day: '2-digit', month: '2-digit' });
  const hoje = new Date().toLocaleDateString('pt-BR', { ...fuso, day: '2-digit', month: '2-digit' });
  return `O atendimento por aqui está pausado até ${dia === hoje ? hora : `${dia} às ${hora}`} (horário de Brasília). Depois disso, é só mandar mensagem de novo.`;
}

/** Bloqueia a pessoa desta conversa (minutos = null bane). Marca a conversa para o painel. */
export async function bloquearConversa(
  db: SupabaseClient,
  conversationId: string,
  opcoes: { minutos: number | null; motivo: string; por: 'assistente' | 'equipe'; porNome?: string | null },
): Promise<Bloqueio | null> {
  const { data: c } = await db.from('conversations').select('owner_id, visitor_id, ip_hash, cliente_id').eq('id', conversationId).maybeSingle();
  if (!c) return null;
  const ate = opcoes.minutos == null ? null : new Date(Date.now() + opcoes.minutos * 60e3).toISOString();
  const { error } = await db.from('bloqueios').insert({
    owner_id: c.owner_id, conversation_id: conversationId, visitor_id: c.visitor_id, ip_hash: c.ip_hash, cliente_id: c.cliente_id,
    ate, motivo: opcoes.motivo.slice(0, 300) || null, por: opcoes.por, por_nome: opcoes.porNome ?? null,
  });
  if (error) throw error;
  await db.from('conversations').update({ bloqueado_ate: ate, banido: ate == null }).eq('id', conversationId);
  return { ate, banido: ate == null };
}
