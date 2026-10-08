import { useCallback, useEffect, useRef, useState } from 'react';

const CHAVE = 'helpy-abertura';

// linha do tempo da abertura, em ms
const T = {
  pontos: 0, // os três pontinhos de "digitando" aparecem
  pula: 260, // e pulam, como no chat
  junta: 1180, // se juntam e viram líquido
  balao: 1250, // o líquido vira o balão
  rabo: 1560, // o rabinho escorre
  nitido: 1820, // o líquido dá lugar ao desenho final
  canhoto: 1900, // o canhoto azul é picotado
  linhas: 2120, // as duas linhas de texto
  digita: 2330, // "helpy" é digitado
  letra: 95, // intervalo entre letras
  acorde: 2900,
  voa: 3350, // a logo voa até o topo do site
  fim: 4150,
};

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
 * Os sons da abertura, sintetizados na hora (nenhum arquivo para baixar).
 * O navegador só libera som depois do primeiro toque na página: se ainda
 * não liberou, os sons que faltam tocam a partir do primeiro clique ou tecla.
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
  mestre.gain.value = 0.85;
  mestre.connect(ctx.destination);

  const ruido = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = ruido.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

  const tom = (t, freq, { dur = 0.08, vol = 0.1, tipo = 'sine', ate, filtro } = {}) => {
    const o = ctx.createOscillator();
    o.type = tipo;
    o.frequency.setValueAtTime(freq, t);
    if (ate) o.frequency.exponentialRampToValueAtTime(ate, t + dur * 0.8);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let no = o.connect(g);
    if (filtro) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = filtro;
      no = no.connect(f);
    }
    no.connect(mestre);
    o.start(t);
    o.stop(t + dur + 0.05);
  };

  const chiado = (t, { dur = 0.03, vol = 0.06, freq = 3000, tipo = 'bandpass', ate } = {}) => {
    const src = ctx.createBufferSource();
    src.buffer = ruido;
    const f = ctx.createBiquadFilter();
    f.type = tipo;
    f.Q.value = 1.2;
    f.frequency.setValueAtTime(freq, t);
    if (ate) f.frequency.exponentialRampToValueAtTime(ate, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.01, dur / 3));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(mestre);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  };

  const s = (ms) => ms / 1000;
  const sons = [
    // pontinhos surgindo e pulando
    ...[0, 1, 2].map((i) => [T.pontos + i * 80, (t) => tom(t, 620 + i * 90, { dur: 0.09, vol: 0.06, ate: 900 + i * 90 })]),
    ...[0, 1, 2, 3, 4, 5].map((i) => [T.pula + i * 150, (t) => tom(t, 1150 + (i % 3) * 120, { dur: 0.05, vol: 0.022 })]),
    // o líquido se juntando: um "blup" grave subindo
    [T.junta, (t) => tom(t, 170, { dur: 0.32, vol: 0.16, ate: 520, filtro: 1400 })],
    [T.rabo, (t) => tom(t, 380, { dur: 0.16, vol: 0.08, ate: 760, filtro: 2000 })],
    // picote do canhoto
    [T.canhoto, (t) => { chiado(t, { dur: 0.05, vol: 0.09, freq: 3200 }); tom(t, 1600, { dur: 0.06, vol: 0.07, ate: 800 }); }],
    [T.linhas, (t) => chiado(t, { dur: 0.025, vol: 0.04, freq: 4200 })],
    [T.linhas + 110, (t) => chiado(t, { dur: 0.025, vol: 0.04, freq: 4600 })],
    // teclas
    ...[0, 1, 2, 3, 4].map((i) => [T.digita + i * T.letra, (t) => {
      chiado(t, { dur: 0.03, vol: 0.07, freq: 2400 + Math.random() * 1400, tipo: 'highpass' });
      tom(t, 180 + Math.random() * 40, { dur: 0.04, vol: 0.05, filtro: 600 });
    }]),
    // acorde final e o sopro do voo até o topo
    [T.acorde, (t) => {
      tom(t, 659.25, { dur: 1.3, vol: 0.07, tipo: 'triangle' });
      tom(t + 0.06, 987.77, { dur: 1.2, vol: 0.055, tipo: 'triangle' });
      tom(t + 0.06, 1318.5, { dur: 0.8, vol: 0.018 });
    }],
    [T.voa, (t) => chiado(t, { dur: 0.6, vol: 0.05, freq: 2600, ate: 300 })],
  ];

  return {
    ctx,
    liberado: () => ctx.state === 'running',
    /** Agenda os sons que ainda não passaram, contando que a abertura começou há "decorrido" ms. */
    tocarDesde(decorrido) {
      const agora = ctx.currentTime + 0.02;
      for (const [ms, fn] of sons) if (ms >= decorrido) fn(agora + s(ms - decorrido));
    },
    fechar: () => ctx.close().catch(() => {}),
  };
}

const anima = (el, quadros, opcoes) => el?.animate(quadros, { fill: 'forwards', ...opcoes });
const MOLA = 'cubic-bezier(0.34, 1.56, 0.64, 1)';
const SUAVE = 'cubic-bezier(0.16, 1, 0.3, 1)';

/**
 * A abertura: "digitando…" vira a logo. Os três pontinhos do chat pulam,
 * se fundem como líquido e modelam o balão; o canhoto é picotado, "helpy"
 * é digitado e a logo voa até o lugar dela no topo do site.
 */
export default function IntroLogo({ onSaindo, onFim }) {
  const [fase, setFase] = useState('monta');
  const raiz = useRef(null);
  const q = (sel) => raiz.current?.querySelector(sel);
  const qs = (sel) => [...(raiz.current?.querySelectorAll(sel) ?? [])];
  const som = useRef(null);
  const inicio = useRef(0);
  const timers = useRef([]);
  const acabou = useRef(false);

  const depois = (ms, fn) => timers.current.push(setTimeout(fn, ms));

  const encerrar = useCallback((pulou = false) => {
    if (acabou.current) return;
    acabou.current = true;
    timers.current.forEach(clearTimeout);
    try {
      sessionStorage.setItem(CHAVE, '1');
    } catch {
      /* sem armazenamento: mostra de novo na próxima, sem problema */
    }
    onSaindo?.();
    if (pulou) raiz.current?.setAttribute('data-pulou', '');
    setFase('sai');
    document.documentElement.style.overflow = '';
    const s = som.current;
    if (pulou) s?.fechar();
    else setTimeout(() => s?.fechar(), 1600); // deixa o acorde terminar
    setTimeout(() => onFim?.(), pulou ? 450 : T.fim - T.voa);
  }, [onSaindo, onFim]);

  // a logo encolhe e voa até a logo do topo; o fundo esmaece junto
  const voar = useCallback(() => {
    const logo = q('.abertura-logo');
    const alvo = document.querySelector('.lp-top-marca');
    const fundo = q('.abertura-fundo');
    const dur = T.fim - T.voa;
    anima(fundo, [{ opacity: 1 }, { opacity: 0 }], { duration: dur * 0.8, easing: 'ease-in-out' });
    anima(q('.abertura-luz'), [{ opacity: 1 }, { opacity: 0 }], { duration: dur * 0.5 });
    if (logo && alvo) {
      const a = logo.getBoundingClientRect();
      const b = alvo.getBoundingClientRect();
      const esc = b.height / a.height;
      const dx = b.left + b.width / 2 - (a.left + a.width / 2);
      const dy = b.top + b.height / 2 - (a.top + a.height / 2);
      anima(logo, [{ transform: 'none' }, { transform: `translate(${dx}px, ${dy}px) scale(${esc})` }], { duration: dur, easing: 'cubic-bezier(0.65, 0, 0.2, 1)' });
    }
    raiz.current?.setAttribute('data-cor', 'escura');
    encerrar(false);
  }, [encerrar]);

  useEffect(() => {
    const r = raiz.current;
    if (!r) return;
    inicio.current = performance.now();

    // som: toca se o navegador já deixa; senão, o que faltar toca no primeiro toque
    const s = criarSom();
    som.current = s;
    if (s) {
      s.ctx.resume().catch(() => {});
      setTimeout(() => s.liberado() && s.tocarDesde(0), 30);
    }
    const liberar = () => {
      const x = som.current;
      if (!x || x.liberado() || acabou.current) return;
      x.ctx.resume().then(() => x.tocarDesde(performance.now() - inicio.current)).catch(() => {});
    };
    const tecla = (e) => {
      if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') encerrar(true);
      else liberar();
    };
    window.addEventListener('pointerdown', liberar, { once: true });
    window.addEventListener('keydown', tecla);
    const html = document.documentElement;
    html.style.overflow = 'hidden';

    // a palavra começa fora da conta: a marca fica no centro e anda conforme as letras entram
    const palavra = q('.abertura-palavra');
    const gap = parseFloat(getComputedStyle(q('.abertura-logo')).columnGap) || 0;
    const desloc = ((palavra?.offsetWidth ?? 0) + gap) / 2;
    const trilho = q('.abertura-trilho');
    trilho.style.transform = `translateX(${desloc}px)`;

    // 1. pontinhos surgem e pulam
    qs('.ab-ponto').forEach((p, i) => {
      anima(p, [{ transform: 'scale(0)' }, { transform: 'scale(1)' }], { duration: 380, delay: T.pontos + i * 80, easing: MOLA });
      anima(p, [
        { translate: '0 0' }, { translate: '0 -5px', offset: 0.35 }, { translate: '0 0', offset: 0.7 }, { translate: '0 0' },
      ], { duration: 450, delay: T.pula + i * 150, iterations: 2, easing: 'ease-in-out', fill: 'none' });
      // 2. se juntam no meio
      const dx = (1 - i) * 10;
      anima(p, [{ translate: '0 0' }, { translate: `${dx}px 0` }], { duration: 260, delay: T.junta, easing: 'cubic-bezier(0.5, 0, 0.75, 0)' });
    });
    // 3. o líquido estica e vira o balão (com um quique de massinha)
    anima(q('.ab-massa'), [
      { transform: 'scale(0.06, 0.12)' },
      { transform: 'scale(1.12, 0.82)', offset: 0.45 },
      { transform: 'scale(0.95, 1.06)', offset: 0.72 },
      { transform: 'scale(1, 1)' },
    ], { duration: 620, delay: T.balao, easing: 'ease-out' });
    anima(q('.ab-gota'), [
      { transform: 'scale(0)' }, { transform: 'scale(1.15, 1.25)', offset: 0.6 }, { transform: 'scale(1)' },
    ], { duration: 360, delay: T.rabo, easing: MOLA });
    // 4. troca o líquido pelo desenho nítido
    anima(q('.ab-liquido'), [{ opacity: 1 }, { opacity: 0 }], { duration: 220, delay: T.nitido });
    anima(q('.ab-nitido'), [{ opacity: 0 }, { opacity: 1 }], { duration: 220, delay: T.nitido });
    // 5. canhoto picotado: o azul desce, o picote corre
    anima(q('.ab-canhoto'), [{ transform: 'scaleY(0)' }, { transform: 'scaleY(1)' }], { duration: 300, delay: T.canhoto, easing: SUAVE });
    anima(q('.ab-picote'), [{ strokeDashoffset: 40 }, { strokeDashoffset: 0 }], { duration: 300, delay: T.canhoto, easing: 'linear' });
    qs('.ab-linha').forEach((l, i) => {
      anima(l, [{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: 200, delay: T.linhas + i * 110, easing: SUAVE });
    });
    // 6. "helpy" digitado, com cursor
    const letras = qs('.abertura-palavra span');
    const cursor = q('.abertura-cursor');
    anima(cursor, [{ opacity: 0 }, { opacity: 1 }], { duration: 1, delay: T.digita - 120 });
    letras.forEach((l, i) => {
      anima(l, [{ opacity: 0, transform: 'translateY(0.18em)' }, { opacity: 1, transform: 'none' }], { duration: 160, delay: T.digita + i * T.letra, easing: SUAVE });
      depois(T.digita + i * T.letra, () => {
        if (cursor) cursor.style.left = `${l.offsetLeft + l.offsetWidth}px`;
      });
    });
    anima(trilho, [{ transform: `translateX(${desloc}px)` }, { transform: 'translateX(0)' }], {
      duration: letras.length * T.letra + 380, delay: T.digita - 60, easing: SUAVE,
    });
    depois(T.digita - 120, () => cursor?.setAttribute('data-pisca', 'nao'));
    depois(T.digita + letras.length * T.letra + 60, () => cursor?.setAttribute('data-pisca', 'sim'));
    anima(q('.abertura-luz'), [{ opacity: 0, transform: 'scale(0.6)' }, { opacity: 1, transform: 'scale(1)' }], { duration: 1600, delay: T.balao, easing: SUAVE });
    // 7. voa até o topo
    depois(T.voa - 120, () => cursor && anima(cursor, [{ opacity: 1 }, { opacity: 0 }], { duration: 120 }));
    depois(T.voa, voar);

    return () => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
      window.removeEventListener('pointerdown', liberar);
      window.removeEventListener('keydown', tecla);
      html.style.overflow = '';
      if (!acabou.current) s?.fechar(); // desmontou antes do fim (modo estrito em desenvolvimento)
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="abertura" data-fase={fase} ref={raiz} role="presentation" aria-hidden="true">
      <div className="abertura-fundo" />
      <div className="abertura-luz" />
      <div className="abertura-logo">
        <div className="abertura-trilho">
          <svg className="abertura-marca" viewBox="0 0 64 64">
            <defs>
              {/* o efeito "massinha": borra e corta, e as formas próximas se grudam */}
              <filter id="ab-goo" x="-30%" y="-30%" width="160%" height="160%">
                <feGaussianBlur in="SourceGraphic" stdDeviation="2.4" />
                <feColorMatrix values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -10" />
              </filter>
              <mask id="ab-furos">
                <rect width="64" height="64" fill="#fff" />
                <circle cx="5" cy="27" r="5" fill="#000" />
                <circle cx="59" cy="27" r="5" fill="#000" />
              </mask>
              <clipPath id="ab-lado">
                <rect x="44" y="0" width="20" height="64" />
              </clipPath>
            </defs>

            <g className="ab-liquido" filter="url(#ab-goo)">
              <rect className="ab-massa" x="5" y="9" width="54" height="36" rx="12" />
              <path className="ab-gota" d="M14 41 L11 57 L27 41 Z" />
              <circle className="ab-ponto" cx="22" cy="27" r="4.6" />
              <circle className="ab-ponto" cx="32" cy="27" r="4.6" />
              <circle className="ab-ponto" cx="42" cy="27" r="4.6" />
            </g>

            <g className="ab-nitido">
              <g mask="url(#ab-furos)">
                <rect className="ab-corpo" x="5" y="9" width="54" height="36" rx="9" />
                <path className="ab-corpo" d="M14 43 L11 57 L27 43 Z" />
                <g clipPath="url(#ab-lado)">
                  <rect className="ab-canhoto" x="5" y="9" width="54" height="36" rx="9" fill="#1F66F4" />
                </g>
              </g>
              <path className="ab-picote" d="M44 13.5v27" strokeWidth="2.4" strokeDasharray="2.6 3.2" />
              <path className="ab-linha" d="M15.5 21.5h18" pathLength="1" strokeWidth="4.2" strokeLinecap="round" />
              <path className="ab-linha" d="M15.5 31h11" pathLength="1" strokeWidth="4.2" strokeLinecap="round" />
            </g>
          </svg>
          <span className="abertura-palavra">
            {'helpy'.split('').map((l, i) => <span key={i}>{l}</span>)}
            <i className="abertura-cursor" data-pisca="sim" />
          </span>
        </div>
      </div>
      <button type="button" className="abertura-pular" tabIndex={-1} onClick={() => encerrar(true)}>
        Pular
      </button>
    </div>
  );
}
