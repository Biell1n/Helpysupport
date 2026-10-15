import { useLayoutEffect, useRef, useState } from 'react';
import './LatticeLoader.css';

// Indicador de "pensando": uma grade de pontinhos que acendem em sequência,
// com o texto e o tempo correndo ao lado. Adaptado do LatticeLoader (React Bits).
const PATTERNS = {
  arrow: { 3: { cells: [1, 2, 3, 0, 1, 2, 1, 2, 3], loop: 7.2, scale: 1 } },
  dots: { 3: { cells: [0, 1, 2, 0, 1, 2, 0, 1, 2], loop: 3, scale: 2.4 } },
  ripple: { 3: { cells: [2, 1, 2, 1, 0, 1, 2, 1, 2], loop: 4.8, scale: 1.5 } },
  spiral: { 3: { cells: [0, 1, 2, 7, 8, 3, 6, 5, 4], loop: 9, scale: 1.2, lit: 0.35 } },
  orbit: {
    3: { cells: [0, 1, 2, 7, null, 3, 6, 5, 4], loop: 8, scale: 1.2 },
    4: { cells: [0, 1, 2, 3, 11, null, null, 4, 10, null, null, 5, 9, 8, 7, 6], loop: 6, scale: 1.2, lit: 0.45 },
  },
  snake: {
    3: { cells: [0, 1, 2, 5, 4, 3, 6, 7, 8], loop: 9, scale: 1, lit: 0.35 },
    4: { cells: [0, 1, 2, 3, 7, 6, 5, 4, 8, 9, 10, 11, 15, 14, 13, 12], loop: 16, scale: 1, lit: 0.25 },
  },
  sweep: { 4: { cells: [0, 1, 2, 3, 1, 2, 3, 4, 2, 3, 4, 5, 3, 4, 5, 6], loop: 5, scale: 1, lit: 0.45 } },
  pulse: { 4: { cells: [2, 1, 1, 2, 1, 0, 0, 1, 1, 0, 0, 1, 2, 1, 1, 2], loop: 2.4, scale: 2.5, lit: 0.45 } },
};
const DEFAULT_PATTERN = { 3: 'orbit', 4: 'sweep' };
const MARKS = {
  3: { done: [2, 3, 5, 7], error: [0, 2, 4, 6, 8] },
  4: { done: [7, 8, 10, 13], error: [0, 3, 5, 6, 9, 10, 12, 15] },
};

const resolvePattern = (pattern, grid) => (PATTERNS[pattern] && PATTERNS[pattern][grid]) || PATTERNS[DEFAULT_PATTERN[grid]][grid];
const fmt = (ds) => (ds < 600 ? `${(ds / 10).toFixed(1)}s` : `${Math.floor(ds / 600)}m ${((ds % 600) / 10).toFixed(1)}s`);

export default function LatticeLoader({
  label = 'Pensando',
  doneLabel = 'Pronto em',
  errorLabel = 'Falhou depois de',
  status = 'working',
  pattern = 'orbit',
  grid = 3,
  shape = 'round',
  color = 'currentColor',
  doneColor = '#1d8656',
  errorColor = '#c9492c',
  cellSize = 6,
  gap = 2,
  fontSize = 14,
  step = 90,
  idleOpacity = 0.15,
  showTimer = true,
  className = '',
}) {
  const n = grid === 4 ? 4 : 3;
  const pat = resolvePattern(pattern, n);
  const marks = MARKS[n];
  const d = step * pat.scale;
  const cycle = Math.round(pat.loop * d);
  const timerRef = useRef(null);
  const [anuncio] = useState(`${label}…`);

  useLayoutEffect(() => {
    if (status !== 'working') return undefined;
    const inicio = performance.now();
    const id = setInterval(() => {
      if (timerRef.current) timerRef.current.textContent = fmt(Math.floor((performance.now() - inicio) / 100));
    }, 100);
    return () => clearInterval(id);
  }, [status]);

  return (
    <span
      role="status"
      className={`lattice-loader${className ? ` ${className}` : ''}`}
      data-status={status}
      data-shape={shape}
      style={{
        '--ll-n': n,
        '--ll-cell': `${cellSize}px`,
        '--ll-gap': `${gap}px`,
        '--ll-font': `${fontSize}px`,
        '--ll-color': color,
        '--ll-mark': status === 'error' ? errorColor : doneColor,
        '--ll-idle': idleOpacity,
        '--ll-cycle': `${cycle}ms`,
      }}
    >
      <span className="lattice-loader__grid" aria-hidden="true">
        <span className="lattice-loader__layer lattice-loader__run">
          {pat.cells.map((unit, i) => (
            <span
              key={i}
              className="lattice-loader__cell"
              data-hole={unit == null ? '' : undefined}
              data-lit={pat.lit ? Math.round(pat.lit * 100) : undefined}
              style={unit == null ? undefined : { animationDelay: `${Math.round(unit * d)}ms` }}
            />
          ))}
        </span>
        <span className="lattice-loader__layer lattice-loader__mark">
          {pat.cells.map((_, i) => (
            <span key={i} className="lattice-loader__cell" data-on={marks[status === 'error' ? 'error' : 'done'].includes(i) ? '' : undefined} />
          ))}
        </span>
      </span>
      <span className="lattice-loader__label" aria-hidden="true">
        {status === 'working' ? label : status === 'done' ? doneLabel : errorLabel}
      </span>
      {showTimer ? <span ref={timerRef} className="lattice-loader__timer" aria-hidden="true">0.0s</span> : null}
      <span className="lattice-loader__sr">{anuncio}</span>
    </span>
  );
}
