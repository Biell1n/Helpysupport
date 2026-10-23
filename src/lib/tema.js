import { useSyncExternalStore } from 'react';

// Tema da tela: claro, escuro ou automático (segue o do sistema, como no Windows).
const CHAVE = 'helpy_tema';
export const TEMAS = ['claro', 'escuro', 'sistema'];

function lerTema() {
  try {
    const t = localStorage.getItem(CHAVE);
    return TEMAS.includes(t) ? t : 'claro';
  } catch {
    return 'claro';
  }
}

let atual = typeof window === 'undefined' ? 'claro' : lerTema();
const ouvintes = new Set();
const mq = typeof window !== 'undefined' ? window.matchMedia?.('(prefers-color-scheme: dark)') : null;

/** Pinta a página no tema escolhido. */
function pintar() {
  const escuro = atual === 'escuro' || (atual === 'sistema' && !!mq?.matches);
  document.documentElement.dataset.tema = escuro ? 'escuro' : 'claro';
}

/** Chamado antes do React montar, para a página não piscar no tema errado. */
export function iniciarTema() {
  pintar();
  // no automático, acompanha o sistema na hora em que ele muda
  mq?.addEventListener?.('change', () => atual === 'sistema' && pintar());
}

export function trocarTema(novo) {
  if (!TEMAS.includes(novo) || novo === atual) return;
  atual = novo;
  try {
    localStorage.setItem(CHAVE, novo);
  } catch { /* sem armazenamento, vale só nesta aba */ }
  const raiz = document.documentElement;
  raiz.dataset.temaTrocando = '';
  pintar();
  setTimeout(() => delete raiz.dataset.temaTrocando, 300);
  ouvintes.forEach((f) => f());
}

/** Tema escolhido (o mesmo em todas as telas abertas) e como trocar. */
export function useTema() {
  const tema = useSyncExternalStore(
    (f) => {
      ouvintes.add(f);
      return () => ouvintes.delete(f);
    },
    () => atual,
    () => 'claro',
  );
  return [tema, trocarTema];
}
