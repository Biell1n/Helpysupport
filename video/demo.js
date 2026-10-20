// Controle do vídeo: tudo depende de um único relógio `t` (ms).
// No navegador o relógio anda sozinho; para gerar o arquivo, o render.mjs
// chama window.__quadro(t) quadro a quadro e tira um print de cada um.

import { CONJUNTO, CORES, LETRAS, NOME, OLHOS, senha } from '../src/components/marcaDesenho.js';
import { MARCAS } from '../src/components/efeitos/marcas.js';
import VOZ from './narracao/duracoes.json';

// A ordem das cenas, quanto cada uma dura no mínimo (o tempo das animações) e
// para onde a câmera anda durante ela. A cena dura o que for maior: o mínimo
// ou a fala da narração (video/narrar.mjs) com um respiro antes e depois.
// Câmera: s = zoom, x/y = deslocamento em px, rx/ry = inclinação em graus.
const ROTEIRO = [
  { cena: 'abertura', base: 3600, cam: [{ s: 1.08 }, { s: 1 }] },
  { cena: 'conte', base: 8000, cam: [{ s: 1.04, ry: 5, x: 30 }, { s: 1, ry: -2 }] },
  { cena: 'publique', base: 8000, cam: [{ s: 1, x: 20 }, { s: 1.05, x: -40, y: -10 }] },
  { cena: 'canais', base: 12400, cam: [{ s: 1.14, rx: 16, ry: -12, y: 60 }, { s: 1, rx: 3, ry: 5 }] },
  { cena: 'dados', base: 12000, cam: [{ s: 1.03, ry: 7, x: 30 }, { s: 1.03, ry: -3, x: -10, y: -10 }] },
  { cena: 'chamados', base: 6000, cam: [{ s: 1.06, rx: 8 }, { s: 1, rx: 0 }] },
  { cena: 'relatorios', base: 5500, cam: [{ s: 1.05, y: 20 }, { s: 1, y: 0 }] },
  { cena: 'planos', base: 5700, cam: [{ s: 1.1, rx: 14, y: 40 }, { s: 1, rx: 0 }] },
  { cena: 'fechamento', base: 4200, cam: [{ s: 1.12 }, { s: 1 }] },
];
const ANTES_DA_FALA = 500;
const DEPOIS_DA_FALA = 900;

let t0 = 0;
const LINHA = ROTEIRO.map((r) => {
  const fala = VOZ[r.cena] ?? 0;
  const dur = Math.max(r.base, fala ? ANTES_DA_FALA + fala + DEPOIS_DA_FALA : 0);
  // as animações da cena se espalham um pouco quando a fala é mais longa que o mínimo
  const ritmo = Math.min(1.5, dur / r.base);
  const item = { ...r, ini: t0, fim: t0 + dur, ritmo, fala: fala ? { arquivo: `narracao/${r.cena}.mp3`, inicio: t0 + ANTES_DA_FALA } : null };
  t0 += dur;
  return item;
});
const DA = Object.fromEntries(LINHA.map((l) => [l.cena, l]));

export const DURACAO = t0;

// a marca atual do Helpy, desenhada pelo mesmo código do site
const MARCA = (tamanho) => `
<svg width="${tamanho}" height="${tamanho}" viewBox="0 0 200 200" aria-hidden="true">
  <path d="${senha()}" fill="${CORES.azul}"/>
  ${OLHOS.map((o) => `<rect x="${o.cx - o.w / 2}" y="${o.cy - o.h / 2}" width="${o.w}" height="${o.h}" rx="${o.w / 2}" fill="#fff"/>`).join('')}
</svg>`;

/** O nome "helpy" em vetor, alinhado ao símbolo como no site. */
const NOME_SVG = (tamanho) => {
  const px = (u) => (u * CONJUNTO.escala * tamanho) / 200;
  return `<svg class="nome" width="${px(NOME.largura)}" height="${px(NOME.topo + NOME.base)}" viewBox="0 ${-NOME.topo} ${NOME.largura} ${NOME.topo + NOME.base}"
    style="margin-top:${((CONJUNTO.linhaBase - NOME.topo * CONJUNTO.escala) * tamanho) / 200}px" aria-hidden="true">
    <g fill="${CORES.marinho}">${LETRAS.map((l) => `<path d="${l.d}" transform="translate(${l.x} 0)"/>`).join('')}</g></svg>`;
};

const suave = (x) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);
const vaiEVolta = (x) => {
  const c = Math.min(1, Math.max(0, x));
  return c < 0.5 ? 4 * c * c * c : 1 - Math.pow(-2 * c + 2, 3) / 2;
};

export function iniciar() {
  const doc = document;

  doc.querySelectorAll('[data-marca]').forEach((el) => {
    const n = Number(el.dataset.marca);
    el.innerHTML = `${MARCA(n)}${n < 60 ? NOME_SVG(n) : ''}`;
  });

  // mapa de calor com um padrão de semana de barbearia
  doc.querySelectorAll('[data-calor]').forEach((grade) => {
    let semente = 11;
    const rnd = () => ((semente = (semente * 9301 + 49297) % 233280) / 233280);
    for (let d = 0; d < 6; d++) {
      for (let h = 0; h < 12; h++) {
        const base = (h >= 3 && h <= 4) || (h >= 9 && h <= 10) ? 0.75 : 0.25;
        const v = Math.min(1, base * (d === 5 ? 1.35 : 1) + rnd() * 0.3);
        const c = doc.createElement('i');
        c.style.setProperty('--v', v.toFixed(2));
        c.className = 'anim a-celula';
        c.style.setProperty('--d', `${2000 + (d * 12 + h) * 14}ms`);
        grade.appendChild(c);
      }
    }
  });

  // logos dos canais e das fontes de dados, desenhados pelo mesmo arquivo do site
  doc.querySelectorAll('[data-logo]').forEach((el) => {
    const m = MARCAS[el.dataset.logo];
    if (m) el.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${m.d}"/></svg>`;
  });

  // cada cena guarda tempos relativos ao próprio começo; aqui eles viram o relógio do vídeo
  for (const sec of doc.querySelectorAll('[data-cena]')) {
    const l = DA[sec.dataset.cena];
    if (!l) continue;
    sec.dataset.ini = l.ini;
    sec.dataset.fim = l.cena === 'fechamento' ? 999999 : l.fim;
    for (const el of sec.querySelectorAll('[style*="--d"]')) {
      const rel = parseFloat(el.style.getPropertyValue('--d')) || 0;
      el.style.setProperty('--d', `${Math.round(l.ini + rel * l.ritmo)}ms`);
    }
    for (const el of sec.querySelectorAll('[data-t0]')) el.dataset.t0 = Math.round(l.ini + Number(el.dataset.t0) * l.ritmo);
  }
  for (const li of doc.querySelectorAll('.capitulos li')) {
    const l = DA[li.dataset.cena];
    li.dataset.de = l.ini;
    li.dataset.ate = l.fim;
  }

  const cenas = [...doc.querySelectorAll('.cena')];
  const digita = [...doc.querySelectorAll('[data-digita]')].map((el) => ({ el, txt: el.textContent, t0: +el.dataset.t0, dur: +el.dataset.dur }));
  const conta = [...doc.querySelectorAll('[data-conta]')].map((el) => ({
    el, de: +el.dataset.de, para: +el.dataset.para, t0: +el.dataset.t0, dur: +el.dataset.dur, sufixo: el.dataset.sufixo ?? '',
  }));
  const capitulos = [...doc.querySelectorAll('.capitulos li')];
  const barra = doc.querySelector('.progresso span');

  // todas as animações CSS passam a obedecer ao relógio
  const animacoes = () => doc.getAnimations();

  function quadro(t) {
    for (const a of animacoes()) {
      a.pause();
      a.currentTime = t;
    }
    for (const c of cenas) {
      const ini = +c.dataset.ini;
      const fim = +c.dataset.fim;
      const viva = t >= ini - 50 && t <= fim + 900;
      c.style.visibility = viva ? 'visible' : 'hidden';
      // saída: desliza e desfoca
      const saida = suave((t - fim) / 700);
      const entrada = suave((t - ini) / 700);
      const x = (1 - entrada) * 60 - saida * 90;
      c.style.opacity = String(Math.min(entrada, 1 - saida));
      // câmera: anda do primeiro ao segundo ponto ao longo da cena, devagar no começo e no fim
      const [de, para] = DA[c.dataset.cena].cam;
      const p = vaiEVolta((t - ini) / Math.max(1, Math.min(fim, DURACAO) - ini));
      const v = (k, padrao = 0) => (de[k] ?? padrao) + ((para[k] ?? padrao) - (de[k] ?? padrao)) * p;
      c.style.transform = `perspective(2200px) translate3d(${x + v('x')}px, ${v('y')}px, 0) scale(${v('s', 1) * (1 - saida * 0.03)}) rotateX(${v('rx')}deg) rotateY(${v('ry')}deg)`;
      c.style.filter = saida > 0 ? `blur(${saida * 10}px)` : 'none';
    }
    for (const d of digita) {
      const n = Math.round(suave((t - d.t0) / d.dur) * d.txt.length * (t >= d.t0 ? 1 : 0));
      const digitando = t >= d.t0 && t < d.t0 + d.dur + 400;
      d.el.textContent = d.txt.slice(0, n);
      d.el.dataset.cursor = digitando ? 'sim' : 'nao';
    }
    for (const c of conta) {
      const v = c.de + (c.para - c.de) * suave((t - c.t0) / c.dur);
      c.el.textContent = `${Math.round(v).toLocaleString('pt-BR')}${c.sufixo}`;
    }
    for (const li of capitulos) {
      li.dataset.ativo = t >= +li.dataset.de && t < +li.dataset.ate ? 'sim' : 'nao';
    }
    const mostrarMoldura = t > DA.abertura.fim - 200 && t < DA.fechamento.ini + 100;
    doc.querySelector('.moldura-topo').style.opacity = mostrarMoldura ? '1' : '0';
    barra.style.transform = `scaleX(${Math.min(1, t / DURACAO)})`;
  }

  window.__quadro = quadro;
  window.__duracao = DURACAO;
  window.__narracao = LINHA.filter((l) => l.fala).map((l) => l.fala);
  window.__poster = DA.abertura.ini + 2600;

  // tocando ao vivo, a menos que o render esteja no controle
  if (!new URLSearchParams(location.search).has('render')) {
    const inicio = performance.now();
    const passo = (agora) => {
      quadro((agora - inicio) % DURACAO);
      requestAnimationFrame(passo);
    };
    requestAnimationFrame(passo);
  } else {
    quadro(0);
  }
}
