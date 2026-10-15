import { useCallback, useEffect, useRef, useState } from 'react';
import { balao, balaoEm, CONJUNTO, CORES, LETRAS, NOME, OLHOS_CONTORNO } from '@/components/marcaDesenho';

const CHAVE = 'helpy-abertura';

// linha do tempo da abertura, em segundos
const T = {
  entra: 0.35, // o círculo nasce
  molda: 0.77, // o canto vira a pontinha do balão
  pontos: 0.62, // os três pontinhos de "digitando" aparecem
  onda: [0.8, 2.05], // e fazem a ondinha
  vira: [1.95, 2.45], // as pontas viram os olhinhos, o do meio some
  pisca: 2.72, // fecha os olhos e abre como olhinhos felizes, com uma mexidinha de cabeça
  nome: 2.7, // "helpy" entra letra por letra
  voa: 3.95, // o conjunto voa até o topo do site
  fim: 4.75,
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

/* ---------- curvas de movimento ---------- */
const cl = (x) => Math.max(0, Math.min(1, x));
const jan = (t, a, b) => cl((t - a) / (b - a));
const inOut = (x) => ((x = cl(x)), x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const outCubic = (x) => 1 - Math.pow(1 - cl(x), 3);
const outQuart = (x) => 1 - Math.pow(1 - cl(x), 4);
const outBack = (x, k = 1.7) => ((x = cl(x)), 1 + (k + 1) * Math.pow(x - 1, 3) + k * Math.pow(x - 1, 2));
const sino = (t, a, b) => Math.pow(Math.sin(Math.PI * jan(t, a, b)), 2);
const lerp = (a, b, x) => a + (b - a) * x;

/** Pontos-chave (tempo, valor, velocidade): a velocidade continua nas viradas, nada trava. */
function chaves(...p) {
  return (t) => {
    if (t <= p[0][0]) return p[0][1] + p[0][2] * (t - p[0][0]);
    const u = p[p.length - 1];
    if (t >= u[0]) return u[1] + u[2] * (t - u[0]);
    for (let i = 0; i < p.length - 1; i++) {
      const [t0, v0, d0] = p[i];
      const [t1, v1, d1] = p[i + 1];
      if (t <= t1) {
        const h = t1 - t0, s = (t - t0) / h, s2 = s * s, s3 = s2 * s;
        return (2 * s3 - 3 * s2 + 1) * v0 + (s3 - 2 * s2 + s) * h * d0 + (-2 * s3 + 3 * s2) * v1 + (s3 - s2) * h * d1;
      }
    }
    return u[1];
  };
}

const { escala: E, vao: VAO, linhaBase: BASE } = CONJUNTO;
const LARG = 200 + VAO + NOME.largura * E; // largura do conjunto final
const X0 = (LARG - 200) / 2; // começa com o balão no centro da tela
const deslize = chaves([2.55, 0, 0], [3.05, 0.62, 1.55], [3.75, 1, 0.05]);

function pilula(el, cx, cy, w, h) {
  w = Math.max(w, 0);
  h = Math.max(h, 0);
  el.setAttribute('x', cx - w / 2);
  el.setAttribute('y', cy - h / 2);
  el.setAttribute('width', w);
  el.setAttribute('height', h);
  el.setAttribute('rx', Math.min(w, h) / 2);
}

/** Mistura duas cores #RRGGBB. */
function mistura(a, b, x) {
  const c = (h, i) => parseInt(h.slice(1 + i * 2, 3 + i * 2), 16);
  return `rgb(${[0, 1, 2].map((i) => Math.round(lerp(c(a, i), c(b, i), x))).join(',')})`;
}

/** Os olhinhos felizes: um arco que nasce de um traço curto (p = 0) até o "∩" (p = 1). */
function arco(el, cx, yOlho, p) {
  const y = lerp(yOlho, yOlho + 8, p);
  const a = lerp(0.5, 15, p);
  el.setAttribute('d', `M${cx - a},${y} Q${cx},${y - 24 * p} ${cx + a},${y}`);
}

/** Desenha o quadro do instante t (em segundos). */
function desenhar(t, el) {
  // o balão nasce como círculo e o canto se molda na pontinha, com um leve elástico
  const e = outBack(jan(t, T.entra, T.entra + 0.55), 1.9);
  const m = outBack(jan(t, T.molda, T.molda + 0.58), 2.4);
  const puxa = 0.05 * sino(t, T.molda, T.molda + 0.63);
  // no voo até o topo o miolo se abre do centro para fora e o balão vira a versão em contorno
  const k = inOut(jan(t, T.voa + 0.05, T.voa + 0.6));
  if (k > 0) {
    el.forma.setAttribute('d', balaoEm(lerp(20, 19, k), lerp(160, 162, k), lerp(19.2, 27.8, k)));
    el.furo.setAttribute('transform', `translate(100 100) scale(${k}) translate(-100 -100)`);
  } else {
    el.forma.setAttribute('d', balao(Math.max(4, lerp(80, 19.2, m))));
    el.furo.setAttribute('transform', 'scale(0)');
  }

  // vida: o balão respira junto com a ondinha dos pontinhos e balança de leve
  const env = jan(t, T.onda[0], T.onda[0] + 0.25) * (1 - inOut(jan(t, T.onda[1] - 0.3, T.onda[1])));
  const ondas = [0, 1, 2].map((i) => Math.pow(Math.sin(Math.PI * Math.max(0, (t - T.onda[0] - i * 0.13) / 0.62)), 2) * env);
  const respiraOnda = (0.024 * (ondas[0] + ondas[1] + ondas[2])) / 3;
  const balanca = 2.4 * Math.sin((2 * Math.PI * (t - T.onda[0])) / 1.24) * env;
  // depois de pronto ele continua vivo: flutua e respira devagar (e assenta no voo)
  const vivo = jan(t, 2.2, 2.7) * (1 - k);
  const flutua = -3.2 * Math.sin((2 * Math.PI * (t - 2.2)) / 2.1) * vivo;
  const respira = 0.012 * Math.sin((2 * Math.PI * (t - 2.2)) / 2.1 + Math.PI / 2) * vivo;
  // ao deslizar para a esquerda, inclina como quem tem peso e depois assenta
  const vel = (deslize(t + 0.008) - deslize(t)) / 0.008;
  const inclina = 6 * Math.max(0, vel) * jan(t, 2.55, 2.6);
  // a mexidinha de cabeça da piscada: balança para os lados e vai parando
  const dp = t - T.pisca;
  const mexe = dp > 0 ? 10 * Math.exp(-3.6 * dp) * Math.sin((2 * Math.PI * dp) / 0.62) : 0;

  const rot = -14 * (1 - outCubic(jan(t, T.entra, T.entra + 1.0))) + balanca + inclina + mexe;
  const pulo = -9 * sino(t, T.pisca - 0.05, T.pisca + 0.42);
  const acha = 0.045 * sino(t, T.pisca + 0.28, T.pisca + 0.6);
  const s = e * (1 + respiraOnda + respira);
  // a cabeça (balão + olhos) sobe, flutua e gira junto; o corpo ainda estica e respira
  el.cabeca.setAttribute('transform', `translate(0 ${pulo + flutua}) rotate(${rot} 100 100)`);
  el.corpo.setAttribute(
    'transform',
    `translate(100 100) rotate(45) scale(${1 + puxa} ${1 - puxa * 0.6}) rotate(-45) ` +
      `scale(${s * (1 + acha)} ${s * (1 - acha)}) translate(-100 -100)`,
  );

  // os pontinhos: digitam, e as pontas viram os olhinhos (que depois olham para o nome)
  const v = inOut(jan(t, ...T.vira));
  const olha = 3.5 * outCubic(jan(t, 2.75, 3.25)) * (1 - k);
  // piscada feliz: fecha (0–0,09 s), abre em "∩" (até 0,32 s), segura, desfaz e volta a ser pílula
  const P = T.pisca;
  const fecha = t < P ? 0 : Math.pow(jan(t, P, P + 0.09), 2);
  const feliz = t < P + 0.09 ? 0 : outBack(jan(t, P + 0.09, P + 0.32), 1.6) * (1 - inOut(jan(t, P + 0.7, P + 0.86)));
  const reabre = outBack(jan(t, P + 0.86, P + 1.06), 2.0);
  const emArco = t >= P + 0.09 && t < P + 0.86;
  const corOlho = mistura(CORES.branco, CORES.azul, k);
  [[64, 84], [100, 104], [136, 124]].forEach(([x0, x1], i) => {
    const nasce = outBack(jan(t, T.pontos + i * 0.07, T.pontos + 0.33 + i * 0.07), 2);
    if (i === 1) {
      const d = 26 * nasce * (1 - inOut(jan(t, T.vira[0], T.vira[0] + 0.32)));
      pilula(el.pontos[i], lerp(x0, x1, v), lerp(100 - 11 * ondas[i], 94, v), d, d);
      return;
    }
    const o = OLHOS_CONTORNO[i === 0 ? 0 : 1];
    const cx = lerp(lerp(x0, x1, v), o.cx, k) + olha;
    const cy = lerp(lerp(100 - 11 * ondas[i], 94, v), o.cy, k);
    const arc = el.arcos[i === 0 ? 0 : 1];
    if (emArco) {
      el.pontos[i].setAttribute('width', 0);
      arc.style.opacity = 1;
      arco(arc, cx, cy, feliz);
      return;
    }
    arc.style.opacity = 0;
    const w = lerp(lerp(26, 17, v) * nasce, o.w, k);
    let h = lerp(26, 44, outBack(v, 1.3)) * nasce;
    if (t >= P) h = t < P + 0.09 ? lerp(44, 15, fecha) : lerp(15, 44, reabre);
    h = lerp(h, o.h, k);
    pilula(el.pontos[i], cx, cy, Math.min(w, 17), h);
    el.pontos[i].setAttribute('fill', corOlho);
  });

  // o conjunto desliza para a esquerda e o nome entra letra por letra, vindo de trás do balão
  el.conjunto.setAttribute('transform', `translate(${X0 * (1 - deslize(t))} 0)`);
  el.letras.forEach((l, j) => {
    const kl = outQuart(jan(t, T.nome + 0.1 + j * 0.055, T.nome + 0.75 + j * 0.055));
    l.style.opacity = kl;
    l.setAttribute('transform', `translate(${LETRAS[j].x - 40 * (1 - kl)} ${10 * (1 - kl)})`);
  });
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

  const sons = [
    // o círculo nasce ("pop") e o canto se molda ("blup")
    [T.entra, (t) => tom(t, 420, { dur: 0.14, vol: 0.12, ate: 820 })],
    [T.molda, (t) => tom(t, 260, { dur: 0.22, vol: 0.09, ate: 520, filtro: 1500 })],
    // pontinhos surgindo e digitando
    ...[0, 1, 2].map((i) => [T.pontos + i * 0.07, (t) => tom(t, 760 + i * 110, { dur: 0.07, vol: 0.05, ate: 1000 + i * 110 })]),
    ...[0, 1].flatMap((k) => [0, 1, 2].map((i) => [T.onda[0] + i * 0.13 + k * 0.62, (t) => tom(t, 1150 + i * 120, { dur: 0.05, vol: 0.02 })])),
    // os olhinhos se formando e a piscada
    [T.vira[0], (t) => tom(t, 300, { dur: 0.26, vol: 0.1, ate: 640, filtro: 1600 })],
    [T.pisca, (t) => tom(t, 1250, { dur: 0.09, vol: 0.05, ate: 1700 })],
    // letras
    ...LETRAS.map((_, j) => [T.nome + 0.1 + j * 0.055, (t) => chiado(t, { dur: 0.03, vol: 0.05, freq: 2400 + j * 260, tipo: 'highpass' })]),
    // acorde final e o sopro do voo até o topo
    [T.nome + 0.55, (t) => {
      tom(t, 659.25, { dur: 1.3, vol: 0.06, tipo: 'triangle' });
      tom(t + 0.06, 987.77, { dur: 1.2, vol: 0.045, tipo: 'triangle' });
      tom(t + 0.06, 1318.5, { dur: 0.8, vol: 0.015 });
    }],
    [T.voa, (t) => chiado(t, { dur: 0.6, vol: 0.04, freq: 2600, ate: 300 })],
  ];

  return {
    ctx,
    liberado: () => ctx.state === 'running',
    /** Agenda os sons que ainda não passaram, contando que a abertura começou há "decorrido" segundos. */
    tocarDesde(decorrido) {
      const agora = ctx.currentTime + 0.02;
      for (const [s, fn] of sons) if (s >= decorrido) fn(agora + (s - decorrido));
    },
    fechar: () => ctx.close().catch(() => {}),
  };
}

/**
 * A abertura: um círculo vira balão, os pontinhos de "digitando…" viram os
 * olhinhos, ele pisca, "helpy" entra e o conjunto voa até o lugar dele no topo.
 */
export default function IntroLogo({ onSaindo, onFim }) {
  const [fase, setFase] = useState('monta');
  const raiz = useRef(null);
  const som = useRef(null);
  const acabou = useRef(false);
  const pulou = useRef(false);
  const quadro = useRef(0);

  const encerrar = useCallback((pulouAgora = false) => {
    if (acabou.current) return;
    acabou.current = true;
    pulou.current = pulouAgora;
    if (pulouAgora) cancelAnimationFrame(quadro.current);
    try {
      sessionStorage.setItem(CHAVE, '1');
    } catch {
      /* sem armazenamento: mostra de novo na próxima, sem problema */
    }
    onSaindo?.();
    if (pulouAgora) raiz.current?.setAttribute('data-pulou', '');
    setFase('sai');
    document.documentElement.style.overflow = '';
    const s = som.current;
    if (pulouAgora) s?.fechar();
    else setTimeout(() => s?.fechar(), 1600); // deixa o acorde terminar
    setTimeout(() => onFim?.(), pulouAgora ? 450 : (T.fim - T.voa) * 1000);
  }, [onSaindo, onFim]);

  // o conjunto encolhe e voa até a logo do topo; o fundo esmaece junto
  const voar = useCallback(() => {
    const r = raiz.current;
    const logo = r?.querySelector('.abertura-logo');
    const caixa = r?.querySelector('.ab-caixa');
    const alvo = document.querySelector('.lp-top-marca svg');
    const dur = (T.fim - T.voa) * 1000;
    r?.querySelector('.abertura-fundo')?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: dur * 0.8, easing: 'ease-in-out', fill: 'forwards' });
    if (logo && caixa && alvo) {
      // a caixa 200×200 do símbolo da abertura precisa cair em cima da caixa do símbolo do topo
      const L = logo.getBoundingClientRect();
      const a = caixa.getBoundingClientRect();
      const b = alvo.getBoundingClientRect();
      const s = b.width / a.width;
      const c = { x: L.left + L.width / 2, y: L.top + L.height / 2 };
      const dx = b.left - c.x - s * (a.left - c.x);
      const dy = b.top - c.y - s * (a.top - c.y);
      logo.animate([{ transform: 'none' }, { transform: `translate(${dx}px, ${dy}px) scale(${s})` }], {
        duration: dur, easing: 'cubic-bezier(0.65, 0, 0.2, 1)', fill: 'forwards',
      });
    }
    encerrar(false);
  }, [encerrar]);

  useEffect(() => {
    const r = raiz.current;
    if (!r) return undefined;
    const el = {
      forma: r.querySelector('.ab-forma'),
      corpo: r.querySelector('.ab-corpo'),
      cabeca: r.querySelector('.ab-cabeca'),
      furo: r.querySelector('.ab-furo'),
      arcos: [...r.querySelectorAll('.ab-arco')],
      conjunto: r.querySelector('.ab-conjunto'),
      pontos: [...r.querySelectorAll('.ab-ponto')],
      letras: [...r.querySelectorAll('.ab-letra')],
    };
    desenhar(0, el);
    const inicio = performance.now();

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
      x.ctx.resume().then(() => x.tocarDesde((performance.now() - inicio) / 1000)).catch(() => {});
    };
    const tecla = (e) => {
      if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') encerrar(true);
      else liberar();
    };
    window.addEventListener('pointerdown', liberar, { once: true });
    window.addEventListener('keydown', tecla);
    const html = document.documentElement;
    html.style.overflow = 'hidden';

    let voou = false;
    const passo = (agora) => {
      if (pulou.current) return;
      const t = (agora - inicio) / 1000;
      if (t >= T.voa && !voou) {
        voou = true;
        desenhar(T.voa, el);
        voar();
      }
      desenhar(Math.min(t, T.fim), el);
      if (t < T.fim) quadro.current = requestAnimationFrame(passo);
    };
    quadro.current = requestAnimationFrame(passo);

    return () => {
      cancelAnimationFrame(quadro.current);
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
      <div className="abertura-logo">
        <svg className="abertura-svg" viewBox={`0 -40 ${LARG} 280`}>
          <g className="ab-conjunto">
            <rect className="ab-caixa" width="200" height="200" fill="none" />
            <defs>
              {/* o miolo que se abre no voo, transformando o balão cheio na versão em contorno */}
              <mask id="ab-miolo" maskUnits="userSpaceOnUse" x="-100" y="-100" width="400" height="400">
                <rect x="-100" y="-100" width="400" height="400" fill="#fff" />
                <path className="ab-furo" d={balaoEm(41, 118, 5.8)} fill="#000" transform="scale(0)" />
              </mask>
            </defs>
            <g className="ab-cabeca">
              <g className="ab-corpo">
                <path className="ab-forma" fill={CORES.azul} mask="url(#ab-miolo)" />
              </g>
              {[0, 1, 2].map((i) => <rect key={i} className="ab-ponto" fill={CORES.branco} />)}
              {[0, 1].map((i) => (
                <path key={i} className="ab-arco" fill="none" stroke={CORES.branco} strokeWidth="15" strokeLinecap="round" opacity="0" />
              ))}
            </g>
            <g transform={`translate(${200 + VAO} ${BASE}) scale(${E})`} fill={CORES.marinho}>
              {LETRAS.map((l) => <path key={l.x} className="ab-letra" d={l.d} opacity="0" />)}
            </g>
          </g>
        </svg>
      </div>
      <button type="button" className="abertura-pular" tabIndex={-1} onClick={() => encerrar(true)}>
        Pular
      </button>
    </div>
  );
}
