// Abas com o fundo da aba ativa deslizando até a escolhida.
// Adaptado do Animated Tabs de educalvolpz (21st.dev), com motion.
import { useCallback, useId } from 'react';
import { motion, useReducedMotion } from 'motion/react';

const MOLA = { type: 'spring', bounce: 0.12, duration: 0.32 };

/**
 * abas: [{ id, rotulo, extra? }] · ativa: id · onMudar(id)
 * As setas do teclado, Home e End trocam de aba, como em qualquer lista de abas.
 */
export default function Abas({ abas, ativa, onMudar, rotulo, className = '' }) {
  const id = useId();
  const quieto = useReducedMotion();

  const teclado = useCallback((e, i) => {
    const mapa = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: abas.length - 1 };
    if (!(e.key in mapa)) return;
    e.preventDefault();
    const nova = abas[(mapa[e.key] + abas.length) % abas.length];
    onMudar(nova.id);
    document.getElementById(`${id}-${nova.id}`)?.focus();
  }, [abas, id, onMudar]);

  return (
    <div className={`tabs ${className}`} role="tablist" aria-label={rotulo}>
      {abas.map((a, i) => {
        const sel = a.id === ativa;
        return (
          <button
            key={a.id}
            id={`${id}-${a.id}`}
            type="button"
            role="tab"
            className="tab"
            aria-selected={sel}
            tabIndex={sel ? 0 : -1}
            onClick={() => onMudar(a.id)}
            onKeyDown={(e) => teclado(e, i)}
          >
            {sel && <motion.span className="tab-fundo" layoutId={`aba-${id}`} transition={quieto ? { duration: 0 } : MOLA} />}
            <span className="tab-texto">{a.rotulo}{a.extra}</span>
          </button>
        );
      })}
    </div>
  );
}
