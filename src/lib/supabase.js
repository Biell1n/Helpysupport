import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const configurado = Boolean(url && anon);

// Sem as variáveis o app abre uma tela explicando o que falta, em vez de quebrar.
export const supabase = configurado
  ? createClient(url, anon, { auth: { persistSession: true, autoRefreshToken: true } })
  : null;

/**
 * Chama uma edge function e devolve o erro que ela escreveu, não o
 * genérico do cliente ("non-2xx status code").
 */
export async function chamar(funcao, body) {
  const { data, error } = await supabase.functions.invoke(funcao, { body });
  if (error) {
    let msg = error.message || 'Falha na conexão';
    try {
      const txt = await error.context?.text?.();
      if (txt) msg = JSON.parse(txt)?.error || txt;
    } catch {
      /* mantém a mensagem genérica */
    }
    const e = new Error(msg);
    e.status = error.context?.status;
    throw e;
  }
  if (data?.error) throw new Error(data.error);
  return data;
}
