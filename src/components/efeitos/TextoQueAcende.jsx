// Parágrafo grande em que cada palavra acende conforme a rolagem.
// Adaptado do Text Reveal do Magic UI (magicui.design, MIT).
// Palavras com * na frente (ex.: "*Helpy") acendem na cor da marca.
import { useRef } from 'react';
import { motion, useScroll, useTransform } from 'motion/react';

function Palavra({ children, progresso, faixa, destaque }) {
  const opacity = useTransform(progresso, faixa, [0, 1]);
  return (
    <span className="acende-palavra">
      <span className="acende-sombra">{children}</span>
      <motion.span style={{ opacity }} className={destaque ? 'acende-destaque' : 'acende-luz'}>{children}</motion.span>
    </span>
  );
}

export default function TextoQueAcende({ texto, className = '' }) {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end end'] });
  const palavras = texto.split(' ');
  return (
    <div ref={ref} className={`acende ${className}`}>
      <div className="acende-preso">
        <p className="acende-texto" aria-label={texto.replace(/\*/g, '')}>
          {palavras.map((p, i) => {
            const ini = i / palavras.length;
            return (
              <Palavra key={i} progresso={scrollYProgress} faixa={[ini * 0.9, (ini + 1 / palavras.length) * 0.9]} destaque={p.startsWith('*')}>
                {p.replace(/^\*/, '')}
              </Palavra>
            );
          })}
        </p>
      </div>
    </div>
  );
}
