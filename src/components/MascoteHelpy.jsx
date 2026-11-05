// O personagem da página inicial é o "y" da marca: uma pessoa de braços levantados.
// Balança como quem acena, a cabeça acompanha o mouse (pelas variáveis --mx/--my
// que a seção já calcula) e um toque faz ela pular. Tudo em vetor: nítido e leve.
import { useState } from 'react';
import { CORES } from '@/components/marcaDesenho';
import { PESSOA, TRACO } from '@/components/MarcaHelpy';

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
    <div className={`mascote ${className}`} role="img" aria-label="O Helpy: o y de braços levantados, acenando" onPointerDown={() => setPulo((n) => n + 1)}>
      <span className="mascote-sombra" aria-hidden="true" />
      <Balaozinho className="mascote-bolha mascote-bolha-a" />
      <Balaozinho className="mascote-bolha mascote-bolha-b" />
      <div className="mascote-flutua" aria-hidden="true">
        <div className="mascote-pula" key={pulo} data-pulou={pulo > 0 || undefined}>
          <svg className="mascote-simbolo mascote-pessoa" viewBox="396 -166 140 244">
            <path d={PESSOA.corpo} fill="none" stroke="#1E4FE6" strokeWidth={TRACO} strokeLinecap="round" strokeLinejoin="round" />
            <circle className="mascote-cabeca" {...PESSOA.cabeca} fill="#1E4FE6" />
          </svg>
        </div>
      </div>
    </div>
  );
}
