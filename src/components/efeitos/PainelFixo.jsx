// Seção em que o texto rola e o painel ao lado fica preso, trocando a tela
// a cada passo. No celular vira uma lista simples com a tela de cada passo.
// Mesmo padrão do Sticky Scroll Reveal (Aceternity UI), feito com motion.
import { useRef, useState } from 'react';
import { AnimatePresence, motion, useMotionValueEvent, useScroll } from 'motion/react';

export default function PainelFixo({ passos, renderTela }) {
  const ref = useRef(null);
  const [ativo, setAtivo] = useState(0);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start center', 'end center'] });
  useMotionValueEvent(scrollYProgress, 'change', (p) => {
    const i = Math.min(passos.length - 1, Math.max(0, Math.floor(p * passos.length)));
    if (i !== ativo) setAtivo(i);
  });
  return (
    <div ref={ref} className="pfixo">
      <div className="pfixo-textos">
        {passos.map((p, i) => (
          <div key={p.titulo} className="pfixo-passo" data-ativo={i === ativo || undefined}>
            <span className="pfixo-n">{String(i + 1).padStart(2, '0')}</span>
            <h3>{p.titulo}</h3>
            <p>{p.texto}</p>
            <div className="pfixo-tela-celular">{renderTela(p, i)}</div>
          </div>
        ))}
      </div>
      <div className="pfixo-lado" aria-hidden="true">
        <div className="pfixo-painel">
          <div className="pfixo-barra"><i /><i /><i /><span>{passos[ativo].titulo}</span></div>
          <AnimatePresence mode="wait">
            <motion.div
              key={ativo}
              className="pfixo-conteudo"
              initial={{ opacity: 0, y: 18, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -18, scale: 0.98 }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            >
              {renderTela(passos[ativo], ativo)}
            </motion.div>
          </AnimatePresence>
          <div className="pfixo-pontos">{passos.map((p, i) => <i key={p.titulo} data-ativo={i === ativo || undefined} />)}</div>
        </div>
      </div>
    </div>
  );
}
