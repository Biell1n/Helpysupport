// Um ponto de luz que corre pela borda do cartão (o pai precisa de position: relative).
// Adaptado do Border Beam do Magic UI (magicui.design, MIT), só com CSS.
import './FeixeNaBorda.css';

export default function FeixeNaBorda({ tamanho = 90, duracao = 7, de = '#1f66f4', para = '#9ec0ff', espessura = 1.5, atraso = 0 }) {
  return (
    <span
      className="feixe-borda"
      aria-hidden="true"
      style={{ '--feixe-l': `${espessura}px`, '--feixe-t': `${tamanho}px`, '--feixe-d': `${duracao}s`, '--feixe-a': `${-atraso}s`, '--feixe-de': de, '--feixe-para': para }}
    >
      <span className="feixe-borda-luz" />
    </span>
  );
}
