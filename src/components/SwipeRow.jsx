import { useEffect, useRef, useState } from 'react';

const LARGURA = 96; // quanto a linha abre para mostrar o botão
const ABRE = 44; // arrastou mais que isso: fica aberta ao soltar

/**
 * Linha que desliza no celular (só com o dedo; no mouse continua um clique normal).
 * Arrastar para a esquerda mostra "direita" (botão à direita); para a direita mostra "esquerda".
 * O botão revelado precisa de um toque para agir: nada acontece sem querer.
 */
export default function SwipeRow({ children, esquerda, direita, aberta, onAbrir }) {
  const [x, setX] = useState(0);
  const [arrastando, setArrastando] = useState(false);
  const inicio = useRef(null);
  const moveu = useRef(false);

  // outra linha abriu (ou a lista mudou): esta fecha
  useEffect(() => {
    if (!aberta) setX(0);
  }, [aberta]);

  const limitar = (v) => Math.max(direita ? -LARGURA : 0, Math.min(esquerda ? LARGURA : 0, v));

  const down = (e) => {
    if (e.pointerType !== 'touch') return;
    inicio.current = { px: e.clientX, py: e.clientY, x, decidido: false, horizontal: false };
    moveu.current = false;
  };

  const move = (e) => {
    const s = inicio.current;
    if (!s) return;
    const dx = e.clientX - s.px;
    const dy = e.clientY - s.py;
    if (!s.decidido) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      s.decidido = true;
      s.horizontal = Math.abs(dx) > Math.abs(dy); // na vertical a lista rola normalmente
      if (s.horizontal) {
        setArrastando(true);
        e.currentTarget.setPointerCapture?.(e.pointerId);
      }
    }
    if (!s.horizontal) return;
    moveu.current = true;
    setX(limitar(s.x + dx));
  };

  const up = () => {
    const s = inicio.current;
    inicio.current = null;
    setArrastando(false);
    if (!s?.horizontal) return;
    const fim = x <= -ABRE ? -LARGURA : x >= ABRE ? LARGURA : 0;
    setX(fim);
    if (fim !== 0) onAbrir?.();
  };

  // depois de arrastar, o "clique" que o navegador dispara não abre o atendimento
  const clique = (e) => {
    if (moveu.current || x !== 0) {
      e.preventDefault();
      e.stopPropagation();
      moveu.current = false;
      setX(0);
    }
  };

  const botao = (acao, lado) =>
    acao && (
      <button
        type="button"
        className={`swipe-acao swipe-acao-${lado}`}
        style={{ background: acao.cor }}
        tabIndex={x === 0 ? -1 : 0}
        onClick={() => {
          setX(0);
          acao.onAcao();
        }}
      >
        {acao.icone}
        <span>{acao.rotulo}</span>
      </button>
    );

  return (
    <div className="swipe">
      {botao(esquerda, 'esquerda')}
      {botao(direita, 'direita')}
      <div
        className="swipe-frente"
        data-arrastando={arrastando || undefined}
        style={{ transform: x ? `translateX(${x}px)` : undefined }}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onClickCapture={clique}
      >
        {children}
      </div>
    </div>
  );
}
