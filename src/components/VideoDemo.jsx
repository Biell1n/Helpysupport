import { useEffect, useRef, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';

// O vídeo de demonstração é gerado por video/render.mjs e fica em public/videos.
// Para usar outro arquivo, defina VITE_VIDEO_DEMO com o endereço dele.
const BASE = import.meta.env.VITE_VIDEO_DEMO || '/videos/helpy-demo';

export const reduzido = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * O vídeo de demonstração do Helpy, em loop. Começa mudo (o navegador não
 * deixa tocar som sozinho); com `som`, um botão liga a narração do começo.
 */
export default function VideoDemo({ className = '', rotulo = 'Demonstração do Helpy', som = false }) {
  const video = useRef(null);
  const [comSom, setComSom] = useState(false);
  const alternarSom = () => {
    const v = video.current;
    if (!v) return;
    if (!comSom) {
      v.muted = false;
      v.currentTime = 0;
      v.play().catch(() => {});
    } else {
      v.muted = true;
    }
    setComSom(!comSom);
  };
  useEffect(() => {
    if (reduzido()) video.current?.pause();
  }, []);
  const externo = /\.(mp4|webm)$/.test(BASE);
  return (
    <>
      <video
        ref={video}
        className={className}
        autoPlay={!reduzido()}
        muted
        loop
        playsInline
        preload="metadata"
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
      {som && (
        <button type="button" className="video-som" onClick={alternarSom} aria-pressed={comSom}>
          {comSom ? <Volume2 aria-hidden="true" /> : <VolumeX aria-hidden="true" />}
          <span>{comSom ? 'Som ligado' : 'Ouvir com narração'}</span>
        </button>
      )}
    </>
  );
}
