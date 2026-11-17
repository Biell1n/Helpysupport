import { useEffect, useRef } from 'react';

const FOCAVEIS = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Janela aberta (modal, gaveta, menu do celular): o foco entra nela, o Tab fica
 * dentro, o Esc fecha e, ao fechar, o foco volta para o botão que abriu.
 */
export function useFocoPreso(aberto, onFechar) {
  const caixa = useRef(null);
  const fechar = useRef(onFechar);
  fechar.current = onFechar;

  useEffect(() => {
    if (!aberto) return undefined;
    const antes = document.activeElement;
    const el = caixa.current;
    // o primeiro campo, se houver; senão o primeiro botão; senão a própria caixa
    const alvo = el?.querySelector('input:not([disabled]):not([type="hidden"]), textarea:not([disabled]), select:not([disabled])') ?? el?.querySelector(FOCAVEIS);
    (alvo ?? el)?.focus?.({ preventScroll: true });

    const tecla = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        fechar.current?.();
        return;
      }
      if (e.key !== 'Tab' || !el) return;
      const itens = [...el.querySelectorAll(FOCAVEIS)].filter((x) => x.offsetParent !== null || x === document.activeElement);
      if (!itens.length) return;
      const primeiro = itens[0];
      const ultimo = itens[itens.length - 1];
      if (e.shiftKey && (document.activeElement === primeiro || !el.contains(document.activeElement))) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && (document.activeElement === ultimo || !el.contains(document.activeElement))) {
        e.preventDefault();
        primeiro.focus();
      }
    };
    document.addEventListener('keydown', tecla);
    return () => {
      document.removeEventListener('keydown', tecla);
      if (antes && typeof antes.focus === 'function' && document.contains(antes)) antes.focus({ preventScroll: true });
    };
  }, [aberto]);

  return caixa;
}
