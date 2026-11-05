import { useCallback, useEffect, useRef, useState } from 'react';
import { LETRAS_HELPY, PESSOA, TRACO } from '@/components/MarcaHelpy';

const CHAVE = 'helpy-abertura';

// linha do tempo (segundos): as letras se escrevem, o y se desenha, a cabeça salta,
// a pessoinha dá um pulinho de "aqui!" e o nome voa até o topo do site
const T = { voa: 2.45, fim: 3.2 };

/** Mostra a abertura uma vez por visita, e nunca para quem pediu menos movimento. */
export function deveMostrarAbertura() {
  if (typeof window === 'undefined') return false;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return false;
  if (/[?&]sem-abertura\b/.test(window.location.search)) return false;
  try {
    return sessionStorage.getItem(CHAVE) !== '1';
  } catch {
    return true;
  }
}

export default function IntroLogo({ onSaindo, onFim }) {
  const logo = useRef(null);
  const [fase, setFase] = useState('entra');
  const [pulou, setPulou] = useState(false);

  const sair = useCallback((pulouAgora) => {
    try {
      sessionStorage.setItem(CHAVE, '1');
    } catch {
      /* sem armazenamento: só aparece de novo na próxima visita */
    }
    setFase('sai');
    setPulou(pulouAgora);
    onSaindo?.();
    // o nome voa até onde fica o logo do topo
    const alvo = document.querySelector('.lp-top-marca svg, .lp-top-marca');
    const el = logo.current;
    if (!pulouAgora && alvo && el) {
      const a = alvo.getBoundingClientRect();
      const b = el.getBoundingClientRect();
      const escala = a.height / b.height || 0.1;
      el.animate(
        [{ transform: 'none' }, { transform: `translate(${a.left - b.left}px, ${a.top - b.top}px) scale(${escala})` }],
        { duration: (T.fim - T.voa) * 1000, easing: 'cubic-bezier(0.7, 0, 0.2, 1)', fill: 'forwards' },
      );
    }
    setTimeout(() => onFim?.(), pulouAgora ? 420 : (T.fim - T.voa) * 1000);
  }, [onSaindo, onFim]);

  useEffect(() => {
    const t = setTimeout(() => sair(false), T.voa * 1000);
    return () => clearTimeout(t);
  }, [sair]);

  return (
    <div className="abertura abertura-assina" data-fase={fase} data-pulou={pulou || undefined} aria-hidden="true">
      <div className="abertura-fundo" />
      <div className="abertura-logo" ref={logo} style={{ transformOrigin: '0 0' }}>
        <svg className="abertura-svg" viewBox="-6 -160 534 236">
          <g fill="none" stroke="#1E4FE6" strokeWidth={TRACO} strokeLinecap="round" strokeLinejoin="round">
            {LETRAS_HELPY.map((d, i) => (
              <path key={d} d={d} pathLength="1" className="ab-letra" style={{ '--i': i }} />
            ))}
          </g>
          <g className="ab-pessoa">
            <path d={PESSOA.corpo} pathLength="1" className="ab-letra ab-y" fill="none" stroke="#1E4FE6" strokeWidth={TRACO} strokeLinecap="round" strokeLinejoin="round" />
            <circle className="ab-cabeca" {...PESSOA.cabeca} fill="#1E4FE6" />
          </g>
        </svg>
      </div>
      <button type="button" className="abertura-pular" onClick={() => sair(true)} aria-hidden="false">Pular</button>
    </div>
  );
}
