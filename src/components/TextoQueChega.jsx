import './TextoQueChega.css';

/**
 * Resposta nova do assistente: as palavras aparecem em sequência, saindo de
 * um leve desfoque, como quem está escrevendo. Respostas longas aceleram para
 * terminar em pouco mais de um segundo. Com movimento reduzido, aparece inteira.
 */
export default function TextoQueChega({ texto }) {
  const pedacos = String(texto ?? '').split(/(\s+)/);
  const palavras = pedacos.filter((p) => p && !/^\s+$/.test(p)).length || 1;
  const passo = Math.min(32, 1200 / palavras);
  let n = 0;
  return (
    <span className="texto-chega">
      {pedacos.map((p, i) =>
        !p || /^\s+$/.test(p) ? p : <span key={i} style={{ '--d': `${Math.round(n++ * passo)}ms` }}>{p}</span>,
      )}
    </span>
  );
}
