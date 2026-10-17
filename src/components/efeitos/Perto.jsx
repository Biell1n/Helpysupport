import { Suspense, useEffect, useRef, useState } from 'react';
import { reduzido } from '@/components/VideoDemo';

/**
 * Só monta o efeito quando ele chega perto da tela (e nunca com movimento
 * reduzido): a home abre leve e cada fundo animado carrega na hora certa.
 */
export default function Perto({ children, margem = '300px', className = '', reserva = null, as: Tag = 'div', decorativo = true }) {
  const ref = useRef(null);
  const [perto, setPerto] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || reduzido()) return undefined;
    if (typeof IntersectionObserver === 'undefined') {
      setPerto(true);
      return undefined;
    }
    const io = new IntersectionObserver((es) => {
      if (es.some((e) => e.isIntersecting)) {
        setPerto(true);
        io.disconnect();
      }
    }, { rootMargin: margem });
    io.observe(el);
    return () => io.disconnect();
  }, [margem]);
  return (
    <Tag ref={ref} className={className} aria-hidden={decorativo || undefined}>
      {perto ? <Suspense fallback={reserva}>{children}</Suspense> : reserva}
    </Tag>
  );
}
