import { CheckCircle2, ClipboardList, Clock3, ShoppingCart } from 'lucide-react';

/** Em que pé está a compra nesta conversa: do carrinho ao pedido pago ou finalizado pela equipe. */
export const ETAPAS = {
  montando: { rotulo: 'Montando pedido', Icone: ShoppingCart, cor: 'etapa-montando' },
  pagamento: { rotulo: 'Aguardando pagamento', Icone: Clock3, cor: 'etapa-pagamento' },
  anotado: { rotulo: 'Pedido anotado', Icone: ClipboardList, cor: 'etapa-anotado' },
  feito: { rotulo: 'Pedido pago/finalizado', Icone: CheckCircle2, cor: 'etapa-feito' },
};
export const DO_PEDIDO = { aguardando: 'pagamento', anotado: 'anotado', pago: 'feito', finalizado: 'feito' };

export function etapaDa(c, pedido) {
  if (pedido && DO_PEDIDO[pedido]) return DO_PEDIDO[pedido];
  return Array.isArray(c.carrinho) && c.carrinho.length ? 'montando' : null;
}

export function SeloEtapa({ etapa }) {
  const e = ETAPAS[etapa];
  if (!e) return null;
  return <span className={`selo-etapa ${e.cor}`} title={e.rotulo}><e.Icone size={12} aria-hidden="true" /> {e.rotulo}</span>;
}

/** Etapa da compra de cada conversa, pelo pedido mais recente que ainda vale. */
export async function etapasDasConversas(supabase, conversas) {
  const ids = conversas.map((c) => c.id);
  const mapa = {};
  if (ids.length) {
    const { data: peds } = await supabase.from('pedidos').select('conversation_id, status, criado_em')
      .in('conversation_id', ids).order('criado_em', { ascending: false }).limit(500);
    // cancelado e estornado não contam
    for (const p of peds ?? []) if (!mapa[p.conversation_id] && DO_PEDIDO[p.status]) mapa[p.conversation_id] = p.status;
  }
  return Object.fromEntries(conversas.map((c) => [c.id, etapaDa(c, mapa[c.id])]));
}
