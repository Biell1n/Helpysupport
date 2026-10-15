import { useEffect, useRef, useState } from 'react';

// Cloudflare Turnstile: o "não sou um robô" de verdade, grátis e sem quebra-cabeça
// (na maioria das vezes passa sozinho). Só liga quando a chave do site existe;
// a chave secreta fica no Supabase (Authentication → Attack Protection).
const SITE = import.meta.env.VITE_TURNSTILE_SITE_KEY;
export const captchaLigado = Boolean(SITE);

let script;
function carregar() {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  script ??= new Promise((ok, falha) => {
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    s.async = true;
    s.onload = () => ok(window.turnstile);
    s.onerror = () => {
      script = undefined;
      falha(new Error('Não deu para carregar a verificação. Confira sua internet.'));
    };
    document.head.appendChild(s);
  });
  return script;
}

/**
 * A caixinha de verificação. onToken recebe o token (ou null quando expira).
 * O token vale para UMA tentativa: depois de cada envio, mude `rodada` para pedir outro.
 */
export default function Captcha({ onToken, rodada = 0 }) {
  const caixa = useRef(null);
  const id = useRef(null);
  const aviso = useRef(onToken);
  aviso.current = onToken;

  useEffect(() => {
    if (!SITE) return undefined;
    let vivo = true;
    carregar()
      .then((t) => {
        if (!vivo || !caixa.current) return;
        id.current = t.render(caixa.current, {
          sitekey: SITE,
          language: 'pt-br',
          theme: 'light',
          callback: (token) => aviso.current(token),
          'expired-callback': () => aviso.current(null),
          'error-callback': () => aviso.current(null),
        });
      })
      .catch(() => aviso.current(null));
    return () => {
      vivo = false;
      if (id.current != null) window.turnstile?.remove(id.current);
      id.current = null;
    };
  }, []);

  // nova tentativa: o token anterior já foi gasto
  useEffect(() => {
    if (rodada && id.current != null) {
      aviso.current(null);
      window.turnstile?.reset(id.current);
    }
  }, [rodada]);

  if (!SITE) return null;
  return <div ref={caixa} className="captcha" />;
}

/** Estado do captcha numa tela: token atual, se falta, e como pedir outro depois de enviar. */
export function useCaptcha() {
  const [token, setToken] = useState(null);
  const [rodada, setRodada] = useState(0);
  return {
    token,
    falta: captchaLigado && !token,
    // vai junto nas chamadas do Supabase Auth (options.captchaToken)
    extra: token ? { captchaToken: token } : {},
    nova: () => setRodada((r) => r + 1),
    props: { onToken: setToken, rodada },
  };
}
