// página de exemplo: carrega o botão do assistente indicado em ?a=
(function () {
  var a = new URLSearchParams(location.search).get('a') || '';
  if (!/^[A-Za-z0-9_-]{10,64}$/.test(a)) {
    // aberto sem o assistente: explica como chegar aqui com o botão de verdade
    var aviso = document.createElement('p');
    aviso.textContent = 'Para ver o botão do seu assistente aqui, abra este exemplo pelo painel: Assistentes, menu do assistente, "Colocar no meu site", "Ver como fica".';
    aviso.style.cssText = 'max-width:560px;margin:24px auto;padding:14px 16px;border-radius:12px;background:#fff6db;color:#5c4400;font:15px/1.5 system-ui,sans-serif';
    document.body.insertBefore(aviso, document.body.firstChild);
    return;
  }
  var s = document.createElement('script');
  s.src = '/widget.js';
  s.setAttribute('data-helpy', a);
  document.body.appendChild(s);
})();
