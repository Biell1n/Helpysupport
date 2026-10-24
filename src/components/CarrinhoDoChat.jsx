import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Minus, Plus, ShoppingBag, Trash2 } from 'lucide-react';

const reais = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/**
 * O carrinho da conversa: aparece quando o assistente põe o primeiro produto,
 * pulsa quando algo muda e deixa a pessoa mudar a quantidade, tirar um item
 * ou pedir para fechar. O preço é sempre o que o assistente pegou da tabela.
 */
export default function CarrinhoDoChat({ itens = [], onMudar, onFechar, ocupado }) {
  const [aberto, setAberto] = useState(false);
  const [pulso, setPulso] = useState(false);
  const antes = useRef('');
  const qtd = itens.reduce((s, i) => s + Number(i.quantidade || 0), 0);
  const total = itens.reduce((s, i) => s + Number(i.subtotal || 0), 0);

  // mudou o carrinho (pela conversa ou aqui): dá uma pulsada para a pessoa notar
  useEffect(() => {
    const agora = JSON.stringify(itens.map((i) => [i.produto, i.quantidade]));
    if (antes.current && antes.current !== agora) {
      setPulso(true);
      const t = setTimeout(() => setPulso(false), 700);
      antes.current = agora;
      return () => clearTimeout(t);
    }
    antes.current = agora;
    return undefined;
  }, [itens]);

  if (!itens.length) return null;
  return (
    <section className="carrinho" data-aberto={aberto || undefined} data-pulso={pulso || undefined} aria-label="Seu carrinho">
      <button type="button" className="carrinho-barra" onClick={() => setAberto((v) => !v)} aria-expanded={aberto}>
        <span className="carrinho-icone"><ShoppingBag size={17} /><b>{qtd}</b></span>
        <span className="carrinho-resumo">
          {qtd} {qtd === 1 ? 'item' : 'itens'} no carrinho · <b>{reais(total)}</b>
        </span>
        <span className="carrinho-ver">{aberto ? 'Fechar' : 'Ver carrinho'} <ChevronDown size={15} /></span>
      </button>
      {aberto && (
        <div className="carrinho-corpo">
          <ul>
            {itens.map((i) => (
              <li key={i.produto}>
                <span className="carrinho-nome">
                  {i.produto}
                  <small>{reais(i.preco)} cada</small>
                </span>
                <span className="carrinho-qtd">
                  <button type="button" aria-label={`Tirar uma unidade de ${i.produto}`} disabled={ocupado} onClick={() => onMudar(i.produto, i.quantidade - 1)}>
                    {i.quantidade > 1 ? <Minus size={14} /> : <Trash2 size={14} />}
                  </button>
                  <b>{i.quantidade}</b>
                  <button type="button" aria-label={`Mais uma unidade de ${i.produto}`} disabled={ocupado || i.quantidade >= 99} onClick={() => onMudar(i.produto, i.quantidade + 1)}>
                    <Plus size={14} />
                  </button>
                </span>
                <span className="carrinho-sub">{reais(i.subtotal)}</span>
              </li>
            ))}
          </ul>
          <div className="carrinho-pe">
            <span>Total <b>{reais(total)}</b> <small>frete à parte, se houver</small></span>
            <button type="button" className="btn btn-primary btn-sm" disabled={ocupado} onClick={() => { setAberto(false); onFechar(); }}>
              Fechar pedido
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
