import { useId } from 'react';

/**
 * A marca: balão de conversa com o canhoto picotado de uma senha de
 * atendimento. Conversa que vira chamado.
 * tom="claro" para fundo escuro; o padrão é para fundo claro.
 */
export function Marca({ size = 32, tom = 'escuro' }) {
  const id = useId().replace(/:/g, '');
  const corpo = tom === 'claro' ? '#FFFFFF' : '#0B1A2C';
  const linhas = tom === 'claro' ? '#0B1A2C' : '#FFFFFF';
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <mask id={`r${id}`}>
          <rect width="64" height="64" fill="#fff" />
          <circle cx="5" cy="27" r="5" fill="#000" />
          <circle cx="59" cy="27" r="5" fill="#000" />
        </mask>
        <clipPath id={`c${id}`}>
          <rect x="44" y="0" width="20" height="64" />
        </clipPath>
      </defs>
      <g mask={`url(#r${id})`}>
        <rect x="5" y="9" width="54" height="36" rx="9" fill={corpo} />
        <path d="M14 43 L11 57 L27 43 Z" fill={corpo} />
        <rect x="5" y="9" width="54" height="36" rx="9" fill="#FFCF33" clipPath={`url(#c${id})`} />
      </g>
      <path d="M44 13.5v27" stroke="#0B1A2C" strokeWidth="2.4" strokeDasharray="2.6 3.2" />
      <path d="M15.5 21.5h18M15.5 31h11" stroke={linhas} strokeWidth="4.2" strokeLinecap="round" />
    </svg>
  );
}

export default function Logo({ size = 30, tom = 'escuro' }) {
  return (
    <span className="row" style={{ gap: size * 0.3 }}>
      <Marca size={size} tom={tom} />
      <span
        className="logo-word"
        style={{
          // a palavra da marca é sempre Archivo larga, independente do tema
          fontFamily: "'Archivo Variable', system-ui, sans-serif",
          fontWeight: 800,
          fontStretch: '118%',
          fontSize: size * 0.82,
          letterSpacing: '-0.04em',
          lineHeight: 1,
          color: tom === 'claro' ? '#FFFFFF' : '#0B1A2C',
        }}
      >
        helpy
      </span>
    </span>
  );
}
