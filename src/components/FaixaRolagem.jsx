import { useEffect, useRef } from 'react';
import { Marca } from '@/components/Logo';

/**
 * Faixa de frases andando de lado. Anda sozinha devagar; quando a pessoa
 * rola, acelera e segue o sentido da rolagem. A segunda linha vai ao contrário.
 */
export default function FaixaRolagem({ frases }) {
  const linhas = useRef([]);

  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    let raf;
    let ultimoY = window.scrollY;
    let ultimoT = performance.now();
    let vel = 0;
    let sentido = 1;
    const pos = [0, 0];

    const quadro = (t) => {
      const dt = Math.min(64, t - ultimoT);
      ultimoT = t;
      const y = window.scrollY;
      const dy = y - ultimoY;
      ultimoY = y;
      if (dy) sentido = dy > 0 ? 1 : -1;
      // a velocidade da rolagem entra aos poucos e some aos poucos
      vel += (Math.min(40, Math.abs(dy)) - vel) * 0.08;
      const passo = (0.035 + vel * 0.012) * dt * sentido;
      linhas.current.forEach((el, i) => {
        if (!el) return;
        const metade = el.scrollWidth / 2;
        pos[i] = (pos[i] + (i ? passo : -passo)) % metade;
        if (pos[i] > 0) pos[i] -= metade;
        el.style.transform = `translate3d(${pos[i]}px, 0, 0)`;
      });
      raf = requestAnimationFrame(quadro);
    };
    raf = requestAnimationFrame(quadro);
    return () => cancelAnimationFrame(raf);
  }, []);

  const conteudo = (lista) =>
    [0, 1].map((copia) => (
      <span key={copia} className="lp-faixa-copia" aria-hidden={copia === 1 || undefined}>
        {lista.map((f) => (
          <span key={f} className="lp-faixa-item">
            {f}
            <Marca size={30} />
          </span>
        ))}
      </span>
    ));

  const metade = Math.ceil(frases.length / 2);
  return (
    <div className="lp-faixa" role="region" aria-label="O que o atendente faz">
      <div className="lp-faixa-linha" ref={(el) => (linhas.current[0] = el)}>{conteudo(frases.slice(0, metade))}</div>
      <div className="lp-faixa-linha lp-faixa-contorno" ref={(el) => (linhas.current[1] = el)}>{conteudo(frases.slice(metade))}</div>
    </div>
  );
}
