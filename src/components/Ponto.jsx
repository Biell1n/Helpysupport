// O Ponto: o mascote do Helpy é uma lojinha de toldo listrado que nunca fecha.
// Desenhado em vetor, em partes (toldo, corpo, olhos, braços, pés, luz) para
// animar só com CSS: respira, acena, pisca, a luz do toldo pulsa e os olhos
// seguem o mouse pelas variáveis --mx/--my que a seção já calcula.
import { useState } from 'react';

const AZUL = '#1E4FE6';
const CREME = '#FBF7EF';
const TINTA = '#0E1B3D';
const LINHA = 6;

// toldo: borda de cima estreita, de baixo larga, e 5 listras com a ponta em meia-lua
const TOPO = { y: 52, x0: 66, x1: 174 };
const BASE = { y: 98, x0: 36, x1: 204 };
const LISTRAS = 5;
const xTopo = (k) => TOPO.x0 + ((TOPO.x1 - TOPO.x0) * k) / LISTRAS;
const xBase = (k) => BASE.x0 + ((BASE.x1 - BASE.x0) * k) / LISTRAS;
const R = (BASE.x1 - BASE.x0) / LISTRAS / 2;

function listra(k) {
  return `M${xTopo(k)} ${TOPO.y}L${xTopo(k + 1)} ${TOPO.y}L${xBase(k + 1)} ${BASE.y}A${R} ${R} 0 0 1 ${xBase(k)} ${BASE.y}Z`;
}

// contorno do toldo inteiro: em cima, desce pela direita, meias-luas da direita para a esquerda, sobe pela esquerda
const CONTORNO = [
  `M${TOPO.x0 + 8} ${TOPO.y}L${TOPO.x1 - 8} ${TOPO.y}Q${TOPO.x1} ${TOPO.y} ${TOPO.x1 + 4} ${TOPO.y + 6}L${BASE.x1} ${BASE.y}`,
  ...Array.from({ length: LISTRAS }, (_, i) => `A${R} ${R} 0 0 1 ${xBase(LISTRAS - 1 - i)} ${BASE.y}`),
  `L${TOPO.x0 - 4} ${TOPO.y + 6}Q${TOPO.x0} ${TOPO.y} ${TOPO.x0 + 8} ${TOPO.y}Z`,
].join('');

/** Mão de luva: palma redonda com o polegarzinho de lado. */
function Mao({ x, y, lado = 1 }) {
  return (
    <g transform={`translate(${x} ${y})`} fill={CREME} stroke={TINTA} strokeWidth={LINHA}>
      <circle cx={-9 * lado} cy={-5} r={5.5} />
      <circle r={12.5} />
    </g>
  );
}

/** Braço: um tubo azul de contorno escuro, do ombro até a mão. */
function Braco({ d }) {
  return (
    <g fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} stroke={TINTA} strokeWidth={20} />
      <path d={d} stroke={AZUL} strokeWidth={20 - LINHA * 2} />
    </g>
  );
}

export default function Ponto({ className = '', titulo = 'Ponto, o mascote do Helpy: uma lojinha de toldo azul acenando' }) {
  // um toque e ele comemora
  const [festa, setFesta] = useState(0);
  return (
    <div
      className={`ponto ${className}`}
      role="img"
      aria-label={titulo}
      data-festa={festa > 0 || undefined}
      onPointerDown={() => setFesta((n) => n + 1)}
    >
      <svg key={festa} viewBox="0 0 240 240" className="ponto-svg" aria-hidden="true">
        <ellipse className="ponto-sombra" cx="120" cy="228" rx="62" ry="7" fill={TINTA} opacity="0.12" />
        <g className="ponto-corpo-todo">
          {/* luz acesa em cima do toldo */}
          <g className="ponto-luz" stroke={TINTA} strokeWidth={LINHA} strokeLinecap="round">
            <path d="M120 14v14" />
            <path d="M92 24l8 10" />
            <path d="M148 24l-8 10" />
          </g>

          {/* braço esquerdo, parado */}
          <g className="ponto-braco-esq">
            <Braco d="M70 150C56 156 50 166 48 176" />
            <Mao x={46} y={184} lado={-1} />
          </g>

          {/* pés */}
          <g className="ponto-pes" fill={AZUL} stroke={TINTA} strokeWidth={LINHA} strokeLinejoin="round">
            <path d="M84 190h22v24a6 6 0 0 1-6 6H80a8 8 0 0 1-8-8 8 8 0 0 1 8-8h4z" />
            <path d="M156 190h-22v24a6 6 0 0 0 6 6h20a8 8 0 0 0 8-8 8 8 0 0 0-8-8h-4z" />
          </g>

          {/* corpo */}
          <rect x="64" y="78" width="112" height="118" rx="20" fill={CREME} stroke={TINTA} strokeWidth={LINHA} />

          {/* olhos: seguem o mouse e piscam */}
          <g className="ponto-olhar">
            <g className="ponto-olhos" fill={TINTA}>
              <rect x="99" y="124" width="11" height="24" rx="5.5" />
              <rect x="130" y="124" width="11" height="24" rx="5.5" />
            </g>
            <g className="ponto-feliz" fill="none" stroke={TINTA} strokeWidth={LINHA} strokeLinecap="round">
              <path d="M97 140q7.5-10 15 0" />
              <path d="M128 140q7.5-10 15 0" />
            </g>
          </g>

          {/* toldo listrado */}
          <g className="ponto-toldo">
            {Array.from({ length: LISTRAS }, (_, k) => (
              <path key={k} d={listra(k)} fill={k % 2 === 0 ? AZUL : CREME} />
            ))}
            <path d={CONTORNO} fill="none" stroke={TINTA} strokeWidth={LINHA} strokeLinejoin="round" />
          </g>

          {/* braço direito, acenando */}
          <g className="ponto-braco-dir">
            <Braco d="M170 148C186 140 194 128 198 114" />
            <Mao x={200} y={104} lado={-1} />
          </g>
        </g>
      </svg>
    </div>
  );
}
