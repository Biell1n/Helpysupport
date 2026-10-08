import { supabase } from '@/lib/supabase';

/** Mude quando os termos mudarem: quem aceitou a versão antiga aceita de novo. */
export const TERMOS_VERSAO = '2026-10';

const CHAVE = 'helpy_termos_pendente';

/** Marcado antes de ir para o Google: o aceite é gravado na volta. */
export function lembrarAceite(tipo) {
  try {
    localStorage.setItem(CHAVE, TERMOS_VERSAO);
    // conta nova pelo Google nasce "empresa"; quem escolheu cliente é ajustado na volta
    if (tipo === 'cliente') localStorage.setItem('helpy_tipo_pendente', 'cliente');
  } catch {
    /* sem armazenamento, o aceite é pedido no painel */
  }
}

export async function gravarAceitePendente() {
  let v = null;
  try {
    v = localStorage.getItem(CHAVE);
    localStorage.removeItem(CHAVE);
  } catch {
    return false;
  }
  if (!v) return false;
  const { error } = await supabase.rpc('helpy_aceitar_termos', { p_versao: v });
  return !error;
}

export const aceitar = () => supabase.rpc('helpy_aceitar_termos', { p_versao: TERMOS_VERSAO });

/** Volta do Google de quem escolheu "Sou cliente": ajusta a conta recém-criada. */
export async function aplicarTipoPendente(chamar) {
  let t = null;
  try {
    t = localStorage.getItem('helpy_tipo_pendente');
    localStorage.removeItem('helpy_tipo_pendente');
  } catch {
    return false;
  }
  if (t !== 'cliente') return false;
  try {
    await chamar('conta', { action: 'virar_cliente' });
    return true;
  } catch {
    return false;
  }
}
