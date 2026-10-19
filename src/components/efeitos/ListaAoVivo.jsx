// Lista em que os itens chegam um de cada vez, o mais novo por cima.
// Adaptado do Animated List do Magic UI (magicui.design, MIT).
// Só começa quando aparece na tela e, depois do último, recomeça.
import { Children, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useInView } from 'motion/react';

export default function ListaAoVivo({ children, intervalo = 1400, pausa = 5000, className = '' }) {
  const ref = useRef(null);
  const visivel = useInView(ref, { amount: 0.4 });
  const itens = useMemo(() => Children.toArray(children), [children]);
  const [indice, setIndice] = useState(-1);

  useEffect(() => {
    if (!visivel) return undefined;
    const ultimo = indice >= itens.length - 1;
    const t = setTimeout(() => setIndice(ultimo ? -1 : indice + 1), ultimo ? pausa : indice < 0 ? 500 : intervalo);
    return () => clearTimeout(t);
  }, [visivel, indice, itens.length, intervalo, pausa]);

  const mostrar = itens.slice(0, indice + 1).reverse();

  return (
    <div ref={ref} className={className}>
      <AnimatePresence initial={false}>
        {mostrar.map((item) => (
          <motion.div
            key={item.key}
            layout
            initial={{ scale: 0.6, opacity: 0, y: -12 }}
            animate={{ scale: 1, opacity: 1, y: 0, originY: 0 }}
            exit={{ scale: 0.8, opacity: 0, transition: { duration: 0.25 } }}
            transition={{ type: 'spring', stiffness: 350, damping: 40 }}
          >
            {item}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
