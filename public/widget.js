/* Helpy · botão de chat para o site da empresa.
   Cole no site, antes de </body>:
   <script src="https://helpysupport.com/widget.js" data-helpy="CODIGO-DO-ASSISTENTE" async></script>
   Opcional: data-cor="#1F66F4" (cor do botão) e data-lado="esquerda". */
(function () {
  var s = document.currentScript;
  if (!s || window.__helpyWidget) return;
  var token = (s.getAttribute('data-helpy') || '').trim();
  if (!/^[A-Za-z0-9_-]{10,64}$/.test(token)) return;
  window.__helpyWidget = true;

  var base = new URL(s.src, location.href).origin;
  var cor = /^#[0-9a-fA-F]{3,8}$/.test(s.getAttribute('data-cor') || '') ? s.getAttribute('data-cor') : '#1F66F4';
  var lado = s.getAttribute('data-lado') === 'esquerda' ? 'left' : 'right';
  var Z = 2147483000;
  var aberto = false;
  var quadro = null;

  var css = document.createElement('style');
  css.textContent =
    '.helpy-w-botao{position:fixed;bottom:20px;' + lado + ':20px;z-index:' + Z + ';width:58px;height:58px;border:0;border-radius:50%;' +
    'background:' + cor + ';color:#fff;cursor:pointer;display:grid;place-items:center;padding:0;' +
    'box-shadow:0 10px 28px rgba(11,26,44,.28),0 2px 6px rgba(11,26,44,.18);transition:transform .45s cubic-bezier(.16,1,.3,1)}' +
    '.helpy-w-botao:hover{transform:scale(1.06)}.helpy-w-botao:active{transform:scale(.94)}' +
    '.helpy-w-botao svg{width:28px;height:28px;transition:transform .45s cubic-bezier(.16,1,.3,1),opacity .2s}' +
    '.helpy-w-botao .helpy-w-x{position:absolute;opacity:0;transform:rotate(-90deg) scale(.6)}' +
    '.helpy-w-botao[aria-expanded=true] .helpy-w-x{opacity:1;transform:none}' +
    '.helpy-w-botao[aria-expanded=true] .helpy-w-balao{opacity:0;transform:rotate(90deg) scale(.6)}' +
    '.helpy-w-painel{position:fixed;bottom:90px;' + lado + ':20px;z-index:' + Z + ';width:384px;max-width:calc(100vw - 24px);' +
    'height:min(640px,calc(100vh - 110px));border-radius:18px;overflow:hidden;background:#fff;' +
    'box-shadow:0 24px 64px rgba(11,26,44,.3),0 4px 14px rgba(11,26,44,.14);' +
    'opacity:0;visibility:hidden;transform:translateY(18px) scale(.96);transform-origin:bottom ' + lado + ';' +
    'transition:opacity .25s ease,transform .5s cubic-bezier(.16,1,.3,1),visibility 0s linear .5s}' +
    '.helpy-w-painel[data-aberto]{opacity:1;visibility:visible;transform:none;transition:opacity .25s ease,transform .5s cubic-bezier(.16,1,.3,1)}' +
    '.helpy-w-painel iframe{width:100%;height:100%;border:0;display:block}' +
    '@media (max-width:520px){.helpy-w-painel{inset:0;width:100%;max-width:none;height:100%;border-radius:0;bottom:0}' +
    '.helpy-w-botao[aria-expanded=true]{bottom:auto;top:10px;width:40px;height:40px;' + lado + ':10px}' +
    '.helpy-w-botao[aria-expanded=true] svg{width:20px;height:20px}}' +
    '@media (prefers-reduced-motion:reduce){.helpy-w-botao,.helpy-w-botao svg,.helpy-w-painel{transition:none!important}}';
  document.head.appendChild(css);

  var botao = document.createElement('button');
  botao.type = 'button';
  botao.className = 'helpy-w-botao';
  botao.setAttribute('aria-label', 'Abrir o atendimento');
  botao.setAttribute('aria-expanded', 'false');
  botao.innerHTML =
    '<svg class="helpy-w-balao" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/><path d="M9 11v2M15 11v2"/></svg>' +
    '<svg class="helpy-w-x" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>';

  var painel = document.createElement('div');
  painel.className = 'helpy-w-painel';
  painel.setAttribute('role', 'dialog');
  painel.setAttribute('aria-label', 'Atendimento');

  function alternar(abrir) {
    aberto = typeof abrir === 'boolean' ? abrir : !aberto;
    if (aberto && !quadro) {
      // o chat só carrega quando a pessoa abre: o site da empresa não fica mais pesado
      quadro = document.createElement('iframe');
      quadro.src = base + '/c/' + token + '?site=1';
      quadro.title = 'Atendimento';
      quadro.setAttribute('allow', 'clipboard-write');
      painel.appendChild(quadro);
    }
    if (aberto) painel.setAttribute('data-aberto', '');
    else painel.removeAttribute('data-aberto');
    botao.setAttribute('aria-expanded', String(aberto));
    botao.setAttribute('aria-label', aberto ? 'Fechar o atendimento' : 'Abrir o atendimento');
  }

  botao.addEventListener('click', function () { alternar(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && aberto) alternar(false); });

  function montar() {
    document.body.appendChild(painel);
    document.body.appendChild(botao);
  }
  if (document.body) montar();
  else document.addEventListener('DOMContentLoaded', montar);
})();
