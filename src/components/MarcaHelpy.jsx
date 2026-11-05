// A marca do Helpy: o nome desenhado à mão, em traço contínuo e redondo.
// O "y" é uma pessoa de braços levantados — quem chama ("aqui!") e quem
// responde ("tô aqui"). Sozinho, ele vira o ícone e o avatar.
//
// Unidades: linha de base em y = 0, altura-x 100, traço de 27.

export const TRACO = 27;

/** Letras h, e, l, p (cada uma já posicionada) e o y-pessoa (braços + corpo e a cabeça). */
export const LETRAS_HELPY = [
  'M20 -150V0M20 -58C20 -88 40 -100 62 -100C86 -100 100 -86 100 -60V0',
  'M134 -50H218C218 -80 198 -100 176 -100C151 -100 134 -78 134 -50C134 -21 152 0 178 0C194 0 206 -6 214 -16',
  'M255 -150V-22C255 -8 261 0 274 0',
  'M305 -100V62M305 -58C305 -86 324 -100 347 -100C372 -100 390 -78 390 -50C390 -22 372 0 347 0C324 0 305 -14 305 -42',
];
export const PESSOA = { corpo: 'M422 -104L466 -38M510 -104L466 -38C456 -2 448 40 428 62', cabeca: { cx: 466, cy: -128, r: 17 } };

// caixa do desenho inteiro (com a espessura do traço)
const CAIXA = { x: -6, y: -160, w: 534, h: 236 };

/** O nome inteiro. size = altura desejada em px. */
export function Assinatura({ size = 36, cor = 'currentColor', className = '', titulo = 'helpy' }) {
  const largura = (size * CAIXA.w) / CAIXA.h;
  return (
    <svg className={className} width={largura} height={size} viewBox={`${CAIXA.x} ${CAIXA.y} ${CAIXA.w} ${CAIXA.h}`} role="img" aria-label={titulo}>
      <g fill="none" stroke={cor} strokeWidth={TRACO} strokeLinecap="round" strokeLinejoin="round">
        {LETRAS_HELPY.map((d) => <path key={d} d={d} />)}
        <path d={PESSOA.corpo} />
      </g>
      <circle {...PESSOA.cabeca} fill={cor} />
    </svg>
  );
}

/** Só a pessoa (o "y"): ícone, avatar, selo. */
export function Pessoa({ size = 32, cor = 'currentColor', className = '' }) {
  // caixa do y com folga do traço
  return (
    <svg className={className} width={size} height={size} viewBox="402 -160 128 236" aria-hidden="true">
      <path d={PESSOA.corpo} fill="none" stroke={cor} strokeWidth={TRACO} strokeLinecap="round" strokeLinejoin="round" />
      <circle {...PESSOA.cabeca} fill={cor} />
    </svg>
  );
}
