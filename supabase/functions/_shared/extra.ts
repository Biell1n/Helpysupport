// ============================================================
// Uso extra: quando a cota do plano acaba, segue atendendo e cobra à
// parte, até o limite do mês que o dono definiu em Plano.
// ============================================================

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { alertar } from './atendimento.ts';
import { inicioDoMes, type Plan, type PlanId, PRECO_EXTRA, trialExpirado } from './plans.ts';

type PerfilExtra = { id: string; plan: string; extra_ativo?: boolean | null; extra_limite?: number | string | null };

const reais = (n: number) => `R$ ${n.toFixed(2).replace('.', ',')}`;

/** O uso extra está ligado e com limite para esta conta? */
export function extraLigado(p: PerfilExtra) {
  return !!p.extra_ativo && p.plan !== 'trial' && Number(p.extra_limite ?? 0) > 0;
}

/**
 * Tenta cobrir um atendimento ou uma mensagem além do plano. Devolve true
 * se coube no limite (e já somou na conta do mês).
 */
export async function usarExtra(db: SupabaseClient, p: PerfilExtra, tipo: 'atendimento' | 'mensagem'): Promise<boolean> {
  if (!extraLigado(p)) return false;
  const limite = Number(p.extra_limite);
  const { data, error } = await db.rpc('helpy_usar_extra', {
    p_owner: p.id, p_tipo: tipo, p_valor: PRECO_EXTRA[tipo], p_limite: limite,
  });
  if (error) {
    console.error('[extra]', error.message);
    return false;
  }
  const mes = inicioDoMes().slice(0, 7);
  if (data === true) {
    await alertar(db, p.id, {
      origem: 'sistema', chave: `extra:inicio:${mes}`,
      assunto: 'O uso extra começou',
      detalhe: `A cota do plano acabou e o atendimento seguiu pelo uso extra (${reais(PRECO_EXTRA.atendimento)} por atendimento e ${reais(PRECO_EXTRA.mensagem)} por mensagem além do plano), até o limite de ${reais(limite)} neste mês. Acompanhe em Plano.`,
    });
    return true;
  }
  await alertar(db, p.id, {
    origem: 'sistema', chave: `extra:limite:${mes}`,
    assunto: 'O limite do uso extra chegou',
    detalhe: `O uso extra chegou ao limite de ${reais(limite)} deste mês. Até o mês virar, as conversas novas vão para a equipe. Para continuar, aumente o limite ou mude de plano em Plano.`,
  });
  return false;
}

/** Motivo gravado na conversa que chegou com a cota esgotada (o painel não consegue mudar). */
export const MOTIVO_RECADO = 'Chegou com a cota do plano esgotada: o assistente não respondeu.';

/**
 * A equipe devolveu um recado para o assistente. Ele só responde se a conta
 * tiver como pagar esse atendimento (cota que voltou, crédito ou uso extra);
 * senão a conversa continua com a equipe. Gasta uma vez só por conversa.
 */
export async function recadoPodeSeguir(
  db: SupabaseClient,
  conversaId: string,
  p: PerfilExtra & { creditos_extra: number; trial_ends_at: string | null },
  plan: Plan,
): Promise<boolean> {
  let pode = false;
  if (!trialExpirado({ plan: p.plan as PlanId, trial_ends_at: p.trial_ends_at })) {
    const { count: mes } = await db.from('conversations').select('id', { count: 'exact', head: true })
      .eq('owner_id', p.id).eq('teste', false).gte('created_at', inicioDoMes());
    pode = (mes ?? 0) <= plan.atendimentos;
    if (!pode && p.creditos_extra > 0) pode = !!(await db.rpc('helpy_gastar_credito', { p_dono: p.id })).data;
    if (!pode) pode = await usarExtra(db, p, 'atendimento');
  }
  if (pode) await db.from('conversations').update({ motivo: 'Recado devolvido ao assistente pela equipe.' }).eq('id', conversaId);
  else await db.from('conversations').update({ status: 'waiting' }).eq('id', conversaId);
  return pode;
}
