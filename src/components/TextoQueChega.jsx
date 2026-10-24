import './TextoQueChega.css';
import { LinkNoTexto } from './LinkNoTexto';

/**
 * Resposta nova do assistente: as palavras aparecem em sequência, saindo de
 * um leve desfoque, como quem está escrevendo. Respostas longas aceleram para
 * terminar em pouco mais de um segundo. Com movimento reduzido, aparece inteira.
 * **negrito** vira negrito de verdade e "- " no começo da linha vira "•".
 */
export default function TextoQueChega({ texto }) {
  const limpo = String(texto ?? '').replace(/^(\s*)[-*]\s+/gm, '$1• ');
  const trechos = limpo.split(/(\*\*[^*\n]+\*\*)/g).map((t) =>
    t.startsWith('**') && t.endsWith('**') && t.length > 4 ? { forte: true, t: t.slice(2, -2) } : { forte: false, t },
  );
  const total = trechos.reduce((s, x) => s + x.t.split(/\s+/).filter(Boolean).length, 0) || 1;
  const passo = Math.min(32, 1200 / total);
  let n = 0;
  return (
    <span className="texto-chega">
      {trechos.map((x, j) => {
        const partes = x.t.split(/(\s+)/).map((p, i) =>
          !p || /^\s+$/.test(p) ? (
            p
          ) : /^https?:\/\//.test(p) ? (
            // link (de pagamento ou não) entra inteiro, clicável
            <span key={i} style={{ '--d': `${Math.round(n++ * passo)}ms` }}><LinkNoTexto url={p.replace(/[).,;:!?]+$/, '')} /></span>
          ) : (
            <span key={i} style={{ '--d': `${Math.round(n++ * passo)}ms` }}>{p}</span>
          ),
        );
        return x.forte ? <strong key={j}>{partes}</strong> : <span key={j}>{partes}</span>;
      })}
    </span>
  );
}
