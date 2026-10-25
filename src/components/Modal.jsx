import { useEffect } from 'react';
import HoldButton from '@/components/HoldButton';

export function Modal({ aberto, onFechar, children, largura }) {
  useEffect(() => {
    if (!aberto) return;
    const esc = (e) => e.key === 'Escape' && onFechar?.();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [aberto, onFechar]);

  if (!aberto) return null;
  return (
    <div className="backdrop" onMouseDown={(e) => e.target === e.currentTarget && onFechar?.()}>
      <div className="modal" role="dialog" aria-modal="true" style={largura ? { width: `min(${largura}px, 100%)` } : undefined}>
        {children}
      </div>
    </div>
  );
}

export function Drawer({ aberto, onFechar, titulo, sub, children, rodape }) {
  useEffect(() => {
    if (!aberto) return;
    const esc = (e) => e.key === 'Escape' && onFechar?.();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [aberto, onFechar]);

  if (!aberto) return null;
  return (
    <div className="backdrop backdrop-drawer" onMouseDown={(e) => e.target === e.currentTarget && onFechar?.()}>
      <aside className="drawer" role="dialog" aria-modal="true" aria-label={titulo}>
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
