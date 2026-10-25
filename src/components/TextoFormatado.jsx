import { comLinks } from './LinkNoTexto';

// Formatação leve das respostas do montador: listas ("- " ou "1. ") e
// **negrito**. Monta elementos React (nunca HTML cru), então é seguro.
function negrito(texto, chave) {
  return texto.split(/(\*\*[^*]+\*\*)/g).flatMap((p, i) =>
    p.startsWith('**') && p.endsWith('**') && p.length > 4 ? [<strong key={`${chave}-${i}`}>{p.slice(2, -2)}</strong>] : comLinks(p, `${chave}-${i}`),
  );
}

export default function TextoFormatado({ texto }) {
  const blocos = [];
  let lista = null;
  const fecharLista = () => {
    if (lista) blocos.push(lista);
    lista = null;
  };
  String(texto ?? '')
    .replace(/R\$\s+(?=\d)/g, 'R$\u00a0') // "R$" não fica sozinho no fim da linha
    .split('\n')
    .forEach((linha, n) => {
      const item = linha.match(/^\s*(?:[-*•]|(\d+)[.)])\s+(.*)$/);
      if (item) {
        const tipo = item[1] ? 'ol' : 'ul';
        if (!lista || lista.tipo !== tipo) {
          fecharLista();
          lista = { tipo, itens: [], chave: n };
        }
        lista.itens.push(negrito(item[2], n));
        return;
      }
      fecharLista();
      if (linha.trim()) blocos.push({ tipo: 'p', conteudo: negrito(linha, n), chave: n });
    });
  fecharLista();

  return (
    <div className="texto-formatado">
      {blocos.map((b) => {
        if (b.tipo === 'p') return <p key={b.chave}>{b.conteudo}</p>;
        const Lista = b.tipo;
        return (
          <Lista key={b.chave}>
            {b.itens.map((it, i) => <li key={i}>{it}</li>)}
          </Lista>
        );
      })}
    </div>
  );
}
