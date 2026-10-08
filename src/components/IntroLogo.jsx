import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

const CHAVE = 'helpy-abertura';
const DURACAO = 3150; // ms até sumir de vez
const SAIDA = 2550; // ms em que começa a esmaecer

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

/**
 * O som da abertura, sintetizado na hora (nenhum arquivo para baixar):
 * um sopro enquanto o balão é desenhado, um estalo quando o canhoto
 * encaixa, dois toques nas linhas e um acorde curto no fim.
 * O navegador só libera som depois do primeiro toque na página: se ainda
 * não liberou, o acorde final toca assim que a pessoa clicar ou teclar.
 */
function criarSom() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  let ctx;
  try {
    ctx = new AC();
  } catch {
    return null;
  }
  const mestre = ctx.createGain();
  mestre.gain.value = 0.9;
  mestre.connect(ctx.destination);

  const ruido = (() => {
    const b = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  })();

  const sopro = (t, dur) => {
    const src = ctx.createBufferSource();
    src.buffer = ruido;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 1.4;
    f.frequency.setValueAtTime(380, t);
    f.frequency.exponentialRampToValueAtTime(2600, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.05, t + dur * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(mestre);
    src.start(t);
    src.stop(t + dur + 0.05);
  };

  const tom = (t, freq, { dur = 0.08, vol = 0.1, tipo = 'sine', ate } = {}) => {
    const o = ctx.createOscillator();
    o.type = tipo;
    o.frequency.setValueAtTime(freq, t);
    if (ate) o.frequency.exponentialRampToValueAtTime(ate, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(mestre);
    o.start(t);
    o.stop(t + dur + 0.05);
  };

  const acorde = (t) => {
    // mi e si, com a oitava bem baixinha: claro e curto
    tom(t, 659.25, { dur: 1.4, vol: 0.075, tipo: 'triangle' });
    tom(t + 0.07, 987.77, { dur: 1.3, vol: 0.06, tipo: 'triangle' });
    tom(t + 0.07, 1318.5, { dur: 0.9, vol: 0.02 });
  };

  const tocar = () => {
    const t = ctx.currentTime + 0.03;
    sopro(t, 0.75);
    tom(t + 0.95, 1500, { dur: 0.07, vol: 0.12, ate: 720 }); // estalo do canhoto
    tom(t + 1.3, 2300, { dur: 0.035, vol: 0.035, tipo: 'triangle' });
    tom(t + 1.42, 2600, { dur: 0.035, vol: 0.035, tipo: 'triangle' });
    acorde(t + 2.0);
  };

  return {
    ctx,
    liberado: () => ctx.state === 'running',
    tocar,
    acordeAgora: () => acorde(ctx.currentTime + 0.02),
    fechar: () => ctx.close().catch(() => {}),
  };
}

/** A abertura: o balão se desenha, o canhoto encaixa, a palavra sobe, e tudo esmaece na página. */
export default function IntroLogo({ onSaindo, onFim }) {
  const [fase, setFase] = useState('monta');
  const palavra = useRef(null);
  const raiz = useRef(null);
  const som = useRef(null);
  const inicio = useRef(0);
  const acabou = useRef(false);

  const encerrar = useCallback(() => {
    if (acabou.current) return;
    acabou.current = true;
    try {
      sessionStorage.setItem(CHAVE, '1');
    } catch {
      /* sem armazenamento: mostra de novo na próxima, sem problema */
    }
    onSaindo?.();
    setFase('sai');
    setTimeout(() => onFim?.(), DURACAO - SAIDA);
    // deixa o acorde terminar de soar antes de desligar o áudio
    const s = som.current;
    setTimeout(() => s?.fechar(), 2200);
  }, [onSaindo, onFim]);

  // a marca começa no centro e anda para a esquerda quando a palavra aparece
  useLayoutEffect(() => {
    const w = palavra.current?.offsetWidth ?? 0;
    raiz.current?.style.setProperty('--palavra', `${w}px`);
  }, []);

  useEffect(() => {
    inicio.current = performance.now();
    const s = criarSom();
    som.current = s;
    if (s) {
      s.ctx.resume().catch(() => {});
      // o resume é assíncrono: espera um instante para saber se o navegador liberou
      setTimeout(() => {
        if (s.liberado()) s.tocar();
      }, 40);
    }

    // sem som liberado, o primeiro toque ainda pega o acorde final
    const liberar = () => {
      const x = som.current;
      if (!x || x.liberado()) return;
      x.ctx.resume().then(() => {
        if (performance.now() - inicio.current < SAIDA + 300) x.acordeAgora();
      }).catch(() => {});
    };
    const tecla = (e) => {
      if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') encerrar();
      else liberar();
    };
    window.addEventListener('pointerdown', liberar, { once: true });
    window.addEventListener('keydown', tecla);

    const html = document.documentElement;
    const antes = html.style.overflow;
    html.style.overflow = 'hidden';
    const t = setTimeout(encerrar, SAIDA);

    return () => {
      clearTimeout(t);
      if (!acabou.current) s?.fechar(); // desmontou antes do fim (ex.: modo estrito em desenvolvimento)
      window.removeEventListener('pointerdown', liberar);
      window.removeEventListener('keydown', tecla);
      html.style.overflow = antes;
    };
  }, [encerrar]);

  useEffect(() => {
    if (fase === 'sai') document.documentElement.style.overflow = '';
  }, [fase]);

  return (
    <div className="abertura" data-fase={fase} ref={raiz} role="presentation" aria-hidden="true">
      <div className="abertura-luz" />
      <div className="abertura-logo">
        <svg className="abertura-marca" viewBox="0 0 64 64">
          <defs>
            <mask id="abertura-furos">
              <rect width="64" height="64" fill="#fff" />
              <circle cx="5" cy="27" r="5" fill="#000" />
              <circle cx="59" cy="27" r="5" fill="#000" />
            </mask>
            <clipPath id="abertura-canhoto">
              <rect x="44" y="0" width="20" height="64" />
            </clipPath>
          </defs>
          {/* 1. o contorno se desenha */}
          <g className="ab-contorno" fill="none" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
            <rect x="5" y="9" width="54" height="36" rx="9" pathLength="1" />
            <path d="M14 45 L11 57 L27 45" pathLength="1" />
          </g>
          {/* 2. o corpo preenche, já com os furos da senha */}
          <g mask="url(#abertura-furos)">
            <g className="ab-corpo">
              <rect x="5" y="9" width="54" height="36" rx="9" fill="#fff" />
              <path d="M14 43 L11 57 L27 43 Z" fill="#fff" />
            </g>
            {/* 3. o canhoto azul encaixa pela direita */}
            <g clipPath="url(#abertura-canhoto)">
              <rect className="ab-canhoto" x="5" y="9" width="54" height="36" rx="9" fill="#1F66F4" />
            </g>
          </g>
          {/* 4. o picote e as duas linhas de texto */}
          <path className="ab-picote" d="M44 13.5v27" stroke="#0B1A2C" strokeWidth="2.4" strokeDasharray="2.6 3.2" />
          <path className="ab-linha ab-linha-1" d="M15.5 21.5h18" pathLength="1" stroke="#0B1A2C" strokeWidth="4.2" strokeLinecap="round" />
          <path className="ab-linha ab-linha-2" d="M15.5 31h11" pathLength="1" stroke="#0B1A2C" strokeWidth="4.2" strokeLinecap="round" />
        </svg>
        <span className="abertura-palavra" ref={palavra}>
          {'helpy'.split('').map((l, i) => (
            <span key={i} style={{ '--i': i }}>{l}</span>
          ))}
        </span>
      </div>
      <button type="button" className="abertura-pular" tabIndex={-1} onClick={encerrar}>
        Pular
      </button>
    </div>
  );
}
