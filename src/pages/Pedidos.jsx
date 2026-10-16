import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Copy, MessagesSquare, RefreshCw, ShoppingBag } from 'lucide-react';
import { chamar, supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/Toasts';
import { Confirmar } from '@/components/Modal';
import { reais } from '@/lib/plans';
import { quando } from '@/lib/format';

const STATUS = {
  aguardando: ['Aguardando pagamento', 'badge-waiting'],
  pago: ['Pago', 'badge-closed'],
  cancelado: ['Cancelado', 'badge-bot'],
};
const FILTROS = [
  { id: 'todos', rotulo: 'Todos' },
  { id: 'aguardando', rotulo: 'Aguardando' },
  { id: 'pago', rotulo: 'Pagos' },
  { id: 'cancelado', rotulo: 'Cancelados' },
];

/** O que o assistente vendeu no chat: itens, total e se o cliente já pagou. */
export default function Pedidos() {
  const { tipo } = useAuth();
  const avisar = useToast();
  const [pedidos, setPedidos] = useState(null);
  const [filtro, setFiltro] = useState('todos');
  const [cancelando, setCancelando] = useState(null);

  const carregar = useCallback(async () => {
    const { data, error } = await supabase
      .from('pedidos')
      .select('id, numero, itens, total, status, cliente_nome, link_url, forma, pago_em, criado_em, conversation_id')
      .order('criado_em', { ascending: false })
      .limit(200);
    if (error) avisar('Não deu para carregar os pedidos', { erro: true, texto: error.message });
    setPedidos(data ?? []);
  }, [avisar]);

  useEffect(() => {
    carregar();
    const t = setInterval(carregar, 20000);
    return () => clearInterval(t);
  }, [carregar]);

  const resumo = useMemo(() => {
    const pagos = (pedidos ?? []).filter((p) => p.status === 'pago');
    const aguardando = (pedidos ?? []).filter((p) => p.status === 'aguardando');
    return {
      vendido: pagos.reduce((s, p) => s + Number(p.total), 0),
      pagos: pagos.length,
      aguardando: aguardando.length,
      emAberto: aguardando.reduce((s, p) => s + Number(p.total), 0),
    };
  }, [pedidos]);

  const lista = (pedidos ?? []).filter((p) => filtro === 'todos' || p.status === filtro);

  const copiar = async (url) => {
    try {
      await navigator.clipboard.writeText(url);
      avisar('Link copiado');
    } catch {
      avisar('Não deu para copiar', { erro: true });
    }
  };

  const cancelar = async () => {
    const p = cancelando;
    setCancelando(null);
    try {
      await chamar('pagamentos', { action: 'pedido_cancelar', id: p.id });
      avisar(`Pedido #${p.numero} cancelado`);
      carregar();
    } catch (e) {
      avisar('Não deu para cancelar', { erro: true, texto: e.message });
    }
  };

  return (
    <div className="page" style={{ maxWidth: 960 }}>
      <header className="page-head">
        <div>
          <h1>Pedidos</h1>
          <p>O que o assistente vendeu no chat. Quando o pagamento cai, o pedido muda sozinho para pago e o cliente recebe a confirmação.</p>
        </div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={carregar}><RefreshCw size={15} /> Atualizar</button>
      </header>

      {pedidos === null && <div className="skeleton" style={{ height: 200 }} />}

      {pedidos?.length === 0 && (
        <div className="empty">
          <ShoppingBag size={32} />
          <h3>Nenhum pedido ainda</h3>
          <p>Ligue o recebimento em Canais. Depois, quando um cliente decidir comprar, o assistente confirma os itens e manda o link de pagamento na conversa.</p>
          {tipo === 'empresa' && <Link to="/painel/canais" className="btn btn-senha">Ligar o recebimento</Link>}
        </div>
      )}

      {pedidos?.length > 0 && (
        <>
          <div className="pedidos-resumo">
            <div className="card"><span className="faint">Vendido</span><b>{reais(resumo.vendido)}</b><span className="faint">{resumo.pagos} pago{resumo.pagos === 1 ? '' : 's'}</span></div>
            <div className="card"><span className="faint">Aguardando pagamento</span><b>{reais(resumo.emAberto)}</b><span className="faint">{resumo.aguardando} pedido{resumo.aguardando === 1 ? '' : 's'}</span></div>
          </div>

          <div className="row row-wrap" style={{ gap: 6, margin: '20px 0 12px' }} role="tablist" aria-label="Filtrar pedidos">
            {FILTROS.map((f) => (
              <button key={f.id} type="button" role="tab" aria-selected={filtro === f.id} className={`btn btn-sm ${filtro === f.id ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setFiltro(f.id)}>
                {f.rotulo}
              </button>
            ))}
          </div>

          {lista.length === 0 && <p className="muted">Nada aqui.</p>}

          <ul className="pedidos">
            {lista.map((p) => {
              const [rotulo, classe] = STATUS[p.status] ?? [p.status, ''];
              return (
                <li key={p.id} className="card pedido">
                  <div className="pedido-topo">
                    <b>#{p.numero}</b>
                    <span>{p.cliente_nome || 'Cliente'}</span>
                    <span className="faint">{quando(p.criado_em)}</span>
                    <span className={`badge ${classe}`} style={{ marginLeft: 'auto' }}>{rotulo}</span>
                  </div>
                  <ul className="pedido-itens">
                    {(p.itens ?? []).map((i, n) => (
                      <li key={n}>
                        <span>{i.quantidade}x {i.produto}</span>
                        <span className="faint">{reais(Number(i.subtotal ?? i.preco * i.quantidade))}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="pedido-pe">
                    <b>Total {reais(Number(p.total))}</b>
                    {p.status === 'pago' && <span className="faint">pago {quando(p.pago_em)}{p.forma ? ` · ${p.forma}` : ''}</span>}
                    <div className="row" style={{ gap: 6, marginLeft: 'auto' }}>
                      {p.conversation_id && (
                        <Link to={`/painel/atendimentos?id=${p.conversation_id}`} className="btn btn-quiet btn-sm"><MessagesSquare size={14} /> Conversa</Link>
                      )}
                      {p.status === 'aguardando' && p.link_url && (
                        <button type="button" className="btn btn-quiet btn-sm" onClick={() => copiar(p.link_url)}><Copy size={14} /> Link</button>
                      )}
                      {p.status === 'aguardando' && tipo === 'empresa' && (
                        <button type="button" className="btn btn-quiet btn-sm" onClick={() => setCancelando(p)}>Cancelar</button>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <Confirmar
        aberto={!!cancelando}
        titulo={`Cancelar o pedido #${cancelando?.numero ?? ''}?`}
        texto="O link de pagamento para de funcionar. O cliente não é avisado automaticamente."
        acao="Cancelar pedido"
        perigo
        onFechar={() => setCancelando(null)}
        onConfirmar={cancelar}
      />
    </div>
  );
}
