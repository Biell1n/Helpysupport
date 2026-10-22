// ============================================================
// Cobrança do Helpy (a conta Asaas que recebe pelos planos): faturas,
// uso extra e o ambiente (sandbox ou produção) de cada assinatura.
// Usado por pagamentos e pelo uso extra do atendimento.
// ============================================================

import { UserError } from './cors.ts';
import { admin } from './db.ts';
import { type Ambiente, asaas, FORMA, hojeBr, pago } from './asaas.ts';

export const AMBIENTE = (Deno.env.get('ASAAS_AMBIENTE') === 'producao' ? 'producao' : 'sandbox') as Ambiente;

/** A conta Asaas do próprio Helpy (quem recebe pelos planos). */
export function contaHelpy() {
  const chave = Deno.env.get('ASAAS_API_KEY');
  if (!chave) throw new UserError('A cobrança dos planos ainda não foi ligada. Tente de novo em instantes.', 503);
  return asaas(chave, AMBIENTE);
}

type ComAmbiente = { ambiente?: string | null; asaas_cliente?: string | null; asaas_assinatura?: string | null; asaas_anterior?: string | null };

/**
 * A assinatura é deste Asaas? As antigas (sem ambiente) são do sandbox. Uma
 * de outro ambiente vale como cancelada e sem ids: assim, ao virar para
 * produção, nada tenta cobrar ou apagar um cliente que só existe no teste.
 */
export function desteAmbiente<T extends ComAmbiente>(a: T | null | undefined): T | null {
  if (!a) return null;
  if ((a.ambiente ?? 'sandbox') === AMBIENTE) return a;
  return { ...a, status: 'cancelada', asaas_cliente: null, asaas_assinatura: null, asaas_anterior: null, proximo_vencimento: null };
}

export async function guardarFatura(ownerId: string, pg: Record<string, unknown>, descricao?: string) {
  await admin.from('faturas').upsert({
    id: String(pg.id),
    owner_id: ownerId,
    valor: Number(pg.value ?? 0),
    status: String(pg.status ?? 'PENDING'),
    vencimento: pg.dueDate ? String(pg.dueDate) : null,
    pago_em: pago(String(pg.status)) ? new Date().toISOString() : null,
    link: pg.invoiceUrl ? String(pg.invoiceUrl) : null,
    forma: FORMA[String(pg.billingType)] ?? null,
    descricao: descricao ?? (pg.description ? String(pg.description).slice(0, 200) : null),
    ambiente: AMBIENTE,
  });
}

// ------------------------------------------------------------
// Uso extra: o que passou da cota vira uma fatura separada
// ------------------------------------------------------------
export const MINIMO_FATURA = 5; // o Asaas não emite cobrança menor que isso
export const reais = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const mesUtc = () => new Date().toISOString().slice(0, 7) + '-01';
const nomeMes = (mes: string) => new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${mes}T00:00:00Z`));

/**
 * Fecha numa fatura só o uso extra dos meses que já acabaram (no
 * cancelamento, também o do mês atual). Abaixo do mínimo do Asaas espera
 * somar mais; no cancelamento, o que não chega ao mínimo é perdoado. Conta
 * isenta (as de teste da casa) só registra.
 */
export async function fecharUsoExtra(ownerId: string, incluirAtual = false) {
  // uso extra e taxa das vendas do mês vão na mesma fatura
  let busca = admin.from('uso_extra').select('mes, valor, taxa_vendas').eq('owner_id', ownerId).eq('status', 'aberto')
    .or('valor.gt.0,taxa_vendas.gt.0');
  if (!incluirAtual) busca = busca.lt('mes', mesUtc());
  const { data: abertos } = await busca;
  if (!abertos?.length) return;
  const meses = abertos.map((r) => String(r.mes));
  const soma = (rs: { valor: unknown; taxa_vendas: unknown }[]) => rs.reduce((s, r) => s + Number(r.valor) + Number(r.taxa_vendas), 0);
  const total = soma(abertos);
  const marcar = (status: string) => admin.from('uso_extra').update({ status, cobrado_em: new Date().toISOString() })
    .eq('owner_id', ownerId).in('mes', meses).eq('status', 'aberto');

  const { data: perfil } = await admin.from('profiles').select('cobranca_isenta').eq('id', ownerId).maybeSingle();
  if (perfil?.cobranca_isenta) return void (await marcar('isento'));
  if (total < MINIMO_FATURA) return void (incluirAtual ? await marcar('perdoado') : null);

  const { data: bruta } = await admin.from('assinaturas').select('asaas_cliente, ambiente').eq('owner_id', ownerId).maybeSingle();
  const ass = desteAmbiente(bruta);
  if (!ass?.asaas_cliente) return void console.warn('[uso extra] conta sem cliente no Asaas', ownerId);

  // reserva as linhas antes de cobrar: duas chamadas juntas não geram duas faturas
  const { data: reservados } = await admin.from('uso_extra').update({ status: 'cobrando', atualizado_em: new Date().toISOString() })
    .eq('owner_id', ownerId).in('mes', meses).eq('status', 'aberto').select('mes, valor, taxa_vendas');
  if (!reservados?.length) return;
  const lote = reservados.map((r) => String(r.mes)).sort();
  const valor = Math.round(soma(reservados) * 100) / 100;
  const temExtra = reservados.some((r) => Number(r.valor) > 0);
  const temTaxa = reservados.some((r) => Number(r.taxa_vendas) > 0);
  const voltar = () => admin.from('uso_extra').update({ status: 'aberto' }).eq('owner_id', ownerId).in('mes', lote).eq('status', 'cobrando');
  if (valor < MINIMO_FATURA) return void (await voltar());

  const descricao = `${temExtra && temTaxa ? 'Uso extra e taxa de vendas' : temTaxa ? 'Taxa de vendas' : 'Uso extra'} de ${lote.map(nomeMes).join(', ')}`;
  const vence = hojeBr(5);
  try {
    const pg = await contaHelpy().pedir<Record<string, unknown> & { id: string }>('/payments', {
      method: 'POST',
      body: {
        customer: ass.asaas_cliente, billingType: 'UNDEFINED', value: valor, dueDate: vence,
        description: `Helpy — ${descricao.toLowerCase()}`, externalReference: `extra:${ownerId}`,
      },
    });
    await admin.from('uso_extra').update({ status: 'cobrado', fatura_id: pg.id, cobrado_em: new Date().toISOString() })
      .eq('owner_id', ownerId).in('mes', lote).eq('status', 'cobrando');
    await guardarFatura(ownerId, pg, descricao);
    await admin.from('alertas').insert({
      owner_id: ownerId, origem: 'sistema', chave: `extra:fatura:${pg.id}`,
      assunto: `Fatura de ${reais(valor)}: ${descricao.split(' de ')[0].toLowerCase()}`,
      detalhe: `${descricao}. Vence em ${vence.split('-').reverse().join('/')}. Pague pela página Plano.`,
    });
  } catch (e) {
    await voltar();
    throw e;
  }
}
