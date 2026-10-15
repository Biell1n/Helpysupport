import { useEffect, useRef } from 'react';
import { CONJUNTO, CORES, LETRAS, NOME, OLHOS, senha } from '@/components/marcaDesenho';

const CORPO = senha();
const quieto = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * Os olhos acompanham o mouse (ou o dedo) e piscam de vez em quando.
 * Mexe direto nos atributos do SVG, sem re-renderizar o React a cada movimento.
 */
function useOlhar(ref, ligado) {
  useEffect(() => {
    const svg = ref.current;
    if (!svg || !ligado || quieto()) return undefined;
    const olhos = [...svg.querySelectorAll('.marca-olho')];
    let alvo = { x: 0, y: 0 };
    let atual = { x: 0, y: 0 };
    let piscando = 0;
    let quadro = 0;
    let proxPiscada = performance.now() + 2500 + Math.random() * 3000;

    const mover = (e) => {
      const r = svg.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height * 0.46);
      const dist = Math.hypot(dx, dy) || 1;
      // perto ele olha de leve; longe, até o limite do rosto
      const forca = Math.min(1, dist / 260);
      alvo = { x: (dx / dist) * 9 * forca, y: (dy / dist) * 7 * forca };
    };

    const passo = (agora) => {
      atual = { x: atual.x + (alvo.x - atual.x) * 0.16, y: atual.y + (alvo.y - atual.y) * 0.16 };
      if (agora > proxPiscada) {
        piscando = agora;
        proxPiscada = agora + 3200 + Math.random() * 4200;
      }
      const p = (agora - piscando) / 160; // piscada: fecha e abre em 160 ms
      const fecha = p >= 0 && p <= 1 ? Math.sin(Math.PI * p) : 0;
      olhos.forEach((el, i) => {
        const o = OLHOS[i];
        const h = o.h * (1 - 0.86 * fecha);
        el.setAttribute('x', o.cx - o.w / 2 + atual.x);
        el.setAttribute('y', o.cy - h / 2 + atual.y);
        el.setAttribute('height', h);
      });
      quadro = requestAnimationFrame(passo);
    };

    window.addEventListener('pointermove', mover, { passive: true });
    quadro = requestAnimationFrame(passo);
    return () => {
      window.removeEventListener('pointermove', mover);
      cancelAnimationFrame(quadro);
    };
  }, [ref, ligado]);
}

/**
 * A marca: o balão-senha, um balão de conversa com os picotes da senha de
 * atendimento e dois olhinhos que acompanham quem está na página.
 */
export function Marca({ size = 32, olhar = true }) {
  const ref = useRef(null);
  useOlhar(ref, olhar);
  return (
    <svg ref={ref} className="marca" width={size} height={size} viewBox="0 0 200 200" aria-hidden="true">
      <path d={CORPO} fill={CORES.azul} />
      {OLHOS.map((o) => (
        <rect key={o.cx} className="marca-olho" x={o.cx - o.w / 2} y={o.cy - o.h / 2} width={o.w} height={o.h} rx={o.w / 2} fill={CORES.branco} />
      ))}
    </svg>
  );
}

/** O nome "helpy" desenhado em vetor, na mesma proporção do conjunto da marca. */
export function Nome({ size = 30, tom = 'escuro', className = 'logo-word' }) {
  const { escala } = CONJUNTO;
  const px = (u) => (u * escala * size) / 200; // unidades do nome → pixels
  return (
    <svg
      className={className}
      width={px(NOME.largura)}
      height={px(NOME.topo + NOME.base)}
      viewBox={`0 ${-NOME.topo} ${NOME.largura} ${NOME.topo + NOME.base}`}
      aria-hidden="true"
    >
      <g fill={tom === 'claro' ? CORES.branco : CORES.marinho}>
        {LETRAS.map((l) => <path key={l.x} d={l.d} transform={`translate(${l.x} 0)`} />)}
      </g>
    </svg>
  );
}

export default function Logo({ size = 30, tom = 'escuro', olhar = true }) {
  const { escala, vao, linhaBase } = CONJUNTO;
  // o nome fica alinhado pela linha de base do conjunto, não pelo centro
  const topoNome = ((linhaBase - NOME.topo * escala) * size) / 200;
  return (
    <span className="row" style={{ gap: (vao * size) / 200, alignItems: 'flex-start' }} role="img" aria-label="helpy">
      <Marca size={size} olhar={olhar} />
      <span style={{ display: 'block', marginTop: topoNome, lineHeight: 0 }}>
        <Nome size={size} tom={tom} />
      </span>
    </span>
  );
}
