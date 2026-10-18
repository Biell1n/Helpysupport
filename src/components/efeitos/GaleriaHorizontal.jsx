// A página rola para baixo e a fila de cartões anda para o lado.
// Mesmo padrão do Scroll Horizontal Gallery dos exemplos do Motion (motion.dev),
// com a seção presa enquanto a fila passa. No celular vira rolagem lateral comum.
import { useLayoutEffect, useRef, useState } from 'react';
import { motion, useScroll, useTransform } from 'motion/react';

export default function GaleriaHorizontal({ children, cabecalho }) {
  const alvo = useRef(null);
  const trilho = useRef(null);
  const [distancia, setDistancia] = useState(0);
  useLayoutEffect(() => {
    const medir = () => {
      const t = trilho.current;
      if (t) setDistancia(Math.max(0, t.scrollWidth - window.innerWidth + 48));
    };
    medir();
    window.addEventListener('resize', medir);
    return () => window.removeEventListener('resize', medir);
  }, []);
  const { scrollYProgress } = useScroll({ target: alvo, offset: ['start start', 'end end'] });
  const x = useTransform(scrollYProgress, [0, 1], [0, -distancia]);
  return (
    <section ref={alvo} className="ghoriz" style={{ '--altura': `calc(100vh + ${distancia}px)` }}>
      <div className="ghoriz-preso">
        {cabecalho}
        <motion.div ref={trilho} className="ghoriz-trilho" style={{ x }}>
          {children}
        </motion.div>
      </div>
    </section>
  );
}
