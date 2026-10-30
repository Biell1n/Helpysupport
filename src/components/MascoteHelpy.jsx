// O mascote do Helpy: o balão-senha da marca em 3D, montado em camadas.
// Cada peça (corpo, braços, ticket, balão, sombra) é uma imagem própria e
// anima sozinha; os olhos são as pílulas do logo, desenhadas aqui por cima,
// e acompanham o mouse pelas variáveis --mx/--my que a seção já calcula.
import { useState } from 'react';

const P = '/img/mascote/';

export default function MascoteHelpy({ className = '' }) {
  // um toque faz ele dar um pulinho
  const [pulo, setPulo] = useState(0);
  return (
    <div
      className={`mascote ${className}`}
      role="img"
      aria-label="O Helpy, um balão de conversa azul com bracinhos, acenando"
      onPointerDown={() => setPulo((n) => n + 1)}
    >
      <img className="mascote-sombra" src={`${P}sombra.webp`} alt="" aria-hidden="true" />
      <img className="mascote-balao" src={`${P}balao.webp`} alt="" aria-hidden="true" />
      <div className="mascote-flutua" aria-hidden="true">
        <div className="mascote-pula" key={pulo} data-pulou={pulo > 0 || undefined}>
          <img className="mascote-braco-parado" src={`${P}braco-parado.webp`} alt="" />
          <img className="mascote-braco-acena" src={`${P}braco-acena.webp`} alt="" />
          <div className="mascote-corpo">
            <img src={`${P}corpo.webp`} alt="" />
            <span className="mascote-olhos">
              <i />
              <i />
            </span>
          </div>
        </div>
      </div>
      <img className="mascote-ticket" src={`${P}ticket.webp`} alt="" aria-hidden="true" />
    </div>
  );
}
