import { useEffect, useState } from 'react';
import { useNaTela } from '@/components/Reveal';

/** Número que conta de zero até o valor quando aparece na tela. */
export default function Contador({ valor, duracao = 1400, atraso = 0 }) {
  const [ref, visto] = useNaTela({ threshold: 0.4 });
  const [n, setN] = useState(0);

  useEffect(() => {
    if (!visto) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return setN(valor);
    let raf;
    let inicio;
    const quadro = (t) => {
      if (!inicio) inicio = t + atraso;
      const p = Math.max(0, Math.min(1, (t - inicio) / duracao));
      setN(Math.round(valor * (1 - (1 - p) ** 4)));
      if (p < 1) raf = requestAnimationFrame(quadro);
    };
    raf = requestAnimationFrame(quadro);
    return () => cancelAnimationFrame(raf);
  }, [visto, valor, duracao, atraso]);

  return (
    <span ref={ref} style={{ fontVariantNumeric: 'tabular-nums' }}>
      {n.toLocaleString('pt-BR')}
    </span>
  );
}
