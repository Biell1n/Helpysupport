import { useEffect } from 'react';
import HoldButton from '@/components/HoldButton';
import { useFocoPreso } from '@/lib/foco';

/** O título (o primeiro h2) vira o nome da janela para o leitor de tela. */
function useNomeDoTitulo(caixa, aberto) {
  useEffect(() => {
    const el = caixa.current;
    const h = el?.querySelector('h1, h2, h3');
    if (!el || !h) return;
    if (!h.id) h.id = `titulo-${Math.random().toString(36).slice(2, 9)}`;
    el.setAttribute('aria-labelledby', h.id);
  });
  return aberto;
}

export function Modal({ aberto, onFechar, children, largura }) {
  const caixa = useFocoPreso(aberto, onFechar);
  useNomeDoTitulo(caixa, aberto);

  if (!aberto) return null;
  return (
    <div className="backdrop" onMouseDown={(e) => e.target === e.currentTarget && onFechar?.()}>
      <div ref={caixa} tabIndex={-1} className="modal" role="dialog" aria-modal="true" style={largura ? { width: `min(${largura}px, 100%)` } : undefined}>
        {onFechar && (
          <button type="button" className="modal-x" aria-label="Fechar" onClick={onFechar}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        )}
        {children}
      </div>
    </div>
  );
}

export function Drawer({ aberto, onFechar, titulo, sub, children, rodape }) {
  const caixa = useFocoPreso(aberto, onFechar);

  if (!aberto) return null;
  return (
    <div className="backdrop backdrop-drawer" onMouseDown={(e) => e.target === e.currentTarget && onFechar?.()}>
      <aside ref={caixa} tabIndex={-1} className="drawer" role="dialog" aria-modal="true" aria-label={titulo}>
        <div className="drawer-head">
          <h2 style={{ fontSize: 22 }}>{titulo}</h2>
          {sub && <p className="muted" style={{ marginTop: 4, fontSize: 14 }}>{sub}</p>}
        </div>
        <div className="drawer-body">{children}</div>
        {rodape && <div className="drawer-foot">{rodape}</div>}
      </aside>
    </div>
  );
}

/** Confirmação para ações que não têm volta. */
/** segurar: a ação só acontece segurando o botão (para o que mexe com dinheiro). */
export function Confirmar({ aberto, titulo, texto, acao = 'Confirmar', perigo, onConfirmar, onFechar, voltar = 'Cancelar', secundaria, segurar }) {
  return (
    <Modal aberto={aberto} onFechar={onFechar}>
      <h2>{titulo}</h2>
      {texto && <p className="muted">{texto}</p>}
      <div className="modal-foot">
        <button type="button" className="btn btn-ghost" onClick={onFechar}>
          {voltar}
        </button>
        {secundaria && (
          <button type="button" className="btn btn-ghost" onClick={secundaria.onClick}>
            {secundaria.rotulo}
          </button>
        )}
        {segurar ? (
          <HoldButton size="sm" radius={6} fillColor={perigo ? '#c8352d' : 'var(--senha)'} doneLabel="Feito" resetAfter={0} onHold={onConfirmar}>
            Segure para {acao.charAt(0).toLowerCase() + acao.slice(1)}
          </HoldButton>
        ) : (
          <button type="button" className={`btn ${perigo ? 'btn-danger' : 'btn-primary'}`} onClick={onConfirmar}>
            {acao}
          </button>
        )}
      </div>
    </Modal>
  );
}
