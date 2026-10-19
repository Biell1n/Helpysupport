// ============================================================
// pagamentos — cobrança dos planos e vendas pelo assistente (Asaas)
//
// Painel (com login):
//   status            → assinatura, faturas e se a empresa recebe pelo chat
//   assinar           → { plano, documento, nome } cria a assinatura e
//                       devolve o link da primeira fatura (Pix/cartão/boleto)
//   cancelar          → cancela a assinatura (vale até o fim do período pago)
//   loja_conectar     → { chave, ambiente } liga a conta Asaas da empresa
//   loja_desconectar  → desliga (a carteira só pausa: a conta continua da empresa)
//   carteira_ativar   → abre a Carteira Helpy (subconta Asaas no nome da empresa)
//   carteira          → saldo, a receber, extrato, saques e situação da conta
//   carteira_sacar    → { valor } saque por Pix para a chave CPF/CNPJ da própria empresa
//   pedido_cancelar   → { id } cancela um pedido que ainda não foi pago (e o horário que ele guardava)
//   estornar          → { id } devolve ao cliente um pedido pago (só o dono); cancela o horário ligado
//
// Avisos do Asaas (sem login; conferidos pelo token):
//   ?asaas=helpy             → pagamentos dos planos (conta do Helpy)
//   ?asaas=loja&conta=<id>   → pagamentos das vendas (conta da empresa)
// ============================================================

import { corsHeaders, json, UserError } from '../_shared/cors.ts';
import { admin, requireUser } from '../_shared/db.ts';
import { PLANS, type PlanId } from '../_shared/plans.ts';
import { type Ambiente, asaas, conferirConta, documentoValido, ErroAsaas, FORMA, garantirWebhook, hojeBr, novoToken, pago, tokenAceito } from '../_shared/asaas.ts';
import { contaDaLoja, pagamentoDaLoja } from '../_shared/pedidos.ts';

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;
const depois = (p: Promise<unknown>) => {
  const seguro = p.catch((e) => console.error('[pagamentos]', e));
  if (typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(seguro);
};

const FUNCAO = () => `${Deno.env.get('SUPABASE_URL')}/functions/v1/pagamentos`;
const AMBIENTE = (Deno.env.get('ASAAS_AMBIENTE') === 'producao' ? 'producao' : 'sandbox') as Ambiente;
const UUID = /^[0-9a-f-]{36}$/i;

/** A conta Asaas do próprio Helpy (quem recebe pelos planos). */
function contaHelpy() {
  const chave = Deno.env.get('ASAAS_API_KEY');
  if (!chave) throw new UserError('A cobrança dos planos ainda não foi ligada. Tente de novo em instantes.', 503);
  return asaas(chave, AMBIENTE);
}

function iguais(a: string, b: string) {
  if (!a || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

/** Dono da conta ou funcionário (que só vê). */
async function contaDe(userId: string) {
  const { data: p } = await admin.from('profiles').select('tipo, full_name, company_name').eq('id', userId).maybeSingle();
  if (p?.tipo === 'funcionario') {
    const { data: eq } = await admin.from('equipe').select('owner_id').eq('user_id', userId).maybeSingle();
    if (!eq) throw new UserError('Você não está mais na equipe desta empresa.', 403);
    return { conta: eq.owner_id as string, dono: false, perfil: p };
  }
  if (p?.tipo === 'cliente') throw new UserError('Isso é da área da empresa.', 403);
  return { conta: userId, dono: true, perfil: p };
}

async function guardarFatura(ownerId: string, pg: Record<string, unknown>, descricao?: string) {
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
  });
}

/** Próximo vencimento: um mês depois do que acabou de ser pago. */
function maisUmMes(data: string) {
  const d = new Date(`${data}T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 1);
  return d.toISOString().slice(0, 10);
}

// ------------------------------------------------------------
// Avisos do Asaas
// ------------------------------------------------------------
async function avisoDoHelpy(evento: { event?: string; payment?: Record<string, unknown> }) {
  const pg = evento.payment;
  if (!pg?.subscription) return;
  const { data: ass } = await admin.from('assinaturas').select('*').eq('asaas_assinatura', String(pg.subscription)).maybeSingle();
  if (!ass) return;
  await guardarFatura(ass.owner_id, pg, `Plano ${PLANS[ass.plano as PlanId]?.nome ?? ass.plano}`);

  if (pago(String(pg.status), evento.event)) {
    await admin.from('profiles').update({ plan: ass.plano, trial_ends_at: null }).eq('id', ass.owner_id);
    await admin.from('assinaturas').update({
      status: 'ativa', asaas_anterior: null, atualizada_em: new Date().toISOString(),
      proximo_vencimento: pg.dueDate ? maisUmMes(String(pg.dueDate)) : null,
    }).eq('owner_id', ass.owner_id);
    // troca de plano: a assinatura antiga só sai depois que a nova foi paga
    if (ass.asaas_anterior) await contaHelpy().pedir(`/subscriptions/${ass.asaas_anterior}`, { method: 'DELETE' }).catch(() => {});
    await admin.from('alertas').insert({
      owner_id: ass.owner_id, origem: 'sistema', chave: `fatura:${pg.id}`,
      assunto: `Pagamento confirmado: plano ${PLANS[ass.plano as PlanId]?.nome ?? ass.plano}`,
      detalhe: 'Obrigado! O plano já está ativo.',
    });
  } else if (evento.event === 'PAYMENT_OVERDUE') {
    await admin.from('assinaturas').update({ status: 'atrasada', atualizada_em: new Date().toISOString() }).eq('owner_id', ass.owner_id);
    await admin.from('alertas').insert({
      owner_id: ass.owner_id, origem: 'sistema', chave: `fatura:atrasada:${pg.id}`,
      assunto: 'A fatura do plano venceu',
      detalhe: 'Pague pela página Plano para não perder o acesso. Se já pagou, pode ignorar.',
    });
  }
}

async function aviso(req: Request, url: URL): Promise<Response> {
  const quem = url.searchParams.get('asaas');
  const token = req.headers.get('asaas-access-token') ?? '';
  const evento = await req.json().catch(() => ({}));
  if (quem === 'helpy') {
    if (!iguais(token, Deno.env.get('ASAAS_WEBHOOK_TOKEN') ?? '')) return new Response('', { status: 401 });
    depois(avisoDoHelpy(evento));
    return new Response('ok');
  }
  if (quem === 'loja') {
    const conta = url.searchParams.get('conta') ?? '';
    if (!UUID.test(conta)) return new Response('', { status: 404 });
    const { data: rec } = await admin.from('recebimentos').select('webhook_token').eq('owner_id', conta).maybeSingle();
    if (!rec || !iguais(token, rec.webhook_token)) return new Response('', { status: 401 });
    depois(pagamentoDaLoja(admin, conta, evento));
    return new Response('ok');
  }
  return new Response('', { status: 404 });
}

// ------------------------------------------------------------
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const url = new URL(req.url);
  if (url.searchParams.has('asaas')) {
    try {
      return await aviso(req, url);
    } catch (e) {
      console.error('[pagamentos] aviso', e);
      return new Response('', { status: 500 });
    }
  }

  try {
    const user = await requireUser(req);
    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? 'status');
    const { conta, dono, perfil } = await contaDe(user.id);

    if (action === 'status') {
      const [{ data: assinatura }, { data: faturas }, { data: rec }] = await Promise.all([
        admin.from('assinaturas').select('plano, status, valor, proximo_vencimento, atualizada_em').eq('owner_id', conta).maybeSingle(),
        admin.from('faturas').select('id, valor, status, vencimento, pago_em, link, forma, descricao').eq('owner_id', conta).order('criada_em', { ascending: false }).limit(12),
        admin.from('recebimentos').select('ambiente, conta_nome, ativo, modo, situacao').eq('owner_id', conta).maybeSingle(),
      ]);
      return json({
        cobranca: !!Deno.env.get('ASAAS_API_KEY'),
        ambiente: AMBIENTE,
        assinatura,
        faturas: faturas ?? [],
        recebimento: rec ?? null,
      });
    }

    if (!dono && action !== 'pedido_cancelar') throw new UserError('Só o dono da conta mexe em pagamentos.', 403);

    if (action === 'assinar') {
      const plano = String(body.plano ?? '') as PlanId;
      if (!['essencial', 'profissional', 'business'].includes(plano)) throw new UserError('Escolha um plano.');
      const documento = String(body.documento ?? '').replace(/\D/g, '');
      if (!documentoValido(documento)) throw new UserError('Confira o CPF ou CNPJ: o número não é válido.');
      const nome = String(body.nome ?? '').trim().slice(0, 100) || perfil?.company_name || perfil?.full_name || user.email || 'Cliente Helpy';
      const c = contaHelpy();

      const webhookOk = await admin.from('helpy_servicos').select('nome').eq('nome', `asaas-webhook-${AMBIENTE}`).maybeSingle();
      if (!webhookOk.data) {
        if (!tokenAceito(Deno.env.get('ASAAS_WEBHOOK_TOKEN') ?? '')) throw new UserError('A cobrança dos planos está sendo configurada. Tente de novo em instantes.', 503);
        await garantirWebhook(c, `${FUNCAO()}?asaas=helpy`, Deno.env.get('ASAAS_WEBHOOK_TOKEN') ?? '', user.email ?? 'contato@helpysupport.com');
        await admin.from('helpy_servicos').upsert({ nome: `asaas-webhook-${AMBIENTE}`, visto_em: new Date().toISOString() });
      }

      const { data: atual } = await admin.from('assinaturas').select('*').eq('owner_id', conta).maybeSingle();
      let cliente = atual?.asaas_cliente as string | undefined;
      if (cliente) {
        await c.pedir(`/customers/${cliente}`, { method: 'PUT', body: { name: nome, cpfCnpj: documento } }).catch(() => {});
      } else {
        const novo = await c.pedir<{ id: string }>('/customers', {
          method: 'POST',
          body: { name: nome, cpfCnpj: documento, email: user.email, externalReference: conta, notificationDisabled: false },
        });
        cliente = novo.id;
      }

      const valor = PLANS[plano].preco;
      const sub = await c.pedir<{ id: string }>('/subscriptions', {
        method: 'POST',
        body: {
          customer: cliente, billingType: 'UNDEFINED', value: valor, nextDueDate: hojeBr(), cycle: 'MONTHLY',
          description: `Helpy — plano ${PLANS[plano].nome}`, externalReference: `${conta}:${plano}`,
        },
      });
      // pendente de antes (nunca paga) sai na hora; a ativa espera a nova ser paga
      const anterior = atual?.asaas_assinatura && atual.asaas_assinatura !== sub.id ? atual.asaas_assinatura : null;
      if (anterior && atual?.status === 'pendente') await c.pedir(`/subscriptions/${anterior}`, { method: 'DELETE' }).catch(() => {});
      await admin.from('assinaturas').upsert({
        owner_id: conta, plano, valor, status: atual?.status === 'ativa' ? 'ativa' : 'pendente',
        asaas_cliente: cliente, asaas_assinatura: sub.id,
        asaas_anterior: anterior && atual?.status !== 'pendente' ? anterior : null,
        atualizada_em: new Date().toISOString(),
      });

      const pagamentos = await c.pedir<{ data?: Record<string, unknown>[] }>(`/subscriptions/${sub.id}/payments`);
      const primeiro = pagamentos.data?.[0];
      if (!primeiro?.invoiceUrl) throw new UserError('A assinatura foi criada, mas a fatura ainda não apareceu. Atualize a página em alguns segundos.', 502);
      await guardarFatura(conta, primeiro, `Plano ${PLANS[plano].nome}`);
      return json({ url: primeiro.invoiceUrl, ambiente: AMBIENTE });
    }

    if (action === 'cancelar') {
      const { data: atual } = await admin.from('assinaturas').select('*').eq('owner_id', conta).maybeSingle();
      if (!atual?.asaas_assinatura) throw new UserError('Não há assinatura para cancelar.');
      await contaHelpy().pedir(`/subscriptions/${atual.asaas_assinatura}`, { method: 'DELETE' });
      await admin.from('assinaturas').update({ status: 'cancelada', atualizada_em: new Date().toISOString() }).eq('owner_id', conta);
      return json({ ok: true, vale_ate: atual.proximo_vencimento });
    }

    if (action === 'loja_conectar') {
      const chave = String(body.chave ?? '').trim();
      const ambiente = (body.ambiente === 'producao' ? 'producao' : 'sandbox') as Ambiente;
      if (chave.length < 30) throw new UserError('Cole a chave de API completa do Asaas (começa com $aact_).');
      const { data: ja } = await admin.from('recebimentos').select('modo').eq('owner_id', conta).maybeSingle();
      if (ja?.modo === 'carteira') throw new UserError('Esta empresa já recebe pela Carteira Helpy.');
      const c = asaas(chave, ambiente);
      const nome = await conferirConta(c);
      const { data: rec, error } = await admin.from('recebimentos')
        .upsert({ owner_id: conta, provedor: 'asaas', ambiente, conta_nome: nome, ativo: true })
        .select('webhook_token').single();
      if (error) throw error;
      let token = rec.webhook_token as string;
      if (!tokenAceito(token)) {
        token = novoToken();
        await admin.from('recebimentos').update({ webhook_token: token }).eq('owner_id', conta);
      }
      const { error: eSeg } = await admin.rpc('helpy_recebimento_guardar_segredo', { p_conta: conta, p_valor: chave });
      if (eSeg) throw eSeg;
      await garantirWebhook(c, `${FUNCAO()}?asaas=loja&conta=${conta}`, token, user.email ?? 'contato@helpysupport.com');
      return json({ ok: true, recebimento: { ambiente, conta_nome: nome, ativo: true } });
    }

    if (action === 'loja_desconectar') {
      const { data: rec } = await admin.from('recebimentos').select('modo').eq('owner_id', conta).maybeSingle();
      if (rec?.modo === 'carteira') {
        // a conta e o dinheiro são da empresa: só para de gerar links
        await admin.from('recebimentos').update({ ativo: false }).eq('owner_id', conta);
        return json({ ok: true });
      }
      const { error } = await admin.from('recebimentos').delete().eq('owner_id', conta);
      if (error) throw error;
      return json({ ok: true });
    }

    if (action === 'carteira_religar') {
      await admin.from('recebimentos').update({ ativo: true }).eq('owner_id', conta).eq('modo', 'carteira');
      return json({ ok: true });
    }

    if (action === 'carteira_ativar') {
      const c = contaHelpy();
      const { data: ja } = await admin.from('recebimentos').select('modo').eq('owner_id', conta).maybeSingle();
      if (ja) throw new UserError(ja.modo === 'carteira' ? 'A carteira já está ativa.' : 'Esta empresa já recebe por uma conta Asaas própria. Desligue em Carteira para trocar.');
      const t = (k: string, max = 120) => String(body[k] ?? '').trim().slice(0, max);
      const documento = t('documento').replace(/\D/g, '');
      if (!documentoValido(documento)) throw new UserError('Confira o CPF ou CNPJ: o número não é válido.');
      const pj = documento.length === 14;
      const cep = t('cep').replace(/\D/g, '');
      const celular = t('celular').replace(/\D/g, '');
      const renda = Number(String(body.renda ?? '').replace(/\./g, '').replace(',', '.'));
      const faltando = [
        !t('nome') && 'nome', !/^\S+@\S+\.\S+$/.test(t('email')) && 'e-mail', celular.length < 10 && 'celular',
        cep.length !== 8 && 'CEP', !t('endereco') && 'endereço', !t('numero', 10) && 'número', !t('bairro') && 'bairro',
        !(renda > 0) && 'faturamento mensal', !pj && !/^\d{4}-\d{2}-\d{2}$/.test(t('nascimento', 10)) && 'data de nascimento',
      ].filter(Boolean);
      if (faltando.length) throw new UserError(`Preencha: ${faltando.join(', ')}.`);
      const TIPOS = ['MEI', 'LIMITED', 'INDIVIDUAL', 'ASSOCIATION'];
      const nova = await c.pedir<{ id: string; walletId: string; apiKey: string; name?: string }>('/accounts', {
        method: 'POST',
        body: {
          name: t('nome', 100), email: t('email'), cpfCnpj: documento, mobilePhone: celular,
          ...(pj ? { companyType: TIPOS.includes(t('tipo_empresa')) ? t('tipo_empresa') : 'MEI' } : { birthDate: t('nascimento', 10) }),
          address: t('endereco'), addressNumber: t('numero', 10), complement: t('complemento') || undefined,
          province: t('bairro'), postalCode: cep, incomeValue: renda,
        },
      });
      if (!nova.apiKey) throw new UserError('O Asaas não devolveu a chave da carteira. Tente de novo em instantes.', 502);
      const token = novoToken();
      const { error } = await admin.from('recebimentos').insert({
        owner_id: conta, provedor: 'asaas', ambiente: AMBIENTE, conta_nome: (nova.name || t('nome', 100)).slice(0, 120),
        modo: 'carteira', asaas_conta_id: nova.id, wallet_id: nova.walletId, documento, situacao: 'documentos',
        webhook_token: token, ativo: true,
      });
      if (error) throw error;
      const { error: eSeg } = await admin.rpc('helpy_recebimento_guardar_segredo', { p_conta: conta, p_valor: nova.apiKey });
      if (eSeg) throw eSeg;
      await garantirWebhook(asaas(nova.apiKey, AMBIENTE), `${FUNCAO()}?asaas=loja&conta=${conta}`, token, user.email ?? t('email'))
        .catch((e) => console.error('[carteira] aviso', e));
      return json({ ok: true });
    }

    if (action === 'carteira') {
      const { data: rec } = await admin.from('recebimentos').select('modo, ambiente, conta_nome, ativo, situacao, documento').eq('owner_id', conta).maybeSingle();
      if (!rec) return json({ recebimento: null });
      const { data: chave } = await admin.rpc('helpy_recebimento_segredo', { p_conta: conta });
      if (!chave) return json({ recebimento: { ...rec, documento: undefined }, erro: 'A conta perdeu a ligação. Fale com o suporte.' });
      const c = asaas(String(chave), rec.ambiente as Ambiente);
      const carteira = rec.modo === 'carteira';
      const [saldo, extrato, confirmados, status, docs, { data: saques }] = await Promise.all([
        c.pedir<{ balance?: number }>('/finance/balance').catch(() => null),
        c.pedir<{ data?: Record<string, unknown>[] }>('/financialTransactions?limit=30&order=desc').catch(() => null),
        c.pedir<{ data?: { netValue?: number; value?: number }[] }>('/payments?status=CONFIRMED&limit=100').catch(() => null),
        carteira ? c.pedir<{ general?: string; documentation?: string }>('/myAccount/status').catch(() => null) : Promise.resolve(null),
        carteira ? c.pedir<{ data?: { status?: string; title?: string; onboardingUrl?: string }[] }>('/myAccount/documents').catch(() => null) : Promise.resolve(null),
        dono ? admin.from('saques').select('id, valor, destino, status, criado_em').eq('owner_id', conta).order('criado_em', { ascending: false }).limit(20) : Promise.resolve({ data: [] }),
      ]);
      let situacao = rec.situacao;
      if (status?.general) {
        situacao = status.general === 'APPROVED' ? 'aprovada' : status.general === 'REJECTED' ? 'recusada' : (docs?.data ?? []).some((d) => d.status !== 'APPROVED' && d.onboardingUrl) ? 'documentos' : 'analise';
        if (situacao !== rec.situacao) await admin.from('recebimentos').update({ situacao }).eq('owner_id', conta);
      }
      const pendentes = (docs?.data ?? []).filter((d) => d.status !== 'APPROVED');
      return json({
        recebimento: { modo: rec.modo, ambiente: rec.ambiente, conta_nome: rec.conta_nome, ativo: rec.ativo, situacao },
        saldo: saldo?.balance ?? null,
        a_receber: (confirmados?.data ?? []).reduce((s, p) => s + Number(p.netValue ?? p.value ?? 0), 0),
        extrato: (extrato?.data ?? []).map((x) => ({ id: x.id, valor: x.value, saldo: x.balance, tipo: x.type, data: x.date, descricao: x.description })),
        documentos: pendentes.map((d) => ({ titulo: d.title, status: d.status, link: d.onboardingUrl ?? null })),
        destino_saque: carteira && rec.documento ? `${rec.documento.length === 14 ? 'CNPJ' : 'CPF'} ${rec.documento.replace(/^(\d{3})\d+(\d{2})$/, '$1•••••$2')}` : null,
        saques: saques ?? [],
      });
    }

    if (action === 'carteira_sacar') {
      const { data: rec } = await admin.from('recebimentos').select('modo, ambiente, documento, situacao').eq('owner_id', conta).maybeSingle();
      if (rec?.modo !== 'carteira' || !rec.documento) throw new UserError('O saque pelo Helpy é da Carteira Helpy. Na sua conta Asaas, saque pelo site do Asaas.');
      if (rec.ambiente === 'producao' && !(user.factors ?? []).some((f) => f.status === 'verified')) {
        throw new UserError('Para sacar, ative a verificação em duas etapas em Conta. É o que protege o seu dinheiro.', 403);
      }
      const valor = Math.round(Number(body.valor) * 100) / 100;
      if (!(valor >= 1)) throw new UserError('Digite um valor a partir de R$ 1,00.');
      const c = await contaDaLoja(admin, conta) ?? asaas(String((await admin.rpc('helpy_recebimento_segredo', { p_conta: conta })).data ?? ''), rec.ambiente as Ambiente);
      const saldo = await c.pedir<{ balance?: number }>('/finance/balance');
      if (valor > Number(saldo.balance ?? 0)) throw new UserError('O valor é maior que o saldo disponível.');
      const destino = `${rec.documento.length === 14 ? 'CNPJ' : 'CPF'} ${rec.documento.replace(/^(\d{3})\d+(\d{2})$/, '$1•••••$2')}`;
      // sempre para a chave Pix do próprio CPF/CNPJ da carteira: o dinheiro só sai para o dono
      const tr = await c.pedir<{ id: string; status?: string }>('/transfers', {
        method: 'POST',
        body: { value: valor, operationType: 'PIX', pixAddressKey: rec.documento, pixAddressKeyType: rec.documento.length === 14 ? 'CNPJ' : 'CPF', description: 'Saque da Carteira Helpy' },
      });
      await admin.from('saques').insert({ owner_id: conta, valor, destino, status: String(tr.status ?? 'pedido').toLowerCase(), asaas_id: tr.id, pedido_por: user.id });
      await admin.from('alertas').insert({
        owner_id: conta, origem: 'sistema', chave: `saque:${tr.id}`,
        assunto: `Saque de ${valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} pedido`,
        detalhe: `Para a chave Pix ${destino}. Se não foi você, troque a senha e fale com o suporte.`,
      });
      return json({ ok: true, destino });
    }

    if (action === 'estornar') {
      if (!dono) throw new UserError('Só o dono da conta pode devolver um pagamento.', 403);
      const id = String(body.id ?? '');
      if (!UUID.test(id)) throw new UserError('Pedido inválido.');
      const { data: ped } = await admin.from('pedidos').select('*').eq('id', id).maybeSingle();
      if (!ped || ped.owner_id !== conta) throw new UserError('Pedido não encontrado.', 404);
      if (ped.status !== 'pago' || !ped.pagamento_id) throw new UserError('Só dá para devolver um pedido pago.');
      const loja = await contaDaLoja(admin, conta);
      if (!loja) throw new UserError('Ligue de novo o recebimento na Carteira para devolver pelo Asaas.');
      await loja.pedir(`/payments/${ped.pagamento_id}/refund`, { method: 'POST', body: {} });
      await admin.from('pedidos').update({ status: 'estornado' }).eq('id', id);
      if (ped.agendamento_id) await admin.from('agendamentos').update({ status: 'cancelado' }).eq('id', ped.agendamento_id);
      if (ped.conversation_id) {
        await admin.from('conversation_messages').insert({
          conversation_id: ped.conversation_id, role: 'system', author_name: 'evento:cancelado',
          content: `${ped.tipo === 'agendamento' ? 'Horário cancelado. ' : ''}O valor de ${Number(ped.total).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} foi devolvido pela mesma forma de pagamento.`,
        });
      }
      return json({ ok: true });
    }

    if (action === 'pedido_cancelar') {
      const id = String(body.id ?? '');
      if (!UUID.test(id)) throw new UserError('Pedido inválido.');
      const { data: ped } = await admin.from('pedidos').select('id, owner_id, status, link_id, agendamento_id').eq('id', id).maybeSingle();
      if (!ped || ped.owner_id !== conta) throw new UserError('Pedido não encontrado.', 404);
      if (ped.status !== 'aguardando') throw new UserError('Só dá para cancelar pedido que ainda não foi pago.');
      await admin.from('pedidos').update({ status: 'cancelado' }).eq('id', id);
      if (ped.agendamento_id) {
        await admin.from('agendamentos').update({ status: 'cancelado', reserva_ate: null }).eq('id', ped.agendamento_id).eq('status', 'aguardando_pagamento');
      }
      if (ped.link_id) {
        const loja = await contaDaLoja(admin, conta);
        await loja?.pedir(`/paymentLinks/${ped.link_id}`, { method: 'DELETE' }).catch(() => {});
      }
      return json({ ok: true });
    }

    throw new UserError('Ação desconhecida.');
  } catch (e) {
    if (e instanceof UserError) return json({ error: e.message }, e.status);
    if (e instanceof ErroAsaas) return json({ error: e.message }, 502);
    console.error(e);
    return json({ error: 'Algo deu errado. Tente de novo.' }, 500);
  }
});
