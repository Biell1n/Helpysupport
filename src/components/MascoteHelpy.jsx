// O mascote do Helpy é o próprio símbolo: o balão-senha com os olhos em pílula,
// com volume suave (luz por cima, sombra por baixo). Flutua, respira, inclina
// para o lado do mouse e os olhos seguem o cursor e piscam, pelas variáveis
// --mx/--my que a seção já calcula. Tudo em vetor: nítido e leve.
import { useState } from 'react';
import { CORES, OLHOS, senha } from '@/components/marcaDesenho';

const CORPO = senha();

/** Balãozinho branco que flutua em volta (três pontinhos = "digitando"). */
function Balaozinho({ className }) {
  return (
    <svg className={className} viewBox="0 0 64 52" aria-hidden="true">
      <path d="M14 2h36a12 12 0 0 1 12 12v14a12 12 0 0 1-12 12H24l-11 9 2-9h-1A12 12 0 0 1 2 28V14A12 12 0 0 1 14 2Z" fill="#fff" />
      {[20, 32, 44].map((x) => <circle key={x} cx={x} cy="21" r="3.6" fill={CORES.azul} />)}
    </svg>
  );
}

export default function MascoteHelpy({ className = '' }) {
  // um toque faz ele dar um pulinho
  const [pulo, setPulo] = useState(0);
  return (
    <div className={`mascote ${className}`} role="img" aria-label="O Helpy: um balão de conversa azul com dois olhinhos" onPointerDown={() => setPulo((n) => n + 1)}>
      <span className="mascote-sombra" aria-hidden="true" />
      <Balaozinho className="mascote-bolha mascote-bolha-a" />
      <Balaozinho className="mascote-bolha mascote-bolha-b" />
      <div className="mascote-flutua" aria-hidden="true">
        <div className="mascote-pula" key={pulo} data-pulou={pulo > 0 || undefined}>
          <svg className="mascote-simbolo" viewBox="0 0 200 200">
            <defs>
              <linearGradient id="mascote-cor" x1="0" y1="0" x2="0.35" y2="1">
                <stop offset="0" stopColor="#5C93FA" />
                <stop offset="0.45" stopColor={CORES.azul} />
                <stop offset="1" stopColor="#1450C9" />
              </linearGradient>
              <radialGradient id="mascote-luz" cx="0.3" cy="0.18" r="0.55">
                <stop offset="0" stopColor="#fff" stopOpacity="0.5" />
                <stop offset="1" stopColor="#fff" stopOpacity="0" />
              </radialGradient>
              <linearGradient id="mascote-fundo" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0.55" stopColor="#0B1A2C" stopOpacity="0" />
                <stop offset="1" stopColor="#0B1A2C" stopOpacity="0.28" />
              </linearGradient>
              <filter id="mascote-brilho-olho" x="-60%" y="-30%" width="220%" height="160%">
                <feGaussianBlur stdDeviation="2.2" result="b" />
                <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
            </defs>
            <path d={CORPO} fill="url(#mascote-cor)" />
            <path d={CORPO} fill="url(#mascote-fundo)" />
            <path d={CORPO} fill="url(#mascote-luz)" />
            <g className="mascote-olhos" filter="url(#mascote-brilho-olho)">
              {OLHOS.map((o) => (
                <rect key={o.cx} x={o.cx - o.w / 2} y={o.cy - o.h / 2} width={o.w} height={o.h} rx={o.w / 2} fill="#fff" />
              ))}
            </g>
          </svg>
        </div>
      </div>
    </div>
  );
}
