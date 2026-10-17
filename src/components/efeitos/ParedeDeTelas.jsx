// Parede de telas inclinada em 3D: quatro colunas que sobem e descem devagar.
// Adaptado do 3D Marquee de Manu Arora (Aceternity UI, via 21st.dev), com motion.
import { motion, useReducedMotion } from 'motion/react';
import './ParedeDeTelas.css';

// a parede foi pensada para ~32 telas: com menos, as colunas ficam curtas e não chegam ao meio
const CHEIA = 32;

export default function ParedeDeTelas({ telas: lista, className = '' }) {
  const parado = useReducedMotion();
  const telas = Array.from({ length: Math.max(lista.length, CHEIA) }, (_, i) => ({ ...lista[i % lista.length], chave: String(i) }));
  const porColuna = Math.ceil(telas.length / 4);
  const colunas = Array.from({ length: 4 }, (_, i) => telas.slice(i * porColuna, i * porColuna + porColuna));
  return (
    <div className={`parede ${className}`}>
      <div className="parede-palco">
        <div className="parede-escala">
          <div className="parede-grade">
            {colunas.map((col, i) => (
              <motion.div
                key={i}
                className="parede-coluna"
                animate={parado ? undefined : { y: i % 2 === 0 ? 100 : -100 }}
                transition={{ duration: i % 2 === 0 ? 10 : 15, repeat: Infinity, repeatType: 'reverse', ease: 'easeInOut' }}
              >
                <span className="parede-linha-v" />
                {col.map((t) => (
                  <div className="parede-item" key={t.chave}>
                    <span className="parede-linha-h" />
                    <motion.img
                      src={t.src}
                      alt={t.alt}
                      width={970}
                      height={700}
                      decoding="async"
                      whileHover={parado ? undefined : { y: -10 }}
                      transition={{ duration: 0.3, ease: 'easeInOut' }}
                    />
                  </div>
                ))}
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
