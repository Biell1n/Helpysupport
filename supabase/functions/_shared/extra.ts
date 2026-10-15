// ============================================================
// Uso extra: quando a cota do plano acaba, segue atendendo e cobra à
// parte, até o limite do mês que o dono definiu em Plano.
// ============================================================

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { alertar } from './atendimento.ts';
import { inicioDoMes, PRECO_EXTRA } from './plans.ts';

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
