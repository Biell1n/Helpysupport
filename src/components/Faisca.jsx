/**
 * Minigráfico de tendência (sparkline): só a forma, sem eixo, com um
 * ponto no valor mais recente. Usado nos números do painel e dos relatórios.
 */
export default function Faisca({ valores, className = '', largura = 96, altura = 32 }) {
  if (!valores || valores.length < 2 || !valores.some(Boolean)) return null;
  const w = largura, h = altura, p = 2;
  const max = Math.max(...valores);
  const pts = valores.map((v, i) => [p + (i / (valores.length - 1)) * (w - 2 * p), h - p - (max ? v / max : 0) * (h - 2 * p)]);
  const linha = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join('');
  const area = `${linha}L${pts.at(-1)[0].toFixed(1)},${h}L${pts[0][0].toFixed(1)},${h}Z`;
  const [ux, uy] = pts.at(-1);
  return (
    <svg className={`faisca ${className}`} width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <path d={area} className="faisca-area" />
      <path d={linha} className="faisca-linha" />
      <circle cx={ux} cy={uy} r="3" className="faisca-ponto" />
    </svg>
  );
}
