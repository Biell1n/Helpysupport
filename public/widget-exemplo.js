// página de exemplo: carrega o botão do assistente indicado em ?a=
(function () {
  var a = new URLSearchParams(location.search).get('a') || '';
  if (!/^[A-Za-z0-9_-]{10,64}$/.test(a)) return;
  var s = document.createElement('script');
  s.src = '/widget.js';
  s.setAttribute('data-helpy', a);
  document.body.appendChild(s);
})();
