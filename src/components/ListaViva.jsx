// Lista em que os itens novos entram de cima com uma mola e os que saem
// encolhem; os demais deslizam para o lugar novo.
// Adaptado do Animated List do Unlumen UI (Léo Wicki, licença MIT), via 21st.dev.
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';

const MOLA = { type: 'spring', stiffness: 350, damping: 28 };

export default function ListaViva({ itens, chave = (i) => i.id, render, className = '', gap = 8 }) {
  const quieto = useReducedMotion();
  return (
    <div className={className} style={{ display: 'flex', flexDirection: 'column', gap }}>
      <AnimatePresence mode="popLayout" initial={false}>
        {itens.map((item, i) => (
          <motion.div
            key={chave(item)}
            layout={!quieto}
            initial={quieto ? false : { opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={quieto ? { opacity: 0 } : { opacity: 0, scale: 0.9 }}
            transition={{ ...MOLA, layout: MOLA }}
          >
            {render(item, i)}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
