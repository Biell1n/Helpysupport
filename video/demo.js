// Controle do vídeo: tudo depende de um único relógio `t` (ms).
// No navegador o relógio anda sozinho; para gerar o arquivo, o render.mjs
// chama window.__quadro(t) quadro a quadro e tira um print de cada um.

export const DURACAO = 40000;

const MARCA = (tamanho) => `
<svg width="${tamanho}" height="${tamanho}" viewBox="0 0 64 64" aria-hidden="true">
  <defs>
    <mask id="mr${tamanho}"><rect width="64" height="64" fill="#fff"/><circle cx="5" cy="27" r="5" fill="#000"/><circle cx="59" cy="27" r="5" fill="#000"/></mask>
    <clipPath id="mc${tamanho}"><rect x="44" y="0" width="20" height="64"/></clipPath>
  </defs>
  <g mask="url(#mr${tamanho})">
    <rect x="5" y="9" width="54" height="36" rx="9" fill="#0B1A2C"/>
    <path d="M14 43 L11 57 L27 43 Z" fill="#0B1A2C"/>
    <rect x="5" y="9" width="54" height="36" rx="9" fill="#FFCF33" clip-path="url(#mc${tamanho})"/>
  </g>
  <path d="M44 13.5v27" stroke="#0B1A2C" stroke-width="2.4" stroke-dasharray="2.6 3.2"/>
  <path d="M15.5 21.5h18M15.5 31h11" stroke="#FFFFFF" stroke-width="4.2" stroke-linecap="round"/>
</svg>`;

const suave = (x) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);

export function iniciar() {
  const doc = document;

  doc.querySelectorAll('[data-marca]').forEach((el) => {
    const n = Number(el.dataset.marca);
    el.innerHTML = `${MARCA(n)}${n < 60 ? '<b>helpy</b>' : ''}`;
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
        c.style.setProperty('--d', `${27600 + (d * 12 + h) * 14}ms`);
        grade.appendChild(c);
      }
    }
  });

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
      c.style.transform = `translateX(${x}px) scale(${1 - saida * 0.03})`;
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
    const mostrarMoldura = t > 3400 && t < 36900;
    doc.querySelector('.moldura-topo').style.opacity = mostrarMoldura ? '1' : '0';
    barra.style.transform = `scaleX(${Math.min(1, t / DURACAO)})`;
  }

  window.__quadro = quadro;
  window.__duracao = DURACAO;

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
