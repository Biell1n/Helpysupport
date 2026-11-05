import { useCallback, useEffect, useRef, useState } from 'react';
import { LETRAS_HELPY, PESSOA, TRACO, TRACO_PESSOA } from '@/components/MarcaHelpy';

const CHAVE = 'helpy-abertura';

// A história, com um elemento só que vai mudando de forma:
// uma gota cai, amassa no chão, estica para cima e o topo se abre em dois braços
// (como uma flor); a cabeça brota entre eles, a pessoinha dá um tchauzinho e o
// "help" sobe do chão ao lado dela. Tudo com molas, nada surge pronto.

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

// ---- tempo (ms) ----
const T = {
  cai: [0, 400],
  amassa: [400, 540],
  sobe: [540, 900],
  abre: [820, 1220],
  cabeca: [980, 1460],
  tchau: [1420, 2050],
  letras: { inicio: 1250, duracao: 720, intervalo: 75 },
  sai: 2550,
  saida: 500,
};

// ---- forma final do y (a mesma da marca) ----
const PE = { x: 466, y: -2 };
const PEITO = { x: 466, y: -52 };
const PONTA_Y = -100;
const BRACO = Math.hypot(42, 48); // do peito até a ponta da mão
const ANGULO = Math.atan2(42, 48); // abertura de cada braço, a partir da vertical
const CAB = PESSOA.cabeca;

// ---- curvas ----
const cl = (x) => Math.max(0, Math.min(1, x));
const fase = (t, [a, b]) => cl((t - a) / (b - a));
const mix = (a, b, k) => a + (b - a) * k;
const entra = (x) => x * x; // cai acelerando
const assenta = (x) => 1 - Math.pow(1 - x, 3);
/** mola: chega no 1 passando um pouco e voltando. z = amortecimento (menor = mais balanço). */
const mola = (x, z = 0.5) => {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const w = 6.5 / z;
  const wd = w * Math.sqrt(1 - z * z);
  return 1 - Math.exp(-6.5 * x) * (Math.cos(wd * x) + (6.5 / wd) * Math.sin(wd * x));
};
/** A mesma mola, como curva do navegador para as letras. */
const molaCss = (() => {
  const pts = Array.from({ length: 41 }, (_, i) => mola(i / 40, 0.62).toFixed(4));
  return typeof CSS !== 'undefined' && CSS.supports?.('animation-timing-function', 'linear(0, 1)')
    ? `linear(${pts.join(', ')})`
    : 'cubic-bezier(0.34, 1.4, 0.64, 1)';
})();

const seg = (a, b) => `M${a.x.toFixed(2)} ${a.y.toFixed(2)}L${b.x.toFixed(2)} ${b.y.toFixed(2)}`;
const ponta = (ang, len) => ({ x: PEITO.x + Math.sin(ang) * len, y: PEITO.y - Math.cos(ang) * len });

/** A forma do y no instante t (ms): corpo, braço esquerdo, braço direito e a cabeça. */
function quadro(t) {
  let corpo;
  if (t < T.cai[1]) {
    // a gota cai esticada pela velocidade
    const k = entra(fase(t, T.cai));
    const base = mix(-320, PE.y, k);
    corpo = [{ x: PE.x, y: base - 6 - 26 * k }, { x: PE.x, y: base }];
  } else if (t < T.amassa[1]) {
    // bate no chão e amassa para os lados
    const k = Math.sin(Math.PI * fase(t, T.amassa));
    corpo = [{ x: PE.x - 17 * k, y: PE.y }, { x: PE.x + 17 * k, y: PE.y }];
  } else {
    // estica para cima, passa um pouco e volta; depois o topo recolhe até o peito enquanto os braços abrem
    const topo = mix(PE.y, PONTA_Y, mola(fase(t, T.sobe), 0.45));
    corpo = [{ x: PE.x, y: mix(topo, PEITO.y, assenta(fase(t, T.abre))) }, PE];
  }

  // os braços nascem colados no corpo e abrem como uma flor
  const ka = fase(t, T.abre);
  let esq = null;
  let dir = null;
  if (ka > 0) {
    const abre = mola(ka, 0.42);
    const len = mix(PEITO.y - PONTA_Y, BRACO, assenta(ka));
    // tchauzinho: a mão direita balança duas vezes e para
    const kt = fase(t, T.tchau);
    const aceno = kt > 0 && kt < 1 ? 0.2 * Math.sin(kt * Math.PI * 4) * (1 - kt) : 0;
    esq = seg(PEITO, ponta(-ANGULO * abre, len));
    dir = seg(PEITO, ponta(ANGULO * abre + aceno, len));
  }

  // a cabeça brota entre os braços, sobe com uma mola e estica/amassa no caminho
  const kc = fase(t, T.cabeca);
  const sobe = mola(kc, 0.5);
  const forma = 0.22 * Math.sin(kc * Math.PI * 2) * (1 - kc);
  const r = CAB.r * assenta(cl(kc * 2.2));
  const cabeca = { cx: CAB.cx, cy: mix(PEITO.y - 18, CAB.cy, sobe), rx: r * (1 - forma), ry: r * (1 + forma) };

  return { corpo: seg(...corpo), esq, dir, cabeca };
}

export default function IntroLogo({ onSaindo, onFim }) {
  const raiz = useRef(null);
  const logo = useRef(null);
  const corpo = useRef(null);
  const esq = useRef(null);
  const dir = useRef(null);
  const cabeca = useRef(null);
  const letras = useRef([]);
  const [estado, setEstado] = useState('entra');
  const saiu = useRef(false);

  const sair = useCallback((pulou) => {
    if (saiu.current) return;
    saiu.current = true;
    try {
      sessionStorage.setItem(CHAVE, '1');
    } catch {
      /* sem armazenamento: só aparece de novo na próxima visita */
    }
    setEstado('sai');
    onSaindo?.();
    const dur = pulou ? 280 : T.saida;
    const curva = 'cubic-bezier(0.65, 0, 0.35, 1)';
    logo.current?.animate([{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(0.97)' }], { duration: dur, easing: curva, fill: 'forwards' });
    raiz.current?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: dur, delay: pulou ? 0 : 120, easing: 'ease', fill: 'forwards' });
    setTimeout(() => onFim?.(), dur + (pulou ? 0 : 120));
  }, [onSaindo, onFim]);

  useEffect(() => {
    // as letras sobem do chão, da mais perto da pessoinha (p) para a mais longe (h)
    const anims = letras.current.map((el, i, todas) => el?.animate(
      [{ transform: 'translateY(250px)' }, { transform: 'translateY(0)' }],
      { delay: T.letras.inicio + (todas.length - 1 - i) * T.letras.intervalo, duration: T.letras.duracao, easing: molaCss, fill: 'both' },
    ));

    let id = 0;
    const t0 = performance.now();
    const passo = (agora) => {
      const t = agora - t0;
      const q = quadro(t);
      corpo.current.setAttribute('d', q.corpo);
      for (const [ref, d] of [[esq, q.esq], [dir, q.dir]]) {
        if (d) ref.current.setAttribute('d', d);
        ref.current.style.visibility = d ? 'visible' : 'hidden';
      }
      const c = cabeca.current;
      c.setAttribute('cy', q.cabeca.cy.toFixed(2));
      c.setAttribute('rx', Math.max(0, q.cabeca.rx).toFixed(2));
      c.setAttribute('ry', Math.max(0, q.cabeca.ry).toFixed(2));
      if (t < T.sai) id = requestAnimationFrame(passo);
      else sair(false);
    };
    id = requestAnimationFrame(passo);
    return () => {
      cancelAnimationFrame(id);
      anims.forEach((a) => a?.cancel());
    };
  }, [sair]);

  const inicio = quadro(0);
  return (
    <div className="abertura abertura-assina" ref={raiz} data-fase={estado} aria-hidden="true">
      <div className="abertura-fundo" />
      <div className="abertura-logo" ref={logo}>
        <svg className="abertura-svg" viewBox="-6 -160 534 236">
          <defs>
            {/* o "chão" de onde as letras sobem: abaixo dele nada aparece */}
            <clipPath id="abertura-chao">
              <rect x="-20" y="-400" width="420" height="476" />
            </clipPath>
          </defs>
          <g fill="none" stroke="#1E4FE6" strokeLinecap="round" strokeLinejoin="round">
            <g strokeWidth={TRACO} clipPath="url(#abertura-chao)">
              {LETRAS_HELPY.map((d, i) => (
                <path key={d} d={d} ref={(el) => (letras.current[i] = el)} style={{ transform: 'translateY(250px)' }} />
              ))}
            </g>
            <g strokeWidth={TRACO_PESSOA}>
              <path ref={esq} style={{ visibility: 'hidden' }} />
              <path ref={dir} style={{ visibility: 'hidden' }} />
              <path ref={corpo} d={inicio.corpo} />
            </g>
          </g>
          <ellipse ref={cabeca} cx={CAB.cx} cy={inicio.cabeca.cy} rx="0" ry="0" fill="#1E4FE6" />
        </svg>
      </div>
      <button type="button" className="abertura-pular" onClick={() => sair(true)} aria-hidden="false">Pular</button>
    </div>
  );
}
