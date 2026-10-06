import { useEffect, useRef, useState } from 'react';

/** Avisa quando o elemento entra na tela (uma vez só). */
export function useNaTela(opcoes = { threshold: 0.18, rootMargin: '0px 0px -8% 0px' }) {
  const ref = useRef(null);
  const [visto, setVisto] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!('IntersectionObserver' in window)) {
      setVisto(true);
      return;
    }
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) {
        setVisto(true);
        obs.disconnect();
      }
    }, opcoes);
    obs.observe(el);
    return () => obs.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return [ref, visto];
}

/**
 * Faz o conteúdo surgir quando a pessoa rola até ele.
 * atraso em ms permite escalonar itens de uma lista.
 */
export default function Reveal({ as: Tag = 'div', atraso = 0, className = '', style, children, ...resto }) {
  const [ref, visto] = useNaTela();
  return (
    <Tag
      ref={ref}
      className={`reveal ${className}`}
      data-visto={visto ? 'true' : 'false'}
      style={{ ...style, '--atraso': `${atraso}ms` }}
      {...resto}
    >
      {children}
    </Tag>
  );
}
