import { useEffect, useId, useRef, useState } from 'react';
import { MoreHorizontal } from 'lucide-react';

/**
 * Ações que não são do dia a dia ficam atrás do "⋯".
 * itens: [{ rotulo, Icone?, onClick?, href?, perigo?, oculto? }]
 */
export default function MenuMais({ itens, rotulo = 'Mais ações', className = '' }) {
  const [aberto, setAberto] = useState(false);
  const raiz = useRef(null);
  const id = useId();
  const visiveis = itens.filter((i) => i && !i.oculto);

  useEffect(() => {
    if (!aberto) return undefined;
    const fora = (e) => raiz.current && !raiz.current.contains(e.target) && setAberto(false);
    const tecla = (e) => {
      if (e.key === 'Escape') {
        setAberto(false);
        raiz.current?.querySelector('button')?.focus();
      }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const opcoes = [...raiz.current.querySelectorAll('[role="menuitem"]')];
        const i = opcoes.indexOf(document.activeElement);
        opcoes[(i + (e.key === 'ArrowDown' ? 1 : -1) + opcoes.length) % opcoes.length]?.focus();
      }
    };
    document.addEventListener('pointerdown', fora);
    document.addEventListener('keydown', tecla);
    raiz.current?.querySelector('[role="menuitem"]')?.focus();
    return () => {
      document.removeEventListener('pointerdown', fora);
      document.removeEventListener('keydown', tecla);
    };
  }, [aberto]);

  if (!visiveis.length) return null;
  return (
    <div className={`menu-mais ${className}`} ref={raiz}>
      <button
        type="button"
        className="btn btn-quiet btn-sm btn-icon"
        aria-label={rotulo}
        aria-haspopup="menu"
        aria-expanded={aberto}
        aria-controls={id}
        onClick={() => setAberto((v) => !v)}
      >
        <MoreHorizontal />
      </button>
      {aberto && (
        <div className="menu-mais-lista" role="menu" id={id}>
          {visiveis.map(({ rotulo: r, Icone, onClick, href, perigo }) => {
            const conteudo = <>{Icone && <Icone aria-hidden="true" />}<span>{r}</span></>;
            return href ? (
              <a key={r} role="menuitem" href={href} target="_blank" rel="noreferrer" data-perigo={perigo || undefined} onClick={() => setAberto(false)}>{conteudo}</a>
            ) : (
              <button key={r} type="button" role="menuitem" data-perigo={perigo || undefined} onClick={() => { setAberto(false); onClick?.(); }}>{conteudo}</button>
            );
          })}
        </div>
      )}
    </div>
  );
}
