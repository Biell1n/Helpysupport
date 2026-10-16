// ============================================================
// Vendas pelo assistente.
//
// fecharPedido   → o assistente fecha a compra: os preços vêm da tabela
//                  (nunca do que a IA escreveu), confere o estoque, gera
//                  o link de pagamento na conta Asaas da empresa e devolve
//                  o link para mandar no chat (site, WhatsApp, Instagram,
//                  Discord — é só texto)
// pagamentoDaLoja → o Asaas avisou que pagaram: marca o pedido, baixa o
//                  estoque e avisa o cliente na mesma conversa e canal
// ============================================================

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { asaas, type Ambiente, type ClienteAsaas, FORMA, pago } from './asaas.ts';
import { buscar } from './busca.ts';
import { type Canal, enviarPeloCanal } from './canais.ts';

const reais = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** "1.499,90", "R$ 79,9", "1499.9" → número */
export function lerPreco(v: unknown): number | null {
  let s = String(v ?? '').replace(/[^\d.,-]/g, '');
  if (!s) return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

/** A conta Asaas da empresa, se ela ligou o recebimento. */
export async function contaDaLoja(db: SupabaseClient, ownerId: string): Promise<ClienteAsaas | null> {
  const { data: rec } = await db.from('recebimentos').select('ambiente, ativo').eq('owner_id', ownerId).maybeSingle();
  if (!rec?.ativo) return null;
  const { data: chave } = await db.rpc('helpy_recebimento_segredo', { p_conta: ownerId });
  return chave ? asaas(String(chave), rec.ambiente as Ambiente) : null;
}

export async function vendeOnline(db: SupabaseClient, ownerId: string): Promise<boolean> {
  const { data } = await db.from('recebimentos').select('ativo').eq('owner_id', ownerId).maybeSingle();
  return !!data?.ativo;
}

type TabelaPedido = { id: string; nome: string; fonte: string; colunas: { chave: string; rotulo: string }[] };
type Item = { produto: string; quantidade: number; preco: number; subtotal: number; tabela_id?: string; linha_id?: string; estoque_chave?: string };

/**
 * Acha cada produto pedido nas tabelas do assistente (ou nas listas do
 * documento) e confere preço e estoque.
 */
async function montarItens(
  db: SupabaseClient,
  pedidos: { produto: string; quantidade: number }[],
  tabelas: TabelaPedido[],
  catalogo: Record<string, string>[],
): Promise<{ itens: Item[]; problemas: string[] }> {
  const locais = tabelas.filter((t) => t.fonte === 'manual' || t.fonte === 'url');
  const ids = locais.map((t) => t.id);
  const [{ data: linhas }, { data: tipos }] = await Promise.all([
    ids.length ? db.from('tabela_linhas').select('id, tabela_id, dados').in('tabela_id', ids).limit(5000) : Promise.resolve({ data: [] }),
    ids.length ? db.from('tabela_colunas').select('tabela_id, chave, rotulo, tipo').in('tabela_id', ids) : Promise.resolve({ data: [] }),
  ]);
  const colunasDe = (tid: string) => (tipos ?? []).filter((c) => c.tabela_id === tid);
  const precoChave = (tid: string) =>
    colunasDe(tid).find((c) => c.tipo === 'moeda')?.chave ?? colunasDe(tid).find((c) => /preco|valor|price/i.test(`${c.chave} ${c.rotulo}`))?.chave;
  const estoqueChave = (tid: string) => colunasDe(tid).find((c) => /estoque|quantidade|qtd|stock/i.test(`${c.chave} ${c.rotulo}`))?.chave;

  const registros = [
    ...(linhas ?? []).map((l) => {
      const t = locais.find((x) => x.id === l.tabela_id)!;
      const principais = t.colunas.filter((c, i) => i === 0 || /nome|produto|servi|item|titulo|modelo/i.test(`${c.chave} ${c.rotulo}`));
      return {
        nome: String(l.dados?.[t.colunas[0]?.chave] ?? ''),
        forte: principais.map((c) => String(l.dados?.[c.chave] ?? '')).join(' '),
        resto: Object.values(l.dados ?? {}).join(' '),
        preco: lerPreco(l.dados?.[precoChave(t.id) ?? '']),
        estoqueChave: estoqueChave(t.id),
        estoque: estoqueChave(t.id) ? Number(String(l.dados?.[estoqueChave(t.id)!] ?? '').replace(',', '.')) : null,
        tabela_id: t.id,
        linha_id: l.id as string,
      };
    }),
    ...catalogo.map((it) => {
      const precoK = Object.keys(it).find((k) => /preco|valor|price/i.test(k));
      const nome = String(Object.values(it)[0] ?? '');
      return { nome, forte: nome, resto: Object.values(it).join(' '), preco: lerPreco(precoK ? it[precoK] : null), estoqueChave: undefined, estoque: null, tabela_id: undefined, linha_id: undefined };
    }),
  ];

  const itens: Item[] = [];
  const problemas: string[] = [];
  for (const p of pedidos) {
    const qtd = Math.max(1, Math.min(999, Math.floor(Number(p.quantidade) || 1)));
    const resultado = buscar(registros, String(p.produto ?? ''), (r) => r);
    const achado = resultado[0]?.item;
    const empate = resultado[1] && resultado[1].pontos === resultado[0].pontos && resultado[1].item.nome !== achado?.nome;
    if (achado && empate) {
      problemas.push(`"${p.produto}": pode ser "${achado.nome}" ou "${resultado[1].item.nome}". Pergunte qual é e use o nome exato.`);
      continue;
    }
    if (!achado) {
      problemas.push(`"${p.produto}": não achei no catálogo. Confirme o nome exato com a pessoa.`);
      continue;
    }
    if (!achado.preco) {
      problemas.push(`"${achado.nome}": está sem preço no catálogo, então não dá para cobrar pelo chat. Ofereça a equipe.`);
      continue;
    }
    if (achado.estoque != null && Number.isFinite(achado.estoque) && achado.estoque < qtd) {
      problemas.push(`"${achado.nome}": só há ${Math.max(0, achado.estoque)} em estoque (pediram ${qtd}).`);
      continue;
    }
    itens.push({
      produto: achado.nome, quantidade: qtd, preco: achado.preco, subtotal: Math.round(achado.preco * qtd * 100) / 100,
      ...(achado.tabela_id ? { tabela_id: achado.tabela_id, linha_id: achado.linha_id, estoque_chave: achado.estoqueChave } : {}),
    });
  }
  return { itens, problemas };
}

export async function fecharPedido(
  db: SupabaseClient,
  ctx: { ownerId: string; assistantId: string; conversationId: string; negocio: string; teste: boolean },
  args: { itens?: { produto: string; quantidade: number }[]; cliente_nome?: string },
  tabelas: TabelaPedido[],
  catalogo: Record<string, string>[],
) {
  const pedidos = Array.isArray(args.itens) ? args.itens.slice(0, 30) : [];
  if (!pedidos.length) return { erro: 'Diga quais produtos e quantas unidades.' };
  const conta = await contaDaLoja(db, ctx.ownerId);
  if (!conta) return { erro: 'O pagamento pelo chat não está ligado nesta empresa. Ofereça a equipe para fechar a compra.' };

  const { itens, problemas } = await montarItens(db, pedidos, tabelas, catalogo);
  if (problemas.length) return { erro: 'O pedido NÃO foi criado.', problemas };
  const total = Math.round(itens.reduce((s, i) => s + i.subtotal, 0) * 100) / 100;

  const { data: ped, error } = await db.from('pedidos').insert({
    owner_id: ctx.ownerId, assistant_id: ctx.assistantId, conversation_id: ctx.conversationId,
    itens, total, cliente_nome: String(args.cliente_nome ?? '').trim().slice(0, 120) || null, numero: 0,
  }).select('id, numero').single();
  if (error || !ped) throw error ?? new Error('pedido não criado');

  const descricao = itens.map((i) => `${i.quantidade}x ${i.produto}`).join(', ').slice(0, 450);
  let link: { id: string; url: string };
  try {
    link = await conta.pedir<{ id: string; url: string }>('/paymentLinks', {
      method: 'POST',
      body: {
        name: `Pedido ${ped.numero}${ctx.negocio ? ` — ${ctx.negocio}` : ''}`.slice(0, 100),
        description: descricao,
        value: total,
        billingType: 'UNDEFINED', // a pessoa escolhe: Pix, cartão ou boleto
        chargeType: 'DETACHED',
        dueDateLimitDays: 3,
        notificationEnabled: false,
        externalReference: ped.id,
      },
    });
  } catch (e) {
    await db.from('pedidos').update({ status: 'cancelado' }).eq('id', ped.id);
    console.error('[pedido] link', (e as Error).message);
    return { erro: 'Não consegui gerar o link de pagamento agora. Peça desculpas e ofereça a equipe para fechar a compra.' };
  }
  await db.from('pedidos').update({ link_id: link.id, link_url: link.url }).eq('id', ped.id);

  return {
    ok: true,
    pedido: ped.numero,
    itens: itens.map((i) => `${i.quantidade}x ${i.produto} — ${reais(i.preco)}${i.quantidade > 1 ? ` (subtotal ${reais(i.subtotal)})` : ''}`),
    total: reais(total),
    link: link.url,
    mensagem: `Mande o resumo (itens e total ${reais(total)}) e o link exatamente como veio. Diga que dá para pagar com Pix, cartão ou boleto e que você confirma aqui mesmo assim que o pagamento cair.${
      ctx.teste ? ' (É um teste do dono: o link é de verdade no ambiente configurado.)' : ''
    }`,
  };
}

/**
 * O Asaas da empresa avisou de um pagamento. Se for de um pedido do
 * assistente: marca como pago, baixa o estoque e avisa o cliente no chat.
 */
export async function pagamentoDaLoja(db: SupabaseClient, ownerId: string, evento: { event?: string; payment?: Record<string, unknown> }) {
  const pg = evento.payment ?? {};
  const linkId = String(pg.paymentLink ?? '');
  if (!linkId || !pago(String(pg.status), evento.event)) return;
  const { data: ped } = await db.from('pedidos').select('*').eq('owner_id', ownerId).eq('link_id', linkId).maybeSingle();
  if (!ped || ped.status === 'pago') return;

  const { data: mudou } = await db.from('pedidos')
    .update({ status: 'pago', pago_em: new Date().toISOString(), pagamento_id: String(pg.id ?? ''), forma: FORMA[String(pg.billingType)] ?? null })
    .eq('id', ped.id).eq('status', 'aguardando').select('id');
  if (!mudou?.length) return; // outro aviso já tratou

  // baixa de estoque nas linhas da tabela
  for (const it of (ped.itens ?? []) as Item[]) {
    if (!it.linha_id || !it.estoque_chave) continue;
    const { data: linha } = await db.from('tabela_linhas').select('dados').eq('id', it.linha_id).maybeSingle();
    const atual = Number(String(linha?.dados?.[it.estoque_chave] ?? '').replace(',', '.'));
    if (!linha || !Number.isFinite(atual)) continue;
    await db.from('tabela_linhas').update({ dados: { ...linha.dados, [it.estoque_chave]: String(Math.max(0, atual - it.quantidade)) } }).eq('id', it.linha_id);
  }

  const texto = `Pagamento do pedido nº ${ped.numero} confirmado (${reais(Number(ped.total))}). Obrigado pela compra! A equipe já foi avisada para seguir com o pedido.`;
  if (ped.conversation_id) {
    await db.from('conversation_messages').insert({ conversation_id: ped.conversation_id, role: 'system', author_name: 'evento:pago', content: texto });
    const { data: conv } = await db.from('conversations').select('canal_id, contato_externo').eq('id', ped.conversation_id).maybeSingle();
    if (conv?.canal_id && conv.contato_externo) {
      const { data: canal } = await db.from('canais').select('*').eq('id', conv.canal_id).maybeSingle();
      if (canal) await enviarPeloCanal(db, canal as Canal, conv.contato_externo, `✅ ${texto}`).catch((e) => console.warn('[pedido] canal', e?.message));
    }
  }
  await db.from('alertas').insert({
    owner_id: ownerId, assistant_id: ped.assistant_id, conversation_id: ped.conversation_id, origem: 'sistema',
    assunto: `Pedido nº ${ped.numero} pago — ${reais(Number(ped.total))}`.slice(0, 160),
    detalhe: ((ped.itens ?? []) as Item[]).map((i) => `${i.quantidade}x ${i.produto}`).join(', ').slice(0, 1000),
    chave: `pedido:${ped.id}`,
  });

  // o link já cumpriu o papel: tira do ar para ninguém pagar duas vezes
  const conta = await contaDaLoja(db, ownerId);
  await conta?.pedir(`/paymentLinks/${linkId}`, { method: 'DELETE' }).catch(() => {});
}
