import { balaoEm, CONJUNTO, CONTORNO, CORES, LETRAS, NOME, OLHOS_CONTORNO } from '@/components/marcaDesenho';

/**
 * A marca: um balão de conversa (em contorno) com dois olhinhos. Quem
 * atende está ali, ouvindo. Azul tanto em fundo claro quanto escuro.
 */
export function Marca({ size = 32 }) {
  const { x, s, rc, traco } = CONTORNO;
  return (
    <svg width={size} height={size} viewBox="0 0 200 200" aria-hidden="true">
      <path d={balaoEm(x, s, rc)} fill="none" stroke={CORES.azul} strokeWidth={traco} />
      {OLHOS_CONTORNO.map((o) => (
        <rect key={o.cx} x={o.cx - o.w / 2} y={o.cy - o.h / 2} width={o.w} height={o.h} rx={o.w / 2} fill={CORES.azul} />
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

export default function Logo({ size = 30, tom = 'escuro' }) {
  const { escala, vao, linhaBase } = CONJUNTO;
  // o nome fica alinhado pela linha de base do conjunto, não pelo centro
  const topoNome = ((linhaBase - NOME.topo * escala) * size) / 200;
  return (
    <span className="row" style={{ gap: (vao * size) / 200, alignItems: 'flex-start' }} role="img" aria-label="helpy">
      <Marca size={size} />
      <span style={{ display: 'block', marginTop: topoNome, lineHeight: 0 }}>
        <Nome size={size} tom={tom} />
      </span>
    </span>
  );
}
