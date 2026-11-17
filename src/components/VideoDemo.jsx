import { useEffect, useRef } from 'react';

// O vídeo de demonstração é gerado por video/render.mjs e fica em public/videos.
// Para usar outro arquivo, defina VITE_VIDEO_DEMO com o endereço dele.
const BASE = import.meta.env.VITE_VIDEO_DEMO || '/videos/helpy-demo';

export const reduzido = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * O vídeo de demonstração do Helpy, sem som e em loop. Só baixa e toca quando
 * chega perto da tela (antes eram uns 3 MB logo ao abrir a página, mesmo sem rolar).
 */
export default function VideoDemo({ className = '', rotulo = 'Demonstração do Helpy' }) {
  const video = useRef(null);
  useEffect(() => {
    const el = video.current;
    if (!el || reduzido()) return undefined;
    if (typeof IntersectionObserver === 'undefined') {
      el.play?.().catch(() => {});
      return undefined;
    }
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) el.play?.().catch(() => {});
      else el.pause?.();
    }, { rootMargin: '200px' });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  const externo = /\.(mp4|webm)$/.test(BASE);
  return (
    <video
      ref={video}
      className={className}
      muted
      loop
      playsInline
      preload="none"
      poster={externo ? undefined : `${BASE}.jpg`}
      aria-label={rotulo}
    >
      {externo ? (
        <source src={BASE} />
      ) : (
        <>
          <source src={`${BASE}.webm`} type="video/webm" />
          <source src={`${BASE}.mp4`} type="video/mp4" />
        </>
      )}
    </video>
  );
}
