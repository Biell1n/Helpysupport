import { useEffect } from 'react';

const quieto = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const temMouse = () => window.matchMedia?.('(hover: hover) and (pointer: fine)').matches;

/**
 * Dois efeitos de mouse para a página inteira, com um ouvinte só:
 *   [data-luz] → uma luz suave acompanha o mouse dentro do elemento
 *                (o CSS lê --lx e --ly);
 *   [data-ima] → o botão é puxado de leve na direção do mouse, como um ímã.
 * Só em computador com mouse e sem "reduzir movimento".
 */
export function useEfeitosDoMouse() {
  useEffect(() => {
    if (quieto() || !temMouse()) return undefined;
    let ima = null;

    const soltar = () => {
      if (ima) ima.style.transform = '';
      ima = null;
    };

    const mover = (e) => {
      const alvo = e.target instanceof Element ? e.target : null;
      const luz = alvo?.closest('[data-luz]');
      if (luz) {
        const r = luz.getBoundingClientRect();
        luz.style.setProperty('--lx', `${e.clientX - r.left}px`);
        luz.style.setProperty('--ly', `${e.clientY - r.top}px`);
      }
      const novo = alvo?.closest('[data-ima]');
      if (novo !== ima) soltar();
      if (novo) {
        ima = novo;
        const r = novo.getBoundingClientRect();
        const dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
        const dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
        novo.style.transform = `translate(${(dx * 6).toFixed(1)}px, ${(dy * 4).toFixed(1)}px)`;
      }
    };

    document.addEventListener('pointermove', mover, { passive: true });
    document.addEventListener('pointerleave', soltar);
    return () => {
      document.removeEventListener('pointermove', mover);
      document.removeEventListener('pointerleave', soltar);
      soltar();
    };
  }, []);
}
