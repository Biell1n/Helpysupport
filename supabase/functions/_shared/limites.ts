// ============================================================
// O que a conta tem além do que o plano cobre.
//
// Quem desce de plano (ou deixa o teste vencer) fica com o que já tinha
// criado, mas só o que cabe no plano funciona: os mais antigos ficam,
// os mais novos param. Nada é apagado; voltando ao plano, volta a funcionar.
// ============================================================

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { Plan } from './plans.ts';

/** Os ids que cabem no plano, na ordem em que foram criados. */
async function primeiros(db: SupabaseClient, tabela: string, coluna: string, ownerId: string, limite: number, filtro?: (q: any) => any) {
  // deno-lint-ignore no-explicit-any
  let q: any = db.from(tabela).select('id').eq('owner_id', ownerId).order(coluna, { ascending: true }).order('id', { ascending: true }).limit(Math.max(0, limite));
  if (filtro) q = filtro(q);
  const { data } = await q;
  return new Set(((data ?? []) as { id: string }[]).map((r) => r.id));
}

/** O assistente está entre os que o plano cobre? */
export async function assistenteNoPlano(db: SupabaseClient, ownerId: string, assistantId: string, plan: Plan) {
  if (plan.assistentes <= 0) return false;
  return (await primeiros(db, 'assistants', 'created_at', ownerId, plan.assistentes)).has(assistantId);
}

/** WhatsApp e Instagram contam no limite do plano (o Discord é livre). */
export async function canalNoPlano(db: SupabaseClient, ownerId: string, canal: { id: string; tipo: string }, plan: Plan) {
  if (canal.tipo === 'discord') return true;
  if (plan.canaisMeta <= 0) return false;
  return (await primeiros(db, 'canais', 'criado_em', ownerId, plan.canaisMeta, (q) => q.in('tipo', ['whatsapp', 'instagram']))).has(canal.id);
}

/** As tabelas que o plano cobre (e, sem integrações no plano, nada de API nem banco SQL). */
export async function tabelasNoPlano(db: SupabaseClient, ownerId: string, plan: Plan) {
  const ids = await primeiros(db, 'tabelas', 'criada_em', ownerId, plan.tabelas);
  return { ids, integracoes: plan.integracoes };
}

export const FORA_DO_PLANO = 'Este atendimento está pausado no momento.';
