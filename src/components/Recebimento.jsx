import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Wallet } from 'lucide-react';
import { chamar } from '@/lib/supabase';

/**
 * Receber pelo assistente: atalho para a Carteira. Com ela ligada, o
 * assistente fecha a compra no chat (site, WhatsApp, Instagram, Discord)
 * com um link de Pix, cartão ou boleto.
 */
export default function Recebimento() {
  const [rec, setRec] = useState(undefined);

  useEffect(() => {
    chamar('pagamentos', { action: 'status' })
      .then((r) => setRec(r.recebimento ?? null))
      .catch(() => setRec(null));
  }, []);

  const rotulo = rec === undefined ? '…' : !rec ? 'Desligado' : !rec.ativo ? 'Pausado' : rec.ambiente === 'sandbox' ? 'Ligado · teste' : 'Ligado';

  return (
    <section className="card canal-card recebimento">
      <div className="canal-topo">
        <span className="canal-icone canal-pagamento"><Wallet size={22} /></span>
        <div>
          <h2 className="card-title">Receber pelo assistente</h2>
          <span className={`badge ${rec?.ativo ? 'badge-closed' : 'badge-bot'}`}>{rotulo}</span>
        </div>
      </div>
      <p className="muted canal-frase">
        O assistente fecha a compra na conversa: confirma os produtos e manda um link de Pix, cartão ou boleto. Quando o pagamento cai, ele avisa o cliente, o pedido aparece em Pedidos, o estoque baixa e o dinheiro entra na sua Carteira. Funciona no site, WhatsApp, Instagram e Discord.
      </p>
      <p className="faint" style={{ margin: 0, fontSize: 13.5, maxWidth: 680 }}>
        Com a carteira ligada, você escolhe em cada assistente (Assistentes → Editar → Como funciona): <b>Fechar a venda no chat?</b> e, se ele marca horários, <b>Cobrar para marcar?</b>.
        Quem não vende, como um professor ou um suporte, nem mostra essas opções.
      </p>
      <div className="row row-wrap" style={{ gap: 8 }}>
        <Link className={`btn btn-sm ${rec ? 'btn-ghost' : 'btn-primary'}`} to="/painel/carteira">{rec ? 'Abrir a Carteira' : 'Ativar a Carteira'}</Link>
        {rec && <Link className="btn btn-quiet btn-sm" to="/painel/pedidos">Ver pedidos</Link>}
      </div>
    </section>
  );
}
