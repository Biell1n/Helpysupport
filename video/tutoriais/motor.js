// Motor dos vídeos tutoriais. render(T) desenha o quadro do segundo T, sempre igual
// (os quadros são gravados em ordem, um a um). Também exporta window.EVENTOS, a lista de
// sons (clique, tecla, pop, sucesso, transição…) com o segundo exato de cada um.
//
// Roteiro de cada cena (atributos da <section class="scene">):
//   data-dur      duração em segundos
//   data-passo    número do passo (barra de progresso e legenda)
//   data-cursor   [[t, "seletor", 1?], [t, x, y, 1?]]  o cursor CHEGA ao alvo em t (e clica, se 1)
//   data-cam      [[t, zoom, "seletor"|null]]           a câmera começa a ir para o enquadramento em t
//   data-toque    cena de celular: um círculo de dedo no lugar da seta
// Elementos: data-on / data-off (aparece e some), data-mostra (sai do layout quando some),
// data-anim (sobe, pop, lado, modal, toast, balao), data-digita + data-t (digita), data-cola,
// data-aperta (botão afunda), data-check (marca), data-marca, data-realce "a-b".
// Dois estados que trocam no mesmo lugar ficam dentro de .troca (mesma célula, nada pula).
(() => {
  const TR = 0.7; // transição entre cenas (segundos)
  const stage = document.getElementById('stage');
  const cenas = [...document.querySelectorAll('.scene')];
  const ini = [];
  let soma = 0;
  for (const c of cenas) { ini.push(soma); soma += Number(c.dataset.dur); }
  window.DURACAO = soma;
  const fimDe = (k) => ini[k] + Number(cenas[k].dataset.dur);

  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const io = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
  const out = (x) => 1 - Math.pow(1 - x, 3);
  const seno = (x) => 0.5 - 0.5 * Math.cos(Math.PI * clamp(x));
  const mj = (x) => x * x * x * (10 + x * (6 * x - 15)); // minimum-jerk: o jeito de uma mão de verdade
  const back = (x) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
  const faixa = (s) => String(s).split('-').map(Number);
  const json = (s) => (s ? JSON.parse(s) : null);

  // a câmera fica num visor que não invade a legenda
  for (const cam of document.querySelectorAll('.camera')) {
    const visor = document.createElement('div');
    visor.className = 'visor';
    cam.parentNode.insertBefore(visor, cam);
    visor.appendChild(cam);
  }

  // ---------- fundo e progresso ----------
  const fundo = document.createElement('div');
  fundo.className = 'fundo';
  fundo.innerHTML = '<i></i><i></i><i></i>';
  stage.prepend(fundo);
  const blobs = [...fundo.children];

  const passos = [...new Set(cenas.map((c) => c.dataset.passo).filter(Boolean))];
  const prog = document.createElement('div');
  prog.className = 'progresso';
  prog.innerHTML = passos.map(() => '<span><b></b></span>').join('');
  stage.appendChild(prog);
  const barras = [...prog.querySelectorAll('b')];

  const cursor = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  cursor.setAttribute('class', 'cursor');
  cursor.setAttribute('viewBox', '0 0 24 24');
  cursor.innerHTML = '<path d="M5 3v16.2l4.1-3.9 2.7 6.3 2.6-1.1-2.6-6.2h5.8z" fill="#0b1a2c" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/>';
  const dedo = document.createElement('div');
  dedo.className = 'dedo';
  const ripple = document.createElement('div');
  ripple.className = 'clique';
  stage.appendChild(ripple);
  stage.appendChild(dedo);
  stage.appendChild(cursor);

  // ---------- roteiro do cursor (global) ----------
  const kfs = [];
  cenas.forEach((c, k) => {
    for (const [t, a, b, d] of json(c.dataset.cursor) ?? []) {
      kfs.push(typeof a === 'string' ? { T: ini[k] + t, cena: k, sel: a, clica: b === 1 } : { T: ini[k] + t, cena: k, xy: [a, b], clica: d === 1 });
    }
  });
  const pos = new Map(); // última posição conhecida de cada alvo
  const INICIO = [1010, 430];
  let ultimo = INICIO.slice();

  function alvo(kf, T) {
    if (kf.xy) return kf.xy;
    const chave = `${kf.cena}|${kf.sel}`;
    // a cena que está saindo não arrasta o cursor junto: o alvo fica congelado
    if (T >= fimDe(kf.cena) - TR / 2 && pos.has(chave)) return pos.get(chave);
    const el = cenas[kf.cena].classList.contains('viva') ? cenas[kf.cena].querySelector(kf.sel) : null;
    if (el) {
      const r = el.getBoundingClientRect();
      if (r.width || r.height) {
        const p = [r.left + r.width / 2, r.top + r.height / 2];
        pos.set(chave, p);
        return p;
      }
    }
    return pos.get(chave) ?? ultimo;
  }

  // ---------- estado de cada cena num instante ----------
  function estado(c, t, dur) {
    // aparecer e sumir com movimento
    c.querySelectorAll('[data-on],[data-off]').forEach((el) => {
      const on = el.dataset.on != null ? Number(el.dataset.on) : -1;
      const off = el.dataset.off != null ? Number(el.dataset.off) : Infinity;
      const entra = on < 0 ? 1 : clamp((t - on) / 0.38);
      const sai = clamp((t - off) / 0.25);
      const v = entra * (1 - sai);
      const tipo = el.dataset.anim || (el.classList.contains('modal') ? 'modal' : el.classList.contains('toast') ? 'toast' : el.classList.contains('balao') ? 'balao' : el.classList.contains('ok') ? 'ok' : 'sobe');
      // quem tem data-mostra (ou só data-off) sai do layout; dentro de .troca, nunca (os dois estados dividem o lugar)
      const naTroca = el.parentElement?.classList.contains('troca');
      const saiDoLayout = !naTroca && (el.hasAttribute('data-mostra') || (el.dataset.off != null && el.dataset.on == null));
      if (v <= 0) {
        if (saiDoLayout) el.classList.add('esconde');
        else { el.classList.remove('esconde'); el.style.opacity = 0; el.style.visibility = 'hidden'; }
        return;
      }
      el.classList.remove('esconde');
      el.style.visibility = '';
      el.classList.add('on');
      if (tipo === 'modal') {
        el.style.opacity = io(v);
        const card = el.querySelector('.card');
        if (card) card.style.transform = `translateY(${(1 - out(entra)) * 18}px) scale(${0.96 + 0.04 * back(entra)})`;
      } else if (tipo === 'toast') {
        el.style.opacity = v;
        el.style.transform = `translateY(${(1 - out(entra)) * 8 + sai * -6}px) scale(${0.9 + 0.1 * back(entra)})`;
      } else if (tipo === 'balao') {
        el.style.opacity = out(v);
        const lado = el.classList.contains('eu') ? 1 : -1;
        el.style.transform = `translate(${(1 - out(entra)) * 16 * lado}px, ${(1 - out(entra)) * 10}px) scale(${0.9 + 0.1 * back(entra)})`;
        el.style.transformOrigin = lado > 0 ? '100% 100%' : '0 100%';
      } else if (tipo === 'ok' || tipo === 'pop') {
        el.style.opacity = clamp(v * 1.4);
        el.style.transform = `scale(${0.7 + 0.3 * back(entra)})`;
        el.style.transformOrigin = '0 50%';
      } else if (tipo === 'lado') {
        // página nova empurra a anterior, opaca, como no celular
        el.style.opacity = sai > 0 ? 1 - sai : 1;
        el.style.transform = `translateX(${(1 - out(entra)) * 100}%)`;
      } else if (tipo === 'painel') {
        // painel do Helpy que entra pela direita ao lado da tela da Meta
        el.style.opacity = clamp(v * 1.6);
        el.style.transform = `translateX(${(1 - out(entra)) * 70 + sai * 40}px)`;
      } else {
        el.style.opacity = out(v);
        el.style.transform = `translateY(${(1 - out(entra)) * 14}px)`;
      }
    });
    // digitação: letra por letra, com o cursor de texto piscando
    c.querySelectorAll('[data-digita]').forEach((el) => {
      const [a, b] = faixa(el.dataset.t);
      const k = clamp((t - a) / (b - a));
      el.textContent = el.dataset.digita.slice(0, Math.round(k * el.dataset.digita.length));
      const ativo = t >= a - 0.25 && t < b + 0.9;
      el.classList.toggle('caret', ativo);
      el.classList.toggle('apagado', ativo && t > b && Math.floor((t - b) * 2.4) % 2 === 1);
      const input = el.closest('.input');
      if (input) input.classList.toggle('foco', ativo);
    });
    c.querySelectorAll('[data-foco]').forEach((el) => { const [a, b] = faixa(el.dataset.foco); if (t >= a && t < b) el.classList.add('foco'); });
    c.querySelectorAll('[data-aperta]').forEach((el) => {
      const a = Number(el.dataset.aperta);
      const k = clamp((t - a + 0.06) / 0.3);
      const s = k > 0 && k < 1 ? 1 - 0.07 * Math.sin(k * Math.PI) : 1;
      el.style.transform = `scale(${s})`;
      el.style.filter = k > 0 && k < 1 ? `brightness(${1 - 0.1 * Math.sin(k * Math.PI)})` : '';
    });
    c.querySelectorAll('[data-check]').forEach((el) => {
      const a = Number(el.dataset.check);
      el.classList.toggle('on', t >= a);
      if (el.classList.contains('chave')) {
        // a bolinha da chave desliza e a cor passa aos poucos
        el.style.setProperty('--k', t < a ? 0 : clamp(back(clamp((t - a) / 0.22)), 0, 1.08));
      } else {
        const k = clamp((t - a) / 0.3);
        el.style.transform = k > 0 && k < 1 ? `scale(${0.85 + 0.15 * back(k)})` : '';
      }
    });
    c.querySelectorAll('[data-marca]').forEach((el) => el.classList.toggle('marcada', t >= Number(el.dataset.marca)));
    c.querySelectorAll('[data-realce]').forEach((el) => { const [a, b] = faixa(el.dataset.realce); el.classList.toggle('realce', t >= a && t < b); });
    c.querySelectorAll('.digitando i').forEach((el, i) => { el.style.transform = `translateY(${Math.sin(t * 9 - i * 0.9) * 2.5}px)`; });

    // legenda
    const leg = c.querySelector('.legenda');
    if (leg) {
      const n = leg.querySelector('.passo-n');
      const h = leg.querySelector('h3');
      const p = leg.querySelector('p');
      const kn = clamp((t - 0.15) / 0.45);
      if (n) { n.style.transform = `scale(${0.4 + 0.6 * back(kn)}) rotate(${(1 - out(kn)) * -12}deg)`; n.style.opacity = clamp(kn * 2); }
      const kh = clamp((t - 0.28) / 0.5);
      if (h) { h.style.opacity = out(kh); h.style.transform = `translateY(${(1 - out(kh)) * 16}px)`; }
      const kp = clamp((t - 0.45) / 0.55);
      if (p) { p.style.opacity = out(kp); p.style.transform = `translateY(${(1 - out(kp)) * 12}px)`; }
    }

    // câmera: aproxima de onde está a ação, sem pressa
    const cam = c.querySelector('.camera');
    if (cam) {
      const roteiro = json(c.dataset.cam) ?? [[0, 1, null]];
      cam.style.transform = 'none';
      const cache = c._foco || (c._foco = new Map());
      const base = cam.getBoundingClientRect();
      const foco = (sel) => {
        if (!sel) return [640, 290];
        const r = c.querySelector(sel)?.getBoundingClientRect();
        if (!r || (!r.width && !r.height)) return cache.get(sel) ?? [640, 290];
        const p = [r.left - base.left + r.width / 2, r.top - base.top + r.height / 2];
        cache.set(sel, p);
        return p;
      };
      let z = roteiro[0][1];
      let f = foco(roteiro[0][2]);
      for (let k = 1; k < roteiro.length; k++) {
        const [tk, zk, sk] = roteiro[k];
        if (t < tk) break;
        const e = seno((t - tk) / 1.3);
        const fk = foco(sk);
        z = z + (zk - z) * e;
        f = [f[0] + (fk[0] - f[0]) * e, f[1] + (fk[1] - f[1]) * e];
      }
      const zz = z * (1 + 0.012 * (t / dur));
      // zoom em volta do foco, puxando o foco só um pouco para o meio
      const puxa = clamp((zz - 1) * 1.2, 0, 0.3);
      let tx = f[0] * (1 - zz) + (640 - f[0]) * puxa;
      let ty = f[1] * (1 - zz) + (270 - f[1]) * puxa;
      // janela: nunca mostra fundo de um lado enquanto corta conteúdo do outro, e o topo não foge
      if (cam.querySelector(':scope > .janela')) {
        const lo = 1280 - 1210 * zz;
        const hi = -70 * zz;
        const a = 16 - 70 * zz;
        const b = 1264 - 1210 * zz;
        tx = lo <= hi ? Math.min(hi, Math.max(lo, tx)) : (a <= b ? Math.min(b, Math.max(a, tx)) : 640 - 640 * zz);
        ty = Math.max(ty, 12 - 34 * zz);
      }
      cam.style.transform = `translate(${tx}px, ${ty}px) scale(${zz})`;
    }
  }

  // ---------- quadro ----------
  window.render = (T) => {
    blobs[0].style.transform = `translate(${-120 + Math.sin(T * 0.21) * 80}px, ${-160 + Math.cos(T * 0.17) * 60}px)`;
    blobs[1].style.transform = `translate(${900 + Math.cos(T * 0.19) * 90}px, ${380 + Math.sin(T * 0.23) * 70}px)`;
    blobs[2].style.transform = `translate(${420 + Math.sin(T * 0.13) * 140}px, ${520 + Math.cos(T * 0.11) * 40}px)`;

    let principal = 0;
    let pesoMax = -1;
    const pesos = [];
    cenas.forEach((c, k) => {
      const S = ini[k];
      const E = fimDe(k);
      const entra = k === 0 ? 1 : clamp((T - (S - TR / 2)) / TR);
      const sai = k === cenas.length - 1 ? 0 : clamp((T - (E - TR / 2)) / TR);
      const w = entra * (1 - sai);
      pesos[k] = w;
      if (w <= 0.001) { c.classList.remove('viva'); c.style.opacity = 0; return; }
      c.classList.add('viva');
      const t = clamp(T - S, 0, Number(c.dataset.dur));
      estado(c, t, Number(c.dataset.dur));
      // a cena nova entra por cima e fica opaca cedo; a antiga só some depois de coberta
      const ei = io(entra);
      const es = io(sai);
      c.style.zIndex = String(k + 1);
      const opEntra = k === 0 ? 1 : clamp(entra / 0.45);
      const opSai = k === cenas.length - 1 ? 1 : 1 - clamp((sai - 0.4) / 0.45);
      c.style.opacity = Math.min(opEntra, opSai);
      const dx = (1 - ei) * 40 - es * 20;
      // última cena: um empurrão lento nos 3 s finais, para o cartão não ficar morto
      const fim = k === cenas.length - 1 ? 0.02 * clamp((T - (soma - 3)) / 3) : 0;
      const sc = 1 + (1 - ei) * 0.012 + fim;
      c.style.transform = `translateX(${dx}px) scale(${sc})`;
      if (w > pesoMax) { pesoMax = w; principal = k; }
    });

    // progresso
    const passoAtual = cenas[principal].dataset.passo;
    passos.forEach((p, i) => {
      const k = passos.indexOf(passoAtual);
      let v = 0;
      if (passoAtual == null) v = principal === cenas.length - 1 ? 1 : 0;
      else if (i < k) v = 1;
      else if (i === k) v = clamp((T - ini[principal]) / Number(cenas[principal].dataset.dur));
      barras[i].style.transform = `scaleX(${v})`;
    });
    prog.style.opacity = principal === 0 ? clamp((T - ini[0] - Number(cenas[0].dataset.dur) + 1) / 0.8) : 1;

    // cursor: visível pela soma dos pesos das cenas com cursor (não pisca na troca de cena)
    let vis = 0;
    let toque = 0;
    cenas.forEach((c, k) => {
      if (!c.dataset.cursor) return;
      if (c.dataset.toque != null) toque += pesos[k];
      else vis += pesos[k];
    });
    vis = clamp(vis);
    toque = clamp(toque);
    let x = ultimo[0];
    let y = ultimo[1];
    let aperto = 1;
    if (kfs.length) {
      let i = kfs.findIndex((kf) => kf.T > T);
      if (i === -1) i = kfs.length;
      const prox = kfs[i];
      const ant = kfs[i - 1];
      const pa = ant ? alvo(ant, T) : INICIO;
      if (prox) {
        const pb = alvo(prox, T);
        const dist = Math.hypot(pb[0] - pa[0], pb[1] - pa[1]);
        const dur = clamp(0.45 + dist / 900, 0.55, 1.15);
        const chega = prox.T - (prox.clica ? 0.1 : 0); // assenta antes de clicar
        let comeca = Math.max(ant ? ant.T + 0.2 : chega - dur, chega - dur);
        if (chega - comeca < 0.15) comeca = chega - 0.15;
        const e = mj(clamp((T - comeca) / (chega - comeca)));
        // leve arco
        const nx = -(pb[1] - pa[1]);
        const ny = pb[0] - pa[0];
        const arco = Math.sin(Math.PI * e) * 0.035;
        x = pa[0] + (pb[0] - pa[0]) * e + nx * arco;
        y = pa[1] + (pb[1] - pa[1]) * e + ny * arco;
      } else { x = pa[0]; y = pa[1]; }
      const clicado = kfs.filter((kf) => kf.clica && T >= kf.T - 0.08 && T < kf.T + 0.6).pop();
      if (clicado) {
        const k = (T - clicado.T + 0.08) / 0.2;
        aperto = k > 0 && k < 1 ? 1 - 0.18 * Math.sin(k * Math.PI) : 1;
        const kr = clamp((T - clicado.T) / 0.55);
        const [rx, ry] = alvo(clicado, T);
        ripple.style.transform = `translate(${rx}px, ${ry}px) scale(${0.3 + 1.1 * out(kr)})`;
        ripple.style.opacity = T >= clicado.T ? (1 - kr) * Math.max(vis, toque) : 0;
      } else ripple.style.opacity = 0;
    }
    ultimo = [x, y];
    cursor.style.opacity = vis;
    // a ponta da seta (5,3 no desenho de 24, 30 px na tela) cai exatamente no alvo
    cursor.style.transform = `translate(${x - 6.25}px, ${y - 3.75}px) scale(${aperto})`;
    dedo.style.opacity = toque * 0.9;
    dedo.style.transform = `translate(${x}px, ${y}px) scale(${aperto})`;
  };

  // ---------- sons ----------
  const ev = [];
  cenas.forEach((c, k) => {
    const S = ini[k];
    if (k > 0) ev.push({ t: S - TR / 2, tipo: 'whoosh' });
    if (c.querySelector('.legenda .passo-n')) ev.push({ t: S + 0.2, tipo: 'passo' });
    c.querySelectorAll('[data-digita]').forEach((el) => {
      const [a, b] = faixa(el.dataset.t);
      const n = el.dataset.digita.replace(/\s/g, '').length;
      if (n / (b - a) > 28 || el.dataset.cola != null) ev.push({ t: S + a, tipo: 'cola' });
      else {
        // no máximo 12 teclas por segundo: rajadas cansam
        const m = Math.min(n, Math.max(1, Math.round((b - a) * 12)));
        for (let i = 0; i < m; i++) ev.push({ t: S + a + ((i + 0.5) * (b - a)) / m, tipo: 'tecla' });
      }
    });
    c.querySelectorAll('[data-on]').forEach((el) => {
      if (el.dataset.som === 'nao') return;
      const t = S + Number(el.dataset.on);
      if (el.classList.contains('ok')) ev.push({ t, tipo: 'sucesso' });
      else if (el.classList.contains('balao') && el.classList.contains('eu')) ev.push({ t, tipo: 'envia' });
      else if (el.classList.contains('balao') && el.classList.contains('ela')) ev.push({ t, tipo: 'recebe' });
      else if (el.classList.contains('balao')) return;
      else if (el.classList.contains('modal')) ev.push({ t, tipo: 'abre' });
      else if (Number(el.dataset.on) > 0.05 || k === 0) ev.push({ t, tipo: 'pop' });
    });
    c.querySelectorAll('.chave[data-check]').forEach((el) => ev.push({ t: S + Number(el.dataset.check), tipo: 'toggle' }));
  });
  for (const kf of kfs) if (kf.clica) ev.push({ t: kf.T, tipo: 'clique' });
  ev.push({ t: ini[cenas.length - 1] + 0.3, tipo: 'final' });
  ev.sort((a, b) => a.t - b.t);
  // uma ação, um som: clique junto de toggle vira só o toggle; pops grudados viram um
  const limpo = [];
  for (const e of ev) {
    const perto = (tipo, ms) => limpo.some((o) => o.tipo === tipo && Math.abs(o.t - e.t) < ms / 1000);
    if (e.tipo === 'clique' && ev.some((o) => o.tipo === 'toggle' && Math.abs(o.t - e.t) < 0.06)) continue;
    if (e.tipo === 'pop' && (perto('pop', 120) || perto('sucesso', 120) || perto('abre', 120))) continue;
    limpo.push(e);
  }
  window.EVENTOS = limpo;

  window.render(0);
})();
