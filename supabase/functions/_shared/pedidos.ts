// ============================================================
// Vendas pelo assistente.
//
// fecharPedido   → o assistente fecha a compra: os preços vêm da tabela
//                  (nunca do que a IA escreveu), confere o estoque, gera
//                  o link de pagamento na conta Asaas da empresa e devolve
//                  o link para mandar no chat (site, WhatsApp, Instagram,
//                  Discord — é só texto)
// cobrarHorario  → horário que só confirma pago: o pedido é o serviço
// pagamentoDaLoja → o Asaas avisou que pagaram: marca o pedido, baixa o
//                  estoque (se o dono quiser) ou confirma o horário, e
//                  avisa o cliente na mesma conversa e canal
// ============================================================

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { asaas, type Ambiente, type ClienteAsaas, FORMA, pago } from './asaas.ts';
import { buscar } from './busca.ts';
import { linhasDasTabelas } from './fontes.ts';
import { type Canal, enviarPeloCanal, noPrivadoDoDiscord } from './canais.ts';
import { horarioPago, RESERVA_MIN } from './agenda.ts';
import { type PlanId, TAXA_VENDAS } from './plans.ts';

const reais = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** "1.499,90", "R$ 79,9", "1499.9" → número */
export function lerPreco(v: unknown): number | null {
  let s = String(v ?? '').replace(/[^\d.,-]/g, '');
  if (!s) return null;
  const virgula = s.lastIndexOf(',');
  const ponto = s.lastIndexOf('.');
  if (virgula > ponto) s = s.replace(/\./g, '').replace(',', '.'); // 1.234,56
  else if (virgula >= 0) s = s.replace(/,/g, ''); // 1,234.56
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, ''); // 12.000 é doze mil, não doze
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

/** A conta Asaas da empresa, se ela ligou o recebimento. */
export async function contaDaLoja(db: SupabaseClient, ownerId: string, mesmoPausada = false): Promise<ClienteAsaas | null> {
  const { data: rec } = await db.from('recebimentos').select('ambiente, ativo').eq('owner_id', ownerId).maybeSingle();
  // pausar as vendas não impede conferir um pagamento que já estava a caminho
  if (!rec || (!rec.ativo && !mesmoPausada)) return null;
  const { data: chave } = await db.rpc('helpy_recebimento_segredo', { p_conta: ownerId });
  return chave ? asaas(String(chave), rec.ambiente as Ambiente) : null;
}

export async function vendeOnline(db: SupabaseClient, ownerId: string): Promise<boolean> {
  const [{ data }, { count: atrasadas }] = await Promise.all([
    db.from('recebimentos').select('ativo').eq('owner_id', ownerId).maybeSingle(),
    // fatura do Helpy (taxa de vendas / uso extra) vencida: a venda pelo chat para até ser paga
    db.from('uso_extra').select('owner_id', { count: 'exact', head: true }).eq('owner_id', ownerId).eq('status', 'atrasado'),
  ]);
  return !!data?.ativo && !(atrasadas ?? 0);
}

type TabelaPedido = { id: string; nome: string; fonte: string; colunas: { chave: string; rotulo: string }[] };
type Item = { produto: string; quantidade: number; preco: number; subtotal: number; tabela_id?: string; linha_id?: string; estoque_chave?: string };

/**
 * Acha cada produto pedido nas tabelas do assistente (ou nas listas do
 * documento) e confere preço e estoque.
 */
export async function montarItens(
  db: SupabaseClient,
  pedidos: { produto: string; quantidade: number }[],
  tabelas: TabelaPedido[],
  catalogo: Record<string, string>[],
): Promise<{ itens: Item[]; problemas: string[] }> {
  const locais = tabelas.filter((t) => t.fonte === 'manual' || t.fonte === 'url');
  const ids = locais.map((t) => t.id);
  const [{ data: linhas }, { data: tipos }] = await Promise.all([
    linhasDasTabelas<{ id: string; tabela_id: string; dados: Record<string, string> }>(db, ids, 'id, tabela_id, dados').then((data) => ({ data })),
    ids.length ? db.from('tabela_colunas').select('tabela_id, chave, rotulo, tipo').in('tabela_id', ids) : Promise.resolve({ data: [] }),
  ]);
  const colunasDe = (tid: string) => (tipos ?? []).filter((c) => c.tabela_id === tid);
  const precoChave = (tid: string) =>
    colunasDe(tid).find((c) => c.tipo === 'moeda')?.chave ?? colunasDe(tid).find((c) => /preco|valor|price/i.test(`${c.chave} ${c.rotulo}`))?.chave;
  const estoqueChave = (tid: string) => colunasDe(tid).find((c) => /estoque|quantidade|qtd|stock/i.test(`${c.chave} ${c.rotulo}`))?.chave;
  // a coluna com o nome do produto: primeiro pelo rótulo que a pessoa vê (a chave pode ter
  // sobrado de um título, como "catalogo_de_produtos"), nunca a de código/SKU
  const NOME = /produto|nome|item|titulo|título|modelo|servi/i;
  const ehCodigo = (c: { rotulo: string }) => /\b(sku|c[oó]d(igo)?|ref(er[eê]ncia)?|id|ean)\b/i.test(c.rotulo);
  const colunaDoNome = (t: TabelaPedido) =>
    t.colunas.find((c) => !ehCodigo(c) && NOME.test(c.rotulo)) ??
      t.colunas.find((c) => !ehCodigo(c) && NOME.test(`${c.chave} ${c.rotulo}`)) ??
      t.colunas[0];

  const registros = [
    ...(linhas ?? []).map((l) => {
      const t = locais.find((x) => x.id === l.tabela_id)!;
      const principais = t.colunas.filter((c, i) => i === 0 || /nome|produto|servi|item|titulo|modelo/i.test(`${c.chave} ${c.rotulo}`));
      return {
        // o nome que aparece no pedido e no link: a coluna de nome do produto (não o código/SKU)
        nome: String(l.dados?.[colunaDoNome(t)?.chave] ?? '') ||
          String(l.dados?.[t.colunas[0]?.chave] ?? ''),
        forte: principais.map((c) => String(l.dados?.[c.chave] ?? '')).join(' '),
        resto: Object.values(l.dados ?? {}).join(' '),
        preco: lerPreco(l.dados?.[precoChave(t.id) ?? '']),
        estoqueChave: estoqueChave(t.id),
        // célula de estoque vazia = não controla estoque (não é "zero")
        estoque: estoqueChave(t.id) && String(l.dados?.[estoqueChave(t.id)!] ?? '').trim() !== ''
          ? Number(String(l.dados?.[estoqueChave(t.id)!]).replace(',', '.'))
          : null,
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
    const pedida = Math.floor(Number(p.quantidade));
    if (!Number.isFinite(pedida) || pedida < 1) {
      problemas.push(`"${p.produto}": quantidade inválida (${p.quantidade}). Confirme quantas unidades a pessoa quer.`);
      continue;
    }
    const qtd = Math.min(99, pedida);
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

/** Link de pagamento no Asaas da empresa: a pessoa escolhe Pix, cartão ou boleto. */
async function criarLink(conta: ClienteAsaas, pedidoId: string, nome: string, descricao: string, valor: number, dias: number) {
  try {
    return await conta.pedir<{ id: string; url: string }>('/paymentLinks', {
      method: 'POST',
      body: {
        name: nome.slice(0, 100), description: descricao, value: valor,
        billingType: 'UNDEFINED', chargeType: 'DETACHED', dueDateLimitDays: dias,
        notificationEnabled: false, externalReference: pedidoId,
      },
    });
  } catch (e) {
    console.error('[pedido] link', (e as Error).message);
    return null;
  }
}

/**
 * Frete pela regra que a empresa escreveu ("R$ 12", "grátis acima de R$ 100,
 * senão R$ 12", "só retirada", "grátis"). O Asaas não calcula frete. Regra que
 * não dá para ler com segurança (vários valores sem um padrão conhecido) vale
 * como "sem frete definido": o pedido com entrega não fecha e a empresa é avisada.
 */
export function freteDaRegra(regra: string, subtotal: number): { valor: number | null; soRetirada: boolean } {
  const r = regra.toLowerCase();
  if (!r.trim()) return { valor: null, soRetirada: false };
  const soRetirada = /(s[oó]|apenas|somente)\s+(a\s+)?retirada|retirada\s+(apenas|somente)|n[aã]o\s+(fazemos|faz|temos)\s+entrega/.test(r);
  const gratis = /gr[aá]tis/.test(r);
  // "acima de R$ 100" / "a partir de 100 reais" em qualquer lugar do texto, quando há "grátis"
  const marco = gratis ? /(?:acima|a partir|mais)\s+de\s+(?:r\$\s*)?([\d.,]+)/.exec(r) : null;
  const limite = marco ? lerPreco(marco[1]) : null;
  const valores = [...r.matchAll(/r\$\s*([\d.,]+)|([\d.,]+)\s*reais/g)]
    .map((m, _i, _a) => ({ v: lerPreco(m[1] ?? m[2]), em: m.index ?? 0 }))
    .filter((x) => x.v != null && !(marco && x.em >= (marco.index ?? 0) && x.em <= (marco.index ?? 0) + marco[0].length))
    .map((x) => x.v as number);
  const distintos = [...new Set(valores)];
  if (limite != null && subtotal >= limite) return { valor: 0, soRetirada };
  if (distintos.length === 1) return { valor: distintos[0], soRetirada };
  if (distintos.length === 0 && gratis && limite == null) return { valor: 0, soRetirada };
  return { valor: null, soRetirada };
}

/** O Asaas não gera cobrança abaixo de R$ 5. */
export const MINIMO_COBRANCA = 5;

/** Quanto cobrar para marcar: o valor do serviço ou o sinal ("30%", "R$ 20"). */
export function valorDaReserva(valorServico: number | undefined, sinal: string | null): number | null {
  if (sinal === null) return valorServico && valorServico > 0 ? Math.round(valorServico * 100) / 100 : null;
  const pct = /(\d+(?:[.,]\d+)?)\s*%/.exec(sinal);
  if (pct) {
    if (!valorServico) return null;
    return Math.round(valorServico * Math.min(100, Number(pct[1].replace(',', '.')))) / 100;
  }
  return lerPreco(sinal);
}

/**
 * Horário que só confirma pago: o pedido é o serviço (ou o sinal) e o
 * horário fica guardado até o pagamento cair.
 */
export async function cobrarHorario(
  db: SupabaseClient,
  ctx: { ownerId: string; assistantId: string; conversationId: string | null; negocio: string; teste: boolean },
  ag: { id: string; quando: string; servico?: string; valorServico?: number; cobrar: number; sinal: boolean; cliente_nome?: string },
) {
  const conta = await contaDaLoja(db, ctx.ownerId);
  const desfazer = async (msg: string) => {
    await db.from('agendamentos').update({ status: 'cancelado' }).eq('id', ag.id);
    return { erro: msg };
  };
  if (!conta) return desfazer('O pagamento pelo chat não está ligado. O horário NÃO foi marcado: ofereça a equipe.');
  const rotulo = `${ag.sinal ? 'Sinal · ' : ''}${ag.servico || 'Horário'} · ${ag.quando}`.slice(0, 200);
  const { data: ped, error } = await db.from('pedidos').insert({
    owner_id: ctx.ownerId, assistant_id: ctx.assistantId, conversation_id: ctx.conversationId,
    tipo: 'agendamento', agendamento_id: ag.id, numero: 0,
    itens: [{ produto: rotulo, quantidade: 1, preco: ag.cobrar, subtotal: ag.cobrar }],
    total: ag.cobrar, cliente_nome: ag.cliente_nome?.trim().slice(0, 120) || null,
  }).select('id, numero').single();
  if (error || !ped) return desfazer('Não consegui registrar a cobrança. O horário NÃO foi marcado: peça desculpas e ofereça a equipe.');
  const link = await criarLink(conta, ped.id, `${ag.servico || 'Horário'}${ctx.negocio ? ` — ${ctx.negocio}` : ''}`, rotulo, ag.cobrar, 1);
  if (!link) {
    await db.from('pedidos').update({ status: 'cancelado' }).eq('id', ped.id);
    return desfazer('Não consegui gerar o link de pagamento. O horário NÃO foi marcado: peça desculpas e ofereça a equipe.');
  }
  await db.from('pedidos').update({ link_id: link.id, link_url: link.url }).eq('id', ped.id);
  await db.from('agendamentos').update({ pedido_id: ped.id }).eq('id', ag.id);
  const resto = ag.sinal && ag.valorServico && ag.valorServico > ag.cobrar ? ag.valorServico - ag.cobrar : 0;
  return {
    ok: true,
    situacao: 'GUARDADO, AINDA NÃO CONFIRMADO: o horário só confirma quando o pagamento cair.',
    quando: ag.quando,
    valor: reais(ag.cobrar),
    link: link.url,
    mensagem: `Diga que o horário (${ag.quando}) está guardado por ${RESERVA_MIN / 60} horas e só confirma com o pagamento de ${reais(ag.cobrar)}${
      ag.sinal ? ` (sinal${resto ? `; o resto, ${reais(resto)}, é pago no dia` : ''})` : ''
    }. Mande o link exatamente como veio (Pix, cartão ou boleto) e diga que você confirma aqui mesmo quando o pagamento cair.${
      ctx.teste ? ' (É um teste do dono: o link é de verdade no ambiente configurado.)' : ''
    }`,
  };
}

/** Cancela um pedido que ainda não foi pago e tira o link do ar. */
export async function cancelarPedido(db: SupabaseClient, ownerId: string, pedidoId: string) {
  const { data: ped } = await db.from('pedidos').update({ status: 'cancelado' })
    .eq('id', pedidoId).eq('owner_id', ownerId).eq('status', 'aguardando').select('link_id').maybeSingle();
  if (ped?.link_id) {
    const conta = await contaDaLoja(db, ownerId);
    await conta?.pedir(`/paymentLinks/${ped.link_id}`, { method: 'DELETE' }).catch(() => {});
  }
}

export async function fecharPedido(
  db: SupabaseClient,
  ctx: { ownerId: string; assistantId: string; conversationId: string; negocio: string; teste: boolean; baixarEstoque: boolean; regraFrete?: string },
  args: { itens?: { produto: string; quantidade: number }[]; cliente_nome?: string; entrega?: string; endereco?: string },
  tabelas: TabelaPedido[],
  catalogo: Record<string, string>[],
) {
  const pedidos = Array.isArray(args.itens) ? args.itens.slice(0, 30) : [];
  if (!pedidos.length) return { erro: 'Diga quais produtos e quantas unidades.' };
  const conta = await contaDaLoja(db, ctx.ownerId);
  if (!conta) return { erro: 'O pagamento pelo chat não está ligado nesta empresa. Ofereça a equipe para fechar a compra.' };

  const { itens: achados, problemas } = await montarItens(db, pedidos, tabelas, catalogo);
  if (problemas.length) return { erro: 'O pedido NÃO foi criado.', problemas };
  // sem baixa de estoque: o item não leva a coluna, e o pagamento não mexe na tabela
  const itens = ctx.baixarEstoque ? achados : achados.map(({ estoque_chave: _, ...i }) => i);
  const subtotal = Math.round(itens.reduce((s, i) => s + i.subtotal, 0) * 100) / 100;

  // entrega ou retirada: o frete sai da regra da empresa, nunca da conversa
  const regra = freteDaRegra(ctx.regraFrete ?? '', subtotal);
  const entrega = args.entrega === 'retirada' || regra.soRetirada ? 'retirada' : args.entrega === 'entrega' ? 'entrega' : null;
  const endereco = String(args.endereco ?? '').trim().slice(0, 300);
  // com regra de frete, precisa saber se entrega ou retira (produto digital, sem regra, segue sem)
  if (!entrega && (ctx.regraFrete ?? '').trim()) {
    return { erro: 'O pedido NÃO foi criado: falta saber se é entrega ou retirada.', mensagem: 'Pergunte se a pessoa quer receber em casa ou retirar (conforme a ficha) antes de fechar.' };
  }
  if (entrega === 'entrega' && endereco.length < 8) {
    return { erro: 'O pedido NÃO foi criado: falta o endereço de entrega.', mensagem: 'Peça o endereço completo (rua, número, bairro e cidade) antes de fechar.' };
  }
  const frete = entrega === 'entrega' && regra.valor != null ? regra.valor : null;
  // entrega sem regra de frete: o cliente pagaria sem saber o frete (nem se entregam lá).
  // Não gera o link; o dono fica sabendo para definir a regra
  if (entrega === 'entrega' && regra.valor == null) {
    await db.from('alertas').insert({
      owner_id: ctx.ownerId, assistant_id: ctx.assistantId, conversation_id: ctx.conversationId, origem: 'sistema',
      chave: `frete:sem-regra:${ctx.assistantId}:${new Date().toISOString().slice(0, 10)}`,
      assunto: 'Venda com entrega parada: falta a regra de frete',
      detalhe: `Um cliente quis receber em: ${endereco}. Sem regra de frete o assistente não gera o link de entrega. Preencha "Frete na venda pelo chat" no assistente (ex.: "R$ 12", "grátis acima de R$ 100, senão R$ 12" ou "só retirada").`,
    }).then(() => {}, () => {});
    return {
      erro: 'O pedido NÃO foi criado: a loja ainda não definiu o frete para entrega pelo chat.',
      mensagem: 'Explique que o frete para entrega ainda não está definido por aqui, então você não gera o link com entrega. Se a ficha permitir retirada, ofereça retirar. Se não, diga que a equipe combina a entrega e o pagamento com ela e ofereça chamar a equipe. Não invente valor de frete.',
    };
  }
  const total = Math.round((subtotal + (frete ?? 0)) * 100) / 100;
  // o Asaas não gera cobrança abaixo de R$ 5: nem cria o pedido (senão fica um pedido sem link)
  if (total < MINIMO_COBRANCA) {
    return {
      erro: 'O pedido NÃO foi criado: o pagamento pelo link começa em R$ 5,00.',
      total: reais(total),
      mensagem: `Explique com naturalidade que o pagamento pelo link começa em ${reais(MINIMO_COBRANCA)} e o pedido deu ${reais(total)}. Ofereça completar com outro item (sugira algo do catálogo que combine) ou, se a pessoa preferir só esse item, combinar o pagamento com a equipe (abra chamado se ela aceitar). Nunca invente desconto ou taxa.`,
    };
  }

  const { data: ped, error } = await db.from('pedidos').insert({
    owner_id: ctx.ownerId, assistant_id: ctx.assistantId, conversation_id: ctx.conversationId,
    itens, total, cliente_nome: String(args.cliente_nome ?? '').trim().slice(0, 120) || null, numero: 0,
    entrega, endereco: entrega === 'entrega' ? endereco : null, frete,
  }).select('id, numero').single();
  if (error || !ped) throw error ?? new Error('pedido não criado');

  const descricao = [
    itens.map((i) => `${i.quantidade}x ${i.produto}`).join(', '),
    frete ? `frete ${reais(frete)}` : entrega === 'retirada' ? 'retirada no local' : '',
  ].filter(Boolean).join(' + ').slice(0, 450);
  const link = await criarLink(conta, ped.id, `Pedido ${ped.numero}${ctx.negocio ? ` — ${ctx.negocio}` : ''}`, descricao, total, 3);
  if (!link) {
    await db.from('pedidos').update({ status: 'cancelado' }).eq('id', ped.id);
    return { erro: 'Não consegui gerar o link de pagamento agora. Peça desculpas e ofereça a equipe para fechar a compra.' };
  }
  await db.from('pedidos').update({ link_id: link.id, link_url: link.url }).eq('id', ped.id);
  // chat do site: o pedido vira um recibo na conversa, com o botão de pagar;
  // ticket do Discord: o link também vai no privado, para não se perder no servidor
  let noSite = false;
  if (ctx.conversationId) {
    const { data: conv } = await db.from('conversations').select('canal_id, contato_externo').eq('id', ctx.conversationId).maybeSingle();
    noSite = !!conv && !conv.canal_id;
    if (noSite) {
      await db.from('conversation_messages').insert({
        conversation_id: ctx.conversationId, role: 'system', author_name: 'evento:pedido',
        content: [
          `Pedido nº ${ped.numero} · ${reais(total)}`,
          ...itens.map((i) => `${i.quantidade}x ${i.produto} — ${reais(i.subtotal)}`),
          frete ? `Frete — ${reais(frete)}` : entrega === 'retirada' ? 'Retirada no local' : '',
          `Pagar: ${link.url}`,
        ].filter(Boolean).join('\n'),
      });
    }
    if (conv?.canal_id && String(conv.contato_externo ?? '').startsWith('ticket:')) {
      const { data: canal } = await db.from('canais').select('*').eq('id', conv.canal_id).maybeSingle();
      if (canal?.tipo === 'discord') {
        await noPrivadoDoDiscord(db, canal as Canal, String(conv.contato_externo).slice(7), [
          `🧾 **Pedido nº ${ped.numero}** — ${reais(total)}`,
          ...itens.map((i) => `• ${i.quantidade}x ${i.produto} — ${reais(i.subtotal)}`),
          frete ? `• Frete — ${reais(frete)}` : entrega === 'retirada' ? '• Retirada no local' : '',
          '',
          `Pagar (Pix, cartão ou boleto): ${link.url}`,
          'Assim que o pagamento cair, a confirmação chega aqui e no atendimento.',
        ].filter((l, i, a) => l !== '' || a[i - 1] !== '').join('\n'));
      }
    }
  }

  return {
    ok: true,
    pedido: ped.numero,
    itens: itens.map((i) => `${i.quantidade}x ${i.produto} — ${reais(i.preco)}${i.quantidade > 1 ? ` (subtotal ${reais(i.subtotal)})` : ''}`),
    frete: frete != null ? reais(frete) : entrega === 'retirada' ? 'retirada no local' : 'sem frete',
    total: reais(total),
    link: noSite ? 'já está no recibo na tela (não repita)' : link.url,
    mensagem: `${noSite
      ? `O pedido já apareceu na tela como um recibo (itens, ${frete ? 'frete, ' : ''}total e o botão "Pagar agora"). NÃO repita a lista de itens nem o link: diga em uma frase curta que o pedido nº ${ped.numero} (${reais(total)}) está logo acima, pronto para pagar.`
      : `Mande o resumo (itens${frete ? `, frete ${reais(frete)}` : entrega === 'retirada' ? ', retirada no local' : ''} e total ${reais(total)}) e o link exatamente como veio.`} Não pergunte a forma de pagamento: no link a pessoa escolhe Pix (com QR code), cartão ou boleto. Diga em uma frase o que acontece depois: assim que o pagamento cair, a confirmação aparece aqui mesmo (com o número do pedido, ${ped.numero}), e a loja segue com ${entrega === 'retirada' ? 'a retirada' : 'a entrega'}. Não ofereça incluir itens neste pedido: o link já tem o valor fechado.${
      ctx.teste ? ' (É um teste do dono: o link é de verdade no ambiente configurado.)' : ''
    }`,
  };
}

/**
 * Taxa do Helpy sobre a venda paga (% do plano), somada no mês e cobrada com o
 * uso extra. Contas isentas (testes da casa) não pagam.
 */
async function cobrarTaxa(db: SupabaseClient, ownerId: string, pedidoId: string, total: number) {
  const { data: p } = await db.from('profiles').select('plan, cobranca_isenta').eq('id', ownerId).maybeSingle();
  if (!p || p.cobranca_isenta) return;
  const taxa = Math.round(total * (TAXA_VENDAS[(p.plan ?? 'trial') as PlanId] ?? TAXA_VENDAS.trial)) / 100;
  if (!(taxa > 0)) return;
  await db.from('pedidos').update({ taxa }).eq('id', pedidoId);
  const { error } = await db.rpc('helpy_somar_taxa', { p_owner: ownerId, p_valor: taxa });
  if (error) console.error('[pedido] taxa', error.message);
}

/** Venda devolvida: a taxa dela sai do mês (se ainda não foi faturada). */
export async function tirarTaxa(db: SupabaseClient, ownerId: string, taxa: number) {
  if (!(taxa > 0)) return;
  const { error } = await db.rpc('helpy_somar_taxa', { p_owner: ownerId, p_valor: -taxa });
  if (error) console.error('[pedido] taxa', error.message);
}

/**
 * Mensagem na conversa (e no canal de onde o cliente escreveu: WhatsApp, Instagram, Discord).
 * No ticket do Discord vai também no privado do cliente (`privado`, se vier, é a versão completa).
 */
async function avisarCliente(db: SupabaseClient, conversationId: string | null, evento: string, texto: string, privado?: string) {
  if (!conversationId) return;
  await db.from('conversation_messages').insert({ conversation_id: conversationId, role: 'system', author_name: `evento:${evento}`, content: texto });
  const { data: conv } = await db.from('conversations').select('canal_id, contato_externo').eq('id', conversationId).maybeSingle();
  if (conv?.canal_id && conv.contato_externo) {
    const { data: canal } = await db.from('canais').select('*').eq('id', conv.canal_id).maybeSingle();
    if (canal) {
      await enviarPeloCanal(db, canal as Canal, conv.contato_externo, `✅ ${texto}`).catch((e) => console.warn('[pedido] canal', e?.message));
      if (canal.tipo === 'discord' && conv.contato_externo.startsWith('ticket:')) {
        await noPrivadoDoDiscord(db, canal as Canal, conv.contato_externo.slice(7), `✅ ${privado ?? texto}`);
      }
    }
  }
}

/**
 * O Asaas da empresa avisou de um pagamento. Se for de um pedido do
 * assistente: marca como pago, baixa o estoque (venda) ou confirma o
 * horário (agendamento), e avisa o cliente no chat.
 */
export async function pagamentoDaLoja(db: SupabaseClient, ownerId: string, evento: { event?: string; payment?: Record<string, unknown> }) {
  const pg = evento.payment ?? {};
  const linkId = String(pg.paymentLink ?? '');
  if (!linkId) return;
  // devolução parcial: o pedido segue pago e a taxa do Helpy continua (só a equipe fica sabendo)
  if (evento.event === 'PAYMENT_PARTIALLY_REFUNDED') {
    const { data: ped } = await db.from('pedidos').select('numero, assistant_id, conversation_id').eq('owner_id', ownerId).eq('link_id', linkId).maybeSingle();
    if (ped) {
      await db.from('alertas').insert({
        owner_id: ownerId, assistant_id: ped.assistant_id, conversation_id: ped.conversation_id, origem: 'sistema',
        chave: `pedido:parcial:${pg.id}`, assunto: `Parte do pedido nº ${ped.numero} foi devolvida`.slice(0, 160),
        detalhe: 'O pedido continua como pago. Se foi engano, confira no Asaas.',
      });
    }
    return;
  }
  // devolvido inteiro pelo Asaas ou contestado no cartão (chargeback): vale como estorno
  if (['PAYMENT_REFUNDED', 'PAYMENT_CHARGEBACK_REQUESTED'].includes(String(evento.event))) {
    const { data: dev } = await db.from('pedidos').update({ status: 'estornado' })
      .eq('owner_id', ownerId).eq('link_id', linkId).eq('pagamento_id', String(pg.id ?? '')).eq('status', 'pago')
      .select('taxa, agendamento_id, conversation_id, total, tipo');
    const d = dev?.[0];
    if (d) {
      await tirarTaxa(db, ownerId, Number(d.taxa));
      if (d.agendamento_id) await db.from('agendamentos').update({ status: 'cancelado' }).eq('id', d.agendamento_id);
      await avisarCliente(db, d.conversation_id, 'cancelado',
        `${d.tipo === 'agendamento' ? 'Horário cancelado. ' : ''}O valor de ${reais(Number(d.total))} foi devolvido pela mesma forma de pagamento.`);
    }
    return;
  }
  if (!pago(String(pg.status), evento.event)) return;
  const { data: ped } = await db.from('pedidos').select('*').eq('owner_id', ownerId).eq('link_id', linkId).maybeSingle();
  if (!ped) return;
  // confere no próprio Asaas da loja: o pagamento existe, é deste link e tem o valor do pedido.
  // Sem conseguir conferir (Asaas fora do ar), não marca como pago: o erro faz o Asaas avisar de novo
  const contaConferir = await contaDaLoja(db, ownerId, true);
  if (!contaConferir || !pg.id) throw new Error('pagamento da loja sem como conferir no Asaas');
  const real = await contaConferir.pedir<{ paymentLink?: string; value?: number; status?: string }>(`/payments/${String(pg.id)}`);
  if (real && (String(real.paymentLink ?? '') !== linkId || Number(real.value ?? 0) + 0.01 < Number(ped.total) || !pago(String(real.status), undefined))) {
    await db.from('alertas').insert({
      owner_id: ownerId, assistant_id: ped.assistant_id, conversation_id: ped.conversation_id, origem: 'sistema',
      chave: `pedido:conferir:${pg.id}`, assunto: `Pagamento do pedido nº ${ped.numero} não confere`.slice(0, 160),
      detalhe: `O aviso de pagamento não bate com o Asaas (valor ${reais(Number(real.value ?? 0))} para um pedido de ${reais(Number(ped.total))}). O pedido não foi marcado como pago. Confira no Asaas.`,
    });
    return;
  }
  if (ped.status === 'pago' || ped.status === 'estornado') {
    // o mesmo link pago de novo (outro Pix, cartão em outra aba): o dinheiro entrou sem pedido
    if (pg.id && String(pg.id) !== String(ped.pagamento_id ?? '')) {
      await db.from('alertas').insert({
        owner_id: ownerId, assistant_id: ped.assistant_id, conversation_id: ped.conversation_id, origem: 'sistema',
        chave: `pedido:dup:${pg.id}`,
        assunto: `Pagamento em dobro — pedido nº ${ped.numero}`.slice(0, 160),
        detalhe: `O cliente pagou de novo o link do pedido nº ${ped.numero} (${reais(Number(pg.value ?? ped.total))}). Devolva o valor pelo Asaas ou combine com ele.`,
      });
    }
    return;
  }

  const { data: mudou } = await db.from('pedidos')
    .update({ status: 'pago', pago_em: new Date().toISOString(), pagamento_id: String(pg.id ?? ''), forma: FORMA[String(pg.billingType)] ?? null })
    .eq('id', ped.id).in('status', ['aguardando', 'cancelado']).select('id');
  if (!mudou?.length) return; // outro aviso já tratou
  await cobrarTaxa(db, ownerId, ped.id, Number(ped.total));

  const conta = await contaDaLoja(db, ownerId);
  // o link já cumpriu o papel: tira do ar para ninguém pagar duas vezes
  await conta?.pedir(`/paymentLinks/${linkId}`, { method: 'DELETE' }).catch(() => {});
  const alerta = (assunto: string, detalhe: string) => db.from('alertas').insert({
    owner_id: ownerId, assistant_id: ped.assistant_id, conversation_id: ped.conversation_id, origem: 'sistema',
    assunto: assunto.slice(0, 160), detalhe: detalhe.slice(0, 1000), chave: `pedido:${ped.id}`,
  });
  const lista = ((ped.itens ?? []) as Item[]).map((i) => `${i.quantidade}x ${i.produto}`).join(', ');

  // pagaram um pedido que já tinha sido cancelado: o dinheiro entrou, a equipe decide
  if (ped.status === 'cancelado') {
    await alerta(`Pagamento de pedido cancelado — nº ${ped.numero} (${reais(Number(ped.total))})`,
      `O cliente pagou depois que o pedido foi cancelado. Combine com ele: seguir com o pedido ou devolver o valor pelo Asaas. ${lista}`);
    await avisarCliente(db, ped.conversation_id, 'pago', `Recebemos o seu pagamento de ${reais(Number(ped.total))}. A equipe vai falar com você para seguir.`);
    return;
  }

  if (ped.tipo === 'agendamento' && ped.agendamento_id) {
    const { data: a } = await db.from('assistants').select('config').eq('id', ped.assistant_id).maybeSingle();
    const usar = String((a?.config as { fields?: Record<string, { value?: string }> })?.fields?.usar_agenda?.value ?? '');
    const r = await horarioPago(db, ped.agendamento_id, /confirmo/i.test(usar));
    if (r.situacao === 'confirmado') {
      await avisarCliente(db, ped.conversation_id, 'agendado', `Pagamento confirmado (${reais(Number(ped.total))}). Seu horário está marcado: ${r.quando}.`);
      await alerta(`Horário pago — ${reais(Number(ped.total))}`, `${ped.cliente_nome ?? 'Cliente'} · ${lista}`);
    } else if (r.situacao === 'pendente') {
      await avisarCliente(db, ped.conversation_id, 'pendente', `Pagamento confirmado (${reais(Number(ped.total))}). Agora o negócio confirma o horário (${r.quando}) e você recebe o aviso aqui.`);
      await alerta(`Horário pago esperando você confirmar — ${reais(Number(ped.total))}`, `${ped.cliente_nome ?? 'Cliente'} · ${lista}. Confirme em Agenda.`);
    } else {
      await avisarCliente(db, ped.conversation_id, 'pago', `Recebemos o seu pagamento de ${reais(Number(ped.total))}. A equipe vai falar com você para acertar o horário.`);
      await alerta(`Horário pago precisa de atenção — ${reais(Number(ped.total))}`,
        r.situacao === 'choque'
          ? `A reserva venceu antes do pagamento e outra pessoa pegou o horário. Remarque com o cliente ou devolva o valor. ${lista}`
          : `O pagamento caiu, mas o horário já tinha sido cancelado. Remarque com o cliente ou devolva o valor. ${lista}`);
    }
    return;
  }

  // venda: baixa de estoque nas linhas da tabela (só os itens que levaram a coluna de estoque)
  // (a baixa é uma conta só no banco: dois pagamentos juntos não perdem uma das vendas)
  const faltou: string[] = [];
  for (const it of (ped.itens ?? []) as Item[]) {
    if (!it.linha_id || !it.estoque_chave) continue;
    const { data: antes } = await db.rpc('helpy_baixar_estoque', { p_linha: it.linha_id, p_chave: it.estoque_chave, p_qtd: it.quantidade });
    if (antes != null && Number(antes) < it.quantidade) faltou.push(`${it.produto} (havia ${Math.max(0, Number(antes))}, venderam ${it.quantidade})`);
  }
  if (faltou.length) {
    await db.from('alertas').insert({
      owner_id: ownerId, assistant_id: ped.assistant_id, conversation_id: ped.conversation_id, origem: 'sistema',
      chave: `pedido:estoque:${ped.id}`, assunto: `Pedido nº ${ped.numero} pago sem estoque suficiente`.slice(0, 160),
      detalhe: `Outra venda levou as últimas unidades antes deste pagamento cair. Combine com o cliente: esperar a reposição ou devolver o valor. ${faltou.join('; ')}`.slice(0, 1000),
    });
  }
  const resumo = [
    `**Pedido nº ${ped.numero} confirmado** — ${reais(Number(ped.total))} (${FORMA[String(pg.billingType)] ?? 'pago'})`,
    ...((ped.itens ?? []) as Item[]).map((i) => `• ${i.quantidade}x ${i.produto} — ${reais(i.subtotal)}`),
    ped.frete ? `• Frete — ${reais(Number(ped.frete))}` : '',
    ped.entrega === 'entrega' && ped.endereco ? `Entrega em: ${ped.endereco}` : ped.entrega === 'retirada' ? 'Retirada no local.' : '',
    '',
    'Como funciona agora: a loja já foi avisada e separa o seu pedido. Se precisar de algo (prazo, troca, dúvida), é só escrever no seu atendimento.',
  ].filter((l, i, a) => l !== '' || (i > 0 && a[i - 1] !== '')).join('\n');
  await avisarCliente(db, ped.conversation_id, 'pago',
    `Pagamento do pedido nº ${ped.numero} confirmado (${reais(Number(ped.total))}). Obrigado pela compra! A equipe já foi avisada para seguir com o pedido.`, resumo);
  await alerta(`Pedido nº ${ped.numero} pago — ${reais(Number(ped.total))}`, lista);
}
