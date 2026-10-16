// Indicador de "pensando": quatro bolinhas que mudam de forma sem parar.
// Pingam em fila, abrem em losango, se juntam no meio, viram um quadrado
// que gira deitado em perspectiva e descem numa escadinha de volta à fila.
import { useEffect, useState } from 'react';
import { reduzido } from '@/components/VideoDemo';
import './BolinhasPensando.css';

// posição de cada bolinha (x, y em px a partir do centro) e escala; null = escondida no meio
const FORMAS = {
  fila: [[-9, 0], [0, 0], [9, 0], null],
  losango: [[-11, 0], [11, 0], [0, -7], [0, 7]],
  meio: [[0, 0, 0.8], [0, 0, 0.8], [0, 0, 0.8], [0, 0, 0.8]],
  quadrado: [[-6, -6], [6, -6], [6, 6], [-6, 6]],
  escada: [[-10, -6], [-3.5, -2], [3.5, 2], [10, 6]],
};
// a sequência e quanto tempo cada forma fica (ms)
const ROTEIRO = [
  ['fila', 1500],
  ['losango', 620],
  ['meio', 420],
  ['quadrado', 1900],
  ['escada', 640],
];

export default function BolinhasPensando({ rotulo = 'Pensando', className = '' }) {
  const [passo, setPasso] = useState(0);
  const parado = reduzido();

  useEffect(() => {
    if (parado) return undefined;
    const t = setTimeout(() => setPasso((p) => (p + 1) % ROTEIRO.length), ROTEIRO[passo][1]);
    return () => clearTimeout(t);
  }, [passo, parado]);

  const [forma] = ROTEIRO[parado ? 0 : passo];
  return (
    <span className={`bolinhas ${className}`} data-forma={forma} data-parado={parado || undefined} role="status" aria-label={rotulo}>
      <span className="bolinhas-palco" aria-hidden="true">
        {FORMAS[forma].map((pos, i) => (
          <span
            key={i}
            className="bolinha"
            style={{
              '--i': i,
              transform: pos ? `translate3d(${pos[0]}px, ${pos[1]}px, 0) scale(${pos[2] ?? 1})` : 'translate3d(0, 0, 0) scale(0.3)',
              opacity: pos ? 1 : 0,
            }}
          >
            <i />
          </span>
        ))}
      </span>
    </span>
  );
}
