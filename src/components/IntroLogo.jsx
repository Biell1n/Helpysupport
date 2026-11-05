import { useCallback, useEffect, useRef, useState } from 'react';
import { LETRAS_HELPY, PESSOA, TRACO, TRACO_PESSOA } from '@/components/MarcaHelpy';

const CHAVE = 'helpy-abertura';

// Uma ideia só, em menos de dois segundos e meio: a pessoinha se levanta, abre
// os braços ("aqui!"), a cabeça pousa e o nome se escreve ao lado. Tudo parado no centro:
// nada desliza nem voa, só traço sendo desenhado e uma saída em esmaecer.
// Cada movimento é uma animação do navegador (WAAPI), sem cálculo quadro a quadro.
const CURVA = 'cubic-bezier(0.65, 0, 0.35, 1)'; // acelera e assenta
const CAI = 'cubic-bezier(0.34, 1.4, 0.64, 1)'; // um tiquinho de sobra no pouso

const TEMPO = {
  corpo: { delay: 60, duration: 340 }, // a pessoa se levanta
  bracos: { delay: 330, duration: 380 }, // e abre os braços: "aqui!"
  cabeca: { delay: 520, duration: 480 }, // a cabeça pousa
  letras: { delay: 780, duration: 620, intervalo: 90 },
  segura: 2150, // quando começa a sair
  sai: 520,
};

// o y desenhado como gesto: do pé até o peito, depois os dois braços para cima ao mesmo tempo
const [PE, PEITO] = [[466, -2], [466, -52]];
const Y_CORPO = `M${PE} L${PEITO}`;
const Y_BRACOS = [`M${PEITO} L424 -100`, `M${PEITO} L508 -100`];

/** Liga a abertura para todos. Enquanto estiver desligada, dá para ver com ?abertura no endereço. */
const ABERTURA_LIGADA = false;

export function deveMostrarAbertura() {
  if (typeof window === 'undefined') return false;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return false;
  const busca = window.location.search;
  if (/[?&]abertura\b/.test(busca)) return true;
  if (!ABERTURA_LIGADA || /[?&]sem-abertura\b/.test(busca)) return false;
  try {
    return sessionStorage.getItem(CHAVE) !== '1';
  } catch {
    return true;
  }
}

// traço escondido: o pedaço visível começa "antes" do caminho, então nem a ponta redonda aparece
const ESCONDIDO = 1.02;

export default function IntroLogo({ onSaindo, onFim }) {
  const raiz = useRef(null);
  const logo = useRef(null);
  const letras = useRef([]);
  const corpo = useRef(null);
  const bracos = useRef([]);
  const cabeca = useRef(null);
  const [fase, setFase] = useState('entra');
  const saiu = useRef(false);

  const sair = useCallback((pulou) => {
    if (saiu.current) return;
    saiu.current = true;
    try {
      sessionStorage.setItem(CHAVE, '1');
    } catch {
      /* sem armazenamento: só aparece de novo na próxima visita */
    }
    setFase('sai');
    onSaindo?.();
    const dur = pulou ? 280 : TEMPO.sai;
    logo.current?.animate(
      [{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(0.97)' }],
      { duration: dur, easing: CURVA, fill: 'forwards' },
    );
    raiz.current?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: dur, delay: pulou ? 0 : 120, easing: 'ease', fill: 'forwards' });
    setTimeout(() => onFim?.(), dur + (pulou ? 0 : 120));
  }, [onSaindo, onFim]);

  useEffect(() => {
    const anims = [];
    // a ponta redonda só aparece quando a caneta encosta
    const desenha = (el, { delay, duration, easing = CURVA }) => {
      if (!el) return;
      anims.push(el.animate(
        [
          { strokeDashoffset: ESCONDIDO, opacity: 0 },
          { strokeDashoffset: ESCONDIDO * 0.995, opacity: 1, offset: 0.01 },
          { strokeDashoffset: 0, opacity: 1 },
        ],
        { delay, duration, easing, fill: 'both' },
      ));
    };
    // a cabeça cai de leve e pousa entre os braços
    anims.push(cabeca.current.animate(
      [{ opacity: 0, transform: 'translateY(-34px)' }, { opacity: 1, transform: 'translateY(0)' }],
      { ...TEMPO.cabeca, easing: CAI, fill: 'both' },
    ));
    // a pessoa se levanta e abre os braços
    desenha(corpo.current, { ...TEMPO.corpo, easing: 'cubic-bezier(0.5, 0, 0.2, 1)' });
    bracos.current.forEach((el) => desenha(el, { ...TEMPO.bracos, easing: 'cubic-bezier(0.2, 0.7, 0.2, 1)' }));
    // o nome se escreve, letra por letra; dentro da letra, um traço depois do outro, na mesma velocidade
    letras.current.forEach((tracos, i) => {
      const tam = tracos.map((el) => el?.getTotalLength() ?? 1);
      const total = tam.reduce((a, b) => a + b, 0);
      let inicio = TEMPO.letras.delay + i * TEMPO.letras.intervalo;
      tracos.forEach((el, j) => {
        const duration = (TEMPO.letras.duration * tam[j]) / total;
        const ultimo = j === tracos.length - 1;
        desenha(el, { delay: inicio, duration, easing: tracos.length === 1 ? CURVA : j === 0 ? 'cubic-bezier(0.65, 0, 1, 1)' : ultimo ? 'cubic-bezier(0, 0, 0.35, 1)' : 'linear' });
        inicio += duration;
      });
    });
    const t = setTimeout(() => sair(false), TEMPO.segura);
    return () => {
      clearTimeout(t);
      anims.forEach((a) => a.cancel());
    };
  }, [sair]);

  const traco = { pathLength: 1, strokeDasharray: '1 2', strokeDashoffset: ESCONDIDO, style: { opacity: 0 } };

  return (
    <div className="abertura abertura-assina" ref={raiz} data-fase={fase} aria-hidden="true">
      <div className="abertura-fundo" />
      <div className="abertura-logo" ref={logo}>
        <svg className="abertura-svg" viewBox="-6 -160 534 236">
          <g fill="none" stroke="#1E4FE6" strokeLinecap="round" strokeLinejoin="round">
            {LETRAS_HELPY.map((d, i) => (
              <g key={d}>
                {/* cada subtraço é um caminho: a caneta faz um, levanta e faz o outro */}
                {d.split(/(?=M)/).map((parte, j) => (
                  <path key={parte} d={parte} strokeWidth={TRACO} ref={(el) => ((letras.current[i] ??= [])[j] = el)} {...traco} />
                ))}
              </g>
            ))}
            <path d={Y_CORPO} strokeWidth={TRACO_PESSOA} ref={corpo} {...traco} />
            {Y_BRACOS.map((d, i) => <path key={d} d={d} strokeWidth={TRACO_PESSOA} ref={(el) => (bracos.current[i] = el)} {...traco} />)}
          </g>
          <circle ref={cabeca} {...PESSOA.cabeca} fill="#1E4FE6" style={{ opacity: 0, transformBox: 'fill-box', transformOrigin: 'center' }} />
        </svg>
      </div>
      <button type="button" className="abertura-pular" onClick={() => sair(true)} aria-hidden="false">Pular</button>
    </div>
  );
}
