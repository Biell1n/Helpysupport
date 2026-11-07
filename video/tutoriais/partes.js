// Peças repetidas dos roteiros, montadas antes do motor rodar:
//   <div data-barra="developers.facebook.com/apps"></div>      barra do navegador
//   <div data-lateral-helpy></div>                              lateral do painel do Helpy (Canais ativo)
//   <div data-lateral="∞ Meta for Developers;Meus apps*;Ferramentas"></div>  lateral (o * marca o item ativo)
//   <span class="copiar" data-copiar="1.6-3.0"></span>         botão de copiar; o balão "Copiado" aparece nesse intervalo
(() => {
  const LOGO = '<svg viewBox="12 16 176 176" aria-hidden="true"><path d="M62,24 H138 A42,42 0 0 1 180,66 V78 A14,14 0 0 0 180,106 V118 A42,42 0 0 1 138,160 H90 Q72,162 44,186 Q54,168 54,160 H62 A42,42 0 0 1 20,118 V106 A14,14 0 0 0 20,78 V66 A42,42 0 0 1 62,24 Z" fill="#1F66F4"/><rect x="75.5" y="70" width="17" height="44" rx="8.5" fill="#fff"/><rect x="107.5" y="70" width="17" height="44" rx="8.5" fill="#fff"/></svg>';
  window.LOGO_HELPY = LOGO;
  const ICONE = {
    painel: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>',
    atendimentos: '<svg viewBox="0 0 24 24"><path d="M2 9a3 3 0 0 0 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 0 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2z"/><path d="M13 5v2M13 17v2M13 11v2"/></svg>',
    assistentes: '<svg viewBox="0 0 24 24"><path d="M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 18 0v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3"/></svg>',
    dados: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>',
    canais: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="2"/><path d="M16.2 7.8a6 6 0 0 1 0 8.4M7.8 16.2a6 6 0 0 1 0-8.4M19.1 4.9a10 10 0 0 1 0 14.2M4.9 19.1a10 10 0 0 1 0-14.2"/></svg>',
  };
  const COPIA = '<svg viewBox="0 0 24 24" fill="none" stroke="#34465b" stroke-width="2"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a1 1 0 0 1 1-1h10"/></svg>';

  for (const el of document.querySelectorAll('[data-barra]')) {
    el.outerHTML = `<div class="barra"><div class="bolinhas"><i></i><i></i><i></i></div><div class="url">${el.dataset.barra}</div></div>`;
  }
  for (const el of document.querySelectorAll('[data-lateral-helpy]')) {
    const ativo = el.dataset.lateralHelpy || 'canais';
    const item = (k, nome) => `<div${k === ativo ? ' class="at"' : ''}>${ICONE[k]}${nome}</div>`;
    el.outerHTML = `<div class="lateral"><b>${LOGO} helpy</b>${item('painel', 'Painel')}<div class="grupo">Atender</div>${item('atendimentos', 'Atendimentos')}<div class="grupo">Assistente</div>${item('assistentes', 'Assistentes')}${item('dados', 'Dados')}${item('canais', 'Canais')}</div>`;
  }
  for (const el of document.querySelectorAll('[data-lateral]')) {
    const [titulo, ...itens] = el.dataset.lateral.split(';');
    const t = titulo.startsWith('∞') ? `<b class="meta-marca"><i>∞</i>${titulo.slice(1).trim()}</b>` : `<b>${titulo}</b>`;
    el.outerHTML = `<div class="lateral">${t}${itens.map((i) => (i.endsWith('*') ? `<div class="at">${i.slice(0, -1)}</div>` : `<div>${i}</div>`)).join('')}</div>`;
  }
  for (const el of document.querySelectorAll('[data-copiar]')) {
    const [a, b] = el.dataset.copiar.split('-');
    el.innerHTML = `${COPIA}<div class="toast" data-on="${a}" data-off="${b}" data-som="nao">Copiado ✓</div>`;
  }
  for (const el of document.querySelectorAll('[data-logo]')) el.innerHTML = LOGO;
})();
