// Sugestões de pergunta em chips que entram do meio para as pontas e somem
// quando uma é escolhida. Usadas no começo da conversa do chat público.
// Adaptado do AI Suggestions de Edu Calvo (SmoothUI, via 21st.dev), com motion.
import { useMemo } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';

const MOLA = { type: 'spring', bounce: 0.1, duration: 0.25 };
const ESCALONAR = 0.045;

// distância do meio: os chips são alternativas de mesmo peso, então nascem do centro
const doMeio = (n) => Array.from({ length: n }, (_, i) => Math.abs(i - (n - 1) / 2));

/** sugestoes: [{ id, rotulo }] · onEscolher(sugestao) */
export default function Sugestoes({ sugestoes, rotulo, onEscolher, className = '' }) {
  const parado = useReducedMotion();
  const atrasos = useMemo(() => doMeio(sugestoes.length), [sugestoes.length]);

  return (
    <div className={`sugestoes ${className}`}>
      {rotulo && <p className="sugestoes-rotulo">{rotulo}</p>}
      <ul>
        <AnimatePresence initial>
          {sugestoes.map((s, i) => (
            <motion.li
              key={s.id}
              layout={!parado}
              initial={parado ? false : { opacity: 0, scale: 0.94, y: 6 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={parado ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, scale: 0.94 }}
              transition={parado ? { duration: 0 } : { ...MOLA, delay: (atrasos[i] ?? 0) * ESCALONAR }}
            >
              <motion.button type="button" whileTap={parado ? undefined : { scale: 0.97 }} transition={MOLA} onClick={() => onEscolher?.(s)}>
                {s.rotulo}
              </motion.button>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </div>
  );
}
