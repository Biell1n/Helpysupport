import { useEffect, useRef, useState } from 'react';

// O vídeo de fundo fica no Storage do Supabase (bucket landing-videos).
// Para trocar, suba outro arquivo com o mesmo nome ou defina VITE_VIDEO_FUNDO.
export const VIDEO =
  import.meta.env.VITE_VIDEO_FUNDO ||
  `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/landing-videos/videofundo.mp4`;

export const reduzido = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Vídeo em tela cheia, sem som, que aparece devagar quando carrega. */
export default function VideoFundo({ className = '' }) {
  const video = useRef(null);
  const [falhou, setFalhou] = useState(false);
  const [pronto, setPronto] = useState(false);
  useEffect(() => {
    if (reduzido()) video.current?.pause();
  }, []);
  return (
    <div className={`lp-video ${className}`} data-pronto={pronto} aria-hidden="true">
      {!falhou && (
        <video
          ref={video}
          src={VIDEO}
          autoPlay={!reduzido()}
          muted
          loop
          playsInline
          preload="auto"
          onCanPlay={() => setPronto(true)}
          onError={() => setFalhou(true)}
        />
      )}
    </div>
  );
}
