// Barra fina no topo que enche conforme a página é lida.
// Adaptado do Scroll Progress do Magic UI (magicui.design, MIT).
import { motion, useScroll, useSpring } from 'motion/react';

export default function BarraDeLeitura() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 220, damping: 40, mass: 0.4 });
  return <motion.div className="barra-leitura" style={{ scaleX }} aria-hidden="true" />;
}
