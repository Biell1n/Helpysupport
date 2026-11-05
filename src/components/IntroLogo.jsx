import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { LETRAS_HELPY, PESSOA, TRACO, TRACO_PESSOA } from '@/components/MarcaHelpy';

const CHAVE = 'helpy-abertura';

// A história, numa linha do tempo só (segundos), calculada quadro a quadro:
// a pessoinha (o Y) se desenha sozinha no meio e faz um "aqui!"; a caneta escreve
// "help" num gesto contínuo enquanto ela desliza até o lugar dela; quando a ajuda
// chega, um pulinho de alegria; e o nome voa até o logo do topo.
const T = {
  y: [0.05, 0.6], // o y se desenha
  cabeca: [0.42, 0.9], // a cabeça aparece
  aqui: [0.75, 1.25], // levanta e assenta: "aqui!"
  escreve: [1.15, 2.55], // a caneta escreve "help"
  alegria: [2.55, 3.05], // pulinho
  voa: 3.2,
  fim: 4.05,
};
const DESLOCA = 205; // quanto o y começa à esquerda (fica no centro do nome)

const cl = (x) => Math.max(0, Math.min(1, x));
const jan = (t, [a, b]) => cl((t - a) / (b - a));
const suave = (x) => 0.5 - Math.cos(Math.PI * x) / 2; // acelera e desacelera uma vez
const saida = (x) => 1 - Math.pow(1 - x, 3);
const mola = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : 1 + 2.2 * Math.pow(x - 1, 3) + 1.2 * Math.pow(x - 1, 2));
const sino = (x) => Math.sin(Math.PI * x); // sobe e volta

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
  const letras = useRef([]);
  const traco = useRef(null);
  const y = useRef(null);
  const pessoa = useRef(null);
  const cabeca = useRef(null);
  const [fase, setFase] = useState('entra');
  const [pulou, setPulou] = useState(false);
  const saiu = useRef(false);

  const sair = useCallback((pulouAgora) => {
    if (saiu.current) return;
    saiu.current = true;
    try {
      sessionStorage.setItem(CHAVE, '1');
    } catch {
      /* sem armazenamento: só aparece de novo na próxima visita */
    }
    setFase('sai');
    setPulou(pulouAgora);
    onSaindo?.();
    const dur = (T.fim - T.voa) * 1000;
    // o nome voa até o logo do topo e o traço afina no caminho
    const alvo = document.querySelector('.lp-top-marca svg, .lp-top-marca');
    const el = logo.current;
    if (!pulouAgora && alvo && el) {
      const a = alvo.getBoundingClientRect();
      const b = el.getBoundingClientRect();
      const escala = a.height / b.height || 0.1;
      const curva = 'cubic-bezier(0.65, 0, 0.25, 1)';
      el.animate(
        [{ transform: 'none' }, { transform: `translate(${a.left - b.left}px, ${a.top - b.top}px) scale(${escala})` }],
        { duration: dur, easing: curva, fill: 'forwards' },
      );
    }
    setTimeout(() => onFim?.(), pulouAgora ? 420 : dur);
  }, [onSaindo, onFim]);

  // tamanho de cada traço, para a caneta andar no mesmo ritmo em todas as letras
  const medidas = useRef(null);
  useLayoutEffect(() => {
    const tam = letras.current.map((p) => p?.getTotalLength() ?? 1);
    const inicio = [];
    tam.reduce((s, l, i) => ((inicio[i] = s), s + l), 0);
    medidas.current = { tam, inicio, total: tam.reduce((s, l) => s + l, 0), y: y.current?.getTotalLength() ?? 1 };
    // tudo começa escondido
    letras.current.forEach((p, i) => p && (p.style.strokeDasharray = `${tam[i]} ${tam[i]}`, p.style.strokeDashoffset = `${tam[i]}`));
    if (y.current) (y.current.style.strokeDasharray = `${medidas.current.y} ${medidas.current.y}`, y.current.style.strokeDashoffset = `${medidas.current.y}`);
  }, []);

  useEffect(() => {
    let quadro = 0;
    const t0 = performance.now();
    const passo = (agora) => {
      const t = (agora - t0) / 1000;
      const m = medidas.current;
      if (m) {
        // o y se desenha (caneta saindo), e a cabeça aparece com uma mola
        const py = saida(jan(t, T.y));
        y.current.style.strokeDashoffset = `${m.y * (1 - py)}`;
        y.current.style.opacity = py > 0 ? 1 : 0;
        const pc = mola(jan(t, T.cabeca));
        cabeca.current.setAttribute('transform', `translate(${PESSOA.cabeca.cx} ${PESSOA.cabeca.cy}) scale(${pc}) translate(${-PESSOA.cabeca.cx} ${-PESSOA.cabeca.cy})`);
        // a caneta escreve "help" de uma vez só, no mesmo ritmo do começo ao fim
        const pe = suave(jan(t, T.escreve));
        const andou = pe * m.total;
        letras.current.forEach((p, i) => {
          const f = cl((andou - m.inicio[i]) / m.tam[i]);
          p.style.strokeDashoffset = `${m.tam[i] * (1 - f)}`;
          p.style.opacity = f > 0 ? 1 : 0;
        });
        // o y desliza junto com a escrita; "aqui!" e o pulinho são um gesto cada
        const x = -DESLOCA * (1 - pe);
        const sobe = -9 * sino(suave(jan(t, T.aqui))) - 12 * sino(jan(t, T.alegria));
        const achata = 0.05 * sino(jan(t, T.alegria));
        pessoa.current.setAttribute('transform', `translate(${x} ${sobe}) translate(466 0) scale(${1 + achata * 0.4} ${1 - achata}) translate(-466 0)`);
      }
      if (t < T.voa) quadro = requestAnimationFrame(passo);
      else sair(false);
    };
    quadro = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(quadro);
  }, [sair]);

  return (
    <div className="abertura abertura-assina" data-fase={fase} data-pulou={pulou || undefined} aria-hidden="true">
      <div className="abertura-fundo" />
      <div className="abertura-logo" ref={logo} style={{ transformOrigin: '0 0' }}>
        <svg className="abertura-svg" viewBox="-6 -160 534 236">
          <g ref={traco} fill="none" stroke="#1E4FE6" strokeWidth={TRACO} strokeLinecap="round" strokeLinejoin="round">
            {LETRAS_HELPY.map((d, i) => (
              <path key={d} d={d} ref={(el) => (letras.current[i] = el)} style={{ opacity: 0 }} />
            ))}
            <g ref={pessoa}>
              <path d={PESSOA.corpo} ref={y} strokeWidth={TRACO_PESSOA} style={{ opacity: 0 }} />
              <circle ref={cabeca} {...PESSOA.cabeca} fill="#1E4FE6" stroke="none" transform="scale(0)" />
            </g>
          </g>
        </svg>
      </div>
      <button type="button" className="abertura-pular" onClick={() => sair(true)} aria-hidden="false">Pular</button>
    </div>
  );
}
