/**
 * Para onde voltar depois de entrar. Só aceita caminho interno
 * ("/c/abc", "/painel/dados"): nada de "//site.com" ou "https://…",
 * que viraria redirecionamento aberto.
 */
export function destinoSeguro(valor, padrao = '/painel') {
  const v = String(valor ?? '');
  return /^\/(?![/\\])[\w\-./?=&%]*$/.test(v) ? v : padrao;
}

/** Quem chega pelo chat público de um negócio (não é dono de conta). */
export const ehVisitante = (destino) => destino.startsWith('/c/');
