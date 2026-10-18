// Grifo que passa por trás das palavras quando o título entra na tela.
// Mesmo efeito do Text Highlight (uiable, via 21st.dev), em CSS.
import { useEffect, useRef, useState } from 'react';

export default function Grifo({ children }) {
  const ref = useRef(null);
  const [visto, setVisto] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return setVisto(true);
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) {
        setVisto(true);
        io.disconnect();
      }
    }, { rootMargin: '0px 0px -20% 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return <span ref={ref} className="grifo" data-visto={visto || undefined}>{children}</span>;
}
