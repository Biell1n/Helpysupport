import { useCallback, useEffect, useRef, useState } from 'react';
import { CONJUNTO, CORES, LETRAS, NOME, OLHOS, senha } from '@/components/marcaDesenho';

const CHAVE = 'helpy-abertura';

// linha do tempo da abertura, em segundos
const T = {
  entra: 0.35, // o balãozinho de "digitando…" aparece
  pontos: 0.42, // com os três pontinhos
  onda: [0.7, 1.75], // que fazem a ondinha
  cresce: 1.6, // a pílula cresce e vira o balão-senha
  pontinha: 1.82, // a pontinha do balão sai
  picote: 2.12, // e os lados são picotados, como uma senha de atendimento
  vira: [2.3, 2.75], // as pontas viram os olhinhos, o do meio some
  pisca: 3.0, // fecha os olhos e abre como olhinhos felizes, com uma mexidinha de cabeça
  nome: 2.95, // "helpy" entra letra por letra
  voa: 4.3, // o conjunto voa até o topo do site
  fim: 5.1,
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
const outBack = (x, k = 1.7) => ((x = cl(x)), 1 + (k + 1) * Math.pow(x - 1, 3) + k * Math.pow(x - 1, 2));
const sino = (t, a, b) => Math.pow(Math.sin(Math.PI * jan(t, a, b)), 2);
// "velocity": dispara, freia forte e assenta devagar (a rampa de velocidade da edição de vídeo)
const expo = (x) => ((x = cl(x)), x >= 1 ? 1 : 1 - Math.pow(2, -10 * x));
// mola: chega rápido, passa do ponto e assenta balançando (dt em segundos desde o início)
const mola = (dt, freq = 3, amortece = 9) => (dt <= 0 ? 0 : 1 - Math.exp(-amortece * dt) * Math.cos(2 * Math.PI * freq * dt));
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
const deslize = chaves([2.85, 0, 0], [3.12, 0.6, 2.4], [3.4, 0.9, 0.5], [4.05, 1, 0]);

// gotas do estouro: direção (radianos), distância e raio
const GOTAS = [[-2.5, 118, 13], [-1.75, 104, 10], [-1.05, 126, 14], [-0.3, 110, 11], [3.5, 96, 9]];

/** Liga o filtro "líquido" de um grupo com a força pedida (0 = desligado, traço nítido). */
function gooDe(grupo, borra, forca) {
  if (forca < 0.15) {
    if (grupo.hasAttribute('filter')) grupo.removeAttribute('filter');
    return;
  }
  borra.setAttribute('stdDeviation', forca.toFixed(2));
  if (!grupo.hasAttribute('filter')) grupo.setAttribute('filter', `url(#${borra.parentNode.id})`);
}

function pilula(el, cx, cy, w, h) {
  w = Math.max(w, 0);
  h = Math.max(h, 0);
  el.setAttribute('x', cx - w / 2);
  el.setAttribute('y', cy - h / 2);
  el.setAttribute('width', w);
  el.setAttribute('height', h);
  el.setAttribute('rx', Math.min(w, h) / 2);
}

/** Os olhinhos felizes: um arco que nasce de um traço curto (p = 0) até o "∩" (p = 1). */
function arco(el, cx, yOlho, p) {
  const y = lerp(yOlho, yOlho + 8, p);
  const a = lerp(0.5, 15, p);
  el.setAttribute('d', `M${cx - a},${y} Q${cx},${y - 24 * p} ${cx + a},${y}`);
}

/** Desenha o quadro do instante t (em segundos). */
function desenhar(t, el) {
  // 1) o balãozinho de "digitando…" cai de cima esticado, amassa ao pousar e assenta como gelatina
  const e = mola(t - T.entra, 2.7, 9.5);
  const queda = -18 * (1 - expo(jan(t, T.entra, T.entra + 0.3)));
  const nasceEstica = -0.1 * (1 - expo(jan(t, T.entra, T.entra + 0.2))) + 0.08 * sino(t, T.entra + 0.12, T.entra + 0.44);

  // 2) cresce como líquido: antes encolhe um pouco (pega impulso), depois a altura dispara na
  //    frente e a largura vem atrás, cada uma com a sua mola. Nada de "uma reta que estica".
  const impulso = sino(t, T.cresce - 0.16, T.cresce + 0.06);
  const ch = mola(t - T.cresce, 2.9, 8.5);
  const cw = mola(t - T.cresce - 0.05, 2.4, 8);
  // nasce de um pingo: começa quase redondo e escorre para os lados até virar a pílula
  const escorre = lerp(34, 96, mola(t - T.entra - 0.1, 2.4, 8));
  const w = lerp(escorre, 160, cw) + 12 * impulso;
  const h = lerp(40, 136, ch) - 8 * impulso;
  const tp = Math.max(0, mola(t - T.pontinha, 3.3, 10));
  const f = Math.max(0, 14 * mola(t - T.picote, 4.2, 12));
  el.forma.setAttribute('d', senha({ w, h, r: Math.min(lerp(20, 42, cl((cw + ch) / 2)), w / 2, h / 2), f, t: tp }));
  // gotas que espirram no estouro e somem no ar (com o filtro, saem do corpo como líquido)
  el.gotas.forEach((g, i) => {
    const u = jan(t, T.cresce + 0.03 + i * 0.025, T.cresce + 0.62 + i * 0.04);
    const [ang, dist, raio] = GOTAS[i];
    const d = dist * expo(u);
    g.setAttribute('cx', 100 + Math.cos(ang) * d);
    g.setAttribute('cy', 92 + Math.sin(ang) * d - 14 * Math.sin(Math.PI * u));
    g.setAttribute('r', u <= 0 || u >= 1 ? 0 : raio * (1 - u * u));
  });
  // três pingos caem em sequência, fundem-se no corpo e deixam uma ondinha correndo pela pílula
  el.pingos.forEach((g, i) => {
    const t0 = T.entra + 0.03 + i * 0.075;
    const cai = expo(jan(t, t0, t0 + 0.26));
    const dt = t - (t0 + 0.18);
    const ondinha = dt > 0 ? 12 * Math.exp(-5 * dt) * Math.sin(2 * Math.PI * 2.5 * dt) : 0;
    g.setAttribute('cx', 72 + i * 28);
    g.setAttribute('cy', lerp(-78, 92, cai) - ondinha);
    g.setAttribute('r', t < t0 || t > T.entra + 1.2 ? 0 : 20 * (0.5 + 0.5 * cai));
  });
  // o "líquido": borra e recorta o corpo enquanto ele nasce e enquanto se transforma; depois fica nítido
  const gosma = Math.max(
    t < T.entra ? 0 : 6.5 * (1 - inOut(jan(t, T.entra + 0.7, T.entra + 1.1))),
    7 * jan(t, T.cresce - 0.2, T.cresce - 0.05) * (1 - inOut(jan(t, T.cresce + 0.55, T.cresce + 0.9))),
  );
  gooDe(el.liquido, el.borraCorpo, gosma);
  // o picote dá um "clique": o corpo achata de leve e volta
  const clique = 0.035 * sino(t, T.picote, T.picote + 0.26);

  // vida: o balão respira com a ondinha e balança de leve
  const env = jan(t, T.onda[0], T.onda[0] + 0.25) * (1 - inOut(jan(t, T.onda[1] - 0.3, T.onda[1])));
  const ondas = [0, 1, 2].map((i) => Math.pow(Math.sin(Math.PI * Math.max(0, (t - T.onda[0] - i * 0.13) / 0.62)), 2) * env);
  const respiraOnda = (0.03 * (ondas[0] + ondas[1] + ondas[2])) / 3;
  const balanca = 2.2 * Math.sin((2 * Math.PI * (t - T.onda[0])) / 1.24) * env;
  const voando = jan(t, T.voa, T.voa + 0.2);
  const vivo = jan(t, 2.4, 2.9) * (1 - voando);
  const flutua = -3.2 * Math.sin((2 * Math.PI * (t - 2.4)) / 2.1) * vivo;
  const respira = 0.012 * Math.sin((2 * Math.PI * (t - 2.4)) / 2.1 + Math.PI / 2) * vivo;
  const vel = (deslize(t + 0.008) - deslize(t)) / 0.008;
  const inclina = 6 * Math.max(0, vel) * jan(t, 2.85, 2.9);
  const dp = t - T.pisca;
  const mexe = dp > 0 ? 10 * Math.exp(-3.6 * dp) * Math.sin((2 * Math.PI * dp) / 0.62) : 0;

  const rot = -14 * (1 - expo(jan(t, T.entra, T.entra + 0.7))) + balanca + inclina + mexe;
  const pulo = -9 * sino(t, T.pisca - 0.05, T.pisca + 0.42);
  const acha = 0.045 * sino(t, T.pisca + 0.28, T.pisca + 0.6) + clique + nasceEstica;
  const s = e * (1 + respiraOnda + respira);
  el.cabeca.setAttribute('transform', `translate(0 ${pulo + flutua + queda}) rotate(${rot} 100 92)`);
  el.corpo.setAttribute('transform', `translate(100 92) scale(${s * (1 + acha)} ${s * (1 - acha)}) translate(-100 -92)`);

  // 3) os pontinhos digitam e as pontas viram os olhinhos (que depois olham para o nome)
  const v = inOut(jan(t, ...T.vira));
  const olha = 3.5 * outCubic(jan(t, 3.05, 3.55)) * (1 - voando);
  const P = T.pisca;
  const fecha = t < P ? 0 : Math.pow(jan(t, P, P + 0.09), 2);
  const feliz = t < P + 0.09 ? 0 : outBack(jan(t, P + 0.09, P + 0.32), 1.6) * (1 - inOut(jan(t, P + 0.7, P + 0.86)));
  const reabre = outBack(jan(t, P + 0.86, P + 1.06), 2.0);
  const emArco = t >= P + 0.09 && t < P + 0.86;
  // os pontinhos se juntam numa ponte líquida e ela se parte nos dois olhos
  const ponte = inOut(jan(t, T.vira[0], T.vira[0] + 0.16)) * (1 - expo(jan(t, T.vira[0] + 0.2, T.vira[1])));
  const olhoAlto = mola(t - T.vira[0] - 0.16, 2.8, 8.5);
  gooDe(el.brancos, el.borraOlhos, 5 * jan(t, T.vira[0] - 0.08, T.vira[0]) * (1 - inOut(jan(t, T.vira[1], T.vira[1] + 0.18))));
  [[76, OLHOS[0].cx], [100, 100], [124, OLHOS[1].cx]].forEach(([x0, x1], i) => {
    const nasce = Math.max(0, mola(t - T.pontos - i * 0.07, 3.4, 10));
    const cy = lerp(92 - 8 * ondas[i], OLHOS[0].cy, v);
    if (i === 1) {
      const some = 1 - expo(jan(t, T.vira[0] + 0.2, T.vira[1] - 0.05));
      pilula(el.pontos[i], 100, cy, (20 + 34 * ponte) * nasce * some, (20 - 7 * ponte) * nasce * some);
      return;
    }
    const cx = lerp(x0, x1, v) + olha;
    const arc = el.arcos[i === 0 ? 0 : 1];
    if (emArco) {
      el.pontos[i].setAttribute('width', 0);
      arc.style.opacity = 1;
      arco(arc, cx, cy, feliz);
      return;
    }
    arc.style.opacity = 0;
    const w = lerp(20, OLHOS[0].w, v) * nasce;
    let h = lerp(20, OLHOS[0].h, olhoAlto) * nasce;
    if (t >= P) h = t < P + 0.09 ? lerp(OLHOS[0].h, 15, fecha) : lerp(15, OLHOS[0].h, reabre);
    pilula(el.pontos[i], cx, cy, w, h);
  });

  // o conjunto desliza para a esquerda e o nome entra letra por letra, vindo de trás do balão
  el.conjunto.setAttribute('transform', `translate(${X0 * (1 - deslize(t))} 0)`);
  el.letras.forEach((l, j) => {
    const u = jan(t, T.nome + 0.1 + j * 0.055, T.nome + 0.85 + j * 0.055);
    const kl = expo(u);
    l.style.opacity = cl(u * 5);
    l.setAttribute('transform', `translate(${LETRAS[j].x - 86 * (1 - kl)} ${6 * (1 - kl)}) skewX(${-26 * (1 - kl)})`);
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
    // o balãozinho nasce ("pop"), cresce ("blup"), solta a pontinha e é picotado ("clique")
    [T.entra, (t) => tom(t, 420, { dur: 0.14, vol: 0.12, ate: 820 })],
    [T.cresce, (t) => tom(t, 220, { dur: 0.3, vol: 0.1, ate: 560, filtro: 1500 })],
    [T.pontinha, (t) => tom(t, 700, { dur: 0.08, vol: 0.05, ate: 1100 })],
    [T.picote, (t) => { chiado(t, { dur: 0.04, vol: 0.08, freq: 3400 }); tom(t, 1500, { dur: 0.05, vol: 0.05, ate: 900 }); }],
    // pontinhos surgindo e digitando
    ...[0, 1, 2].map((i) => [T.pontos + i * 0.07, (t) => tom(t, 760 + i * 110, { dur: 0.07, vol: 0.05, ate: 1000 + i * 110 })]),
    ...[0, 1].flatMap((k) => [0, 1, 2].map((i) => [T.onda[0] + i * 0.13 + k * 0.62, (t) => tom(t, 1150 + i * 120, { dur: 0.05, vol: 0.02 })])),
    // os olhinhos se formando e a piscada
    [T.vira[0], (t) => tom(t, 300, { dur: 0.26, vol: 0.1, ate: 640, filtro: 1600 })],
    [T.pisca, (t) => tom(t, 1250, { dur: 0.09, vol: 0.05, ate: 1700 })],
    // letras
    ...LETRAS.map((_, j) => [T.nome + 0.1 + j * 0.055, (t) => chiado(t, { dur: 0.03, vol: 0.05, freq: 2400 + j * 260, tipo: 'highpass' })]),
    // acorde final (o voo até o topo é em silêncio)
    [T.nome + 0.55, (t) => {
      tom(t, 659.25, { dur: 1.3, vol: 0.06, tipo: 'triangle' });
      tom(t + 0.06, 987.77, { dur: 1.2, vol: 0.045, tipo: 'triangle' });
      tom(t + 0.06, 1318.5, { dur: 0.8, vol: 0.015 });
    }],
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
      logo.animate([
        { transform: 'none', easing: 'cubic-bezier(0.3, 0, 0.6, 1)' },
        // impulso: recua um pouco no sentido contrário e cresce de leve antes de disparar
        { offset: 0.2, transform: `translate(${-dx * 0.035}px, ${-dy * 0.06}px) scale(1.05)`, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' },
        { transform: `translate(${dx}px, ${dy}px) scale(${s})` },
      ], { duration: dur, fill: 'forwards' });
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
      arcos: [...r.querySelectorAll('.ab-arco')],
      conjunto: r.querySelector('.ab-conjunto'),
      pontos: [...r.querySelectorAll('.ab-ponto')],
      gotas: [...r.querySelectorAll('.ab-gota')],
      pingos: [...r.querySelectorAll('.ab-pingo')],
      liquido: r.querySelector('.ab-liquido'),
      brancos: r.querySelector('.ab-brancos'),
      borraCorpo: r.querySelector('#ab-goo-corpo feGaussianBlur'),
      borraOlhos: r.querySelector('#ab-goo-olhos feGaussianBlur'),
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
          <defs>
            {/* filtro "líquido": borra e recorta de novo, então formas próximas se fundem como gotas */}
            {['ab-goo-corpo', 'ab-goo-olhos'].map((id) => (
              <filter key={id} id={id} x="-60%" y="-60%" width="220%" height="220%" colorInterpolationFilters="sRGB">
                <feGaussianBlur in="SourceGraphic" stdDeviation="0" result="b" />
                <feColorMatrix in="b" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -10" />
              </filter>
            ))}
          </defs>
          <g className="ab-conjunto">
            <rect className="ab-caixa" width="200" height="200" fill="none" />
            <g className="ab-cabeca">
              <g className="ab-liquido">
                <g className="ab-corpo">
                  <path className="ab-forma" fill={CORES.azul} />
                </g>
                {GOTAS.map((_, i) => <circle key={i} className="ab-gota" r="0" fill={CORES.azul} />)}
                {[0, 1, 2].map((i) => <circle key={i} className="ab-pingo" r="0" fill={CORES.azul} />)}
              </g>
              <g className="ab-brancos">
                {[0, 1, 2].map((i) => <rect key={i} className="ab-ponto" fill={CORES.branco} />)}
              </g>
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
