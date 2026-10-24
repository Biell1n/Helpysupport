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
import { admin, configLigada, precosDeTeste, requireUser } from '../_shared/db.ts';
import { type Ciclo, PAGOS, PLANS, type PlanId, type PlanoPago, precosVigentes, valorDaAssinatura } from '../_shared/plans.ts';
import { type Ambiente, asaas, conferirConta, documentoValido, ErroAsaas, garantirWebhook, hojeBr, novoToken, pago, tokenAceito } from '../_shared/asaas.ts';
import { AMBIENTE, contaHelpy, desteAmbiente, fecharUsoExtra, guardarFatura, MINIMO_FATURA } from '../_shared/cobranca.ts';
import { contaDaLoja, pagamentoDaLoja, tirarTaxa } from '../_shared/pedidos.ts';

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;
const depois = (p: Promise<unknown>) => {
  const seguro = p.catch((e) => console.error('[pagamentos]', e));
  if (typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(seguro);
};

const FUNCAO = () => `${Deno.env.get('SUPABASE_URL')}/functions/v1/pagamentos`;
const UUID = /^[0-9a-f-]{36}$/i;

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

/** Próximo vencimento: um ciclo (mês ou ano) depois do que acabou de ser pago. */
function proximoVencimento(data: string, ciclo: string) {
  if (ciclo !== 'anual') return maisUmMes(data);
  const d = new Date(`${data}T12:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

function maisUmMes(data: string) {
  const d = new Date(`${data}T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 1);
  return d.toISOString().slice(0, 10);
}

/** Descrição da assinatura no Asaas (aparece na fatura do cliente). */
const descricaoDaAssinatura = (plano: PlanoPago, ciclo: Ciclo, vagas: number) =>
  `Helpy — plano ${PLANS[plano].nome} ${ciclo === 'anual' ? 'anual' : 'mensal'}${vagas ? ` + ${vagas} ${vagas === 1 ? 'vaga extra' : 'vagas extras'} na equipe` : ''}`;

/** Aviso do Asaas sobre uma fatura de uso extra. */
async function avisoDoExtra(evento: { event?: string; payment?: Record<string, unknown> }) {
  const pg = evento.payment!;
  const id = String(pg.id ?? '');
  const { data: linhas } = await admin.from('uso_extra').select('owner_id').eq('fatura_id', id).limit(1);
  const dono = linhas?.[0]?.owner_id as string | undefined;
  if (!dono) return;
  const { data: antes } = await admin.from('faturas').select('descricao').eq('id', id).maybeSingle();
  await guardarFatura(dono, pg, antes?.descricao ?? 'Uso extra');
  if (pago(String(pg.status), evento.event)) {
    await admin.from('uso_extra').update({ status: 'pago' }).eq('fatura_id', id);
  } else if (evento.event === 'PAYMENT_OVERDUE') {
    // fatura atrasada: o uso extra para (o banco recusa) até ela ser paga
    await admin.from('uso_extra').update({ status: 'atrasado' }).eq('fatura_id', id).eq('status', 'cobrado');
    await admin.from('alertas').insert({
      owner_id: dono, origem: 'sistema', chave: `extra:atrasada:${id}`,
      assunto: 'A fatura do uso extra venceu',
      detalhe: 'Enquanto ela não for paga, o uso extra fica parado e as conversas além da cota vão para a equipe. Pague pela página Plano.',
    });
  } else if (evento.event === 'PAYMENT_DELETED') {
    await admin.from('uso_extra').update({ status: 'perdoado' }).eq('fatura_id', id).in('status', ['cobrado', 'atrasado']);
  }
}

// ------------------------------------------------------------
// Avisos do Asaas
// ------------------------------------------------------------
async function avisoDoHelpy(evento: { event?: string; payment?: Record<string, unknown> }) {
  const pg = evento.payment;
  const ref = String(pg?.externalReference ?? '');
  if (pg && ref.startsWith('extra:')) return await avisoDoExtra(evento);
  // vagas extras pagas à parte no plano anual: só atualiza a fatura na tela
  if (pg && ref.startsWith('vagas:')) {
    const dono = ref.slice(6);
    const { data: antes } = await admin.from('faturas').select('descricao').eq('id', String(pg.id)).eq('owner_id', dono).maybeSingle();
    if (antes) await guardarFatura(dono, pg, antes.descricao ?? undefined);
    return;
  }
  const subId = String(pg?.subscription ?? '');
  if (!pg || !/^[\w-]+$/.test(subId)) return;
  // a cobrança pode ser da assinatura nova ou da antiga, que segue valendo até a troca ser paga
  const { data: ass } = await admin.from('assinaturas').select('*')
    .or(`asaas_assinatura.eq.${subId},asaas_anterior.eq.${subId}`).maybeSingle();
  if (!ass) return;
  // a mensalidade chega todo mês: aproveita para fechar o uso extra do mês que acabou
  depois(fecharUsoExtra(ass.owner_id));
  const daAntiga = ass.asaas_anterior === subId && ass.asaas_assinatura !== subId;
  const agora = new Date().toISOString();

  if (daAntiga) {
    const plano = await planoDaAssinatura(subId);
    await guardarFatura(ass.owner_id, pg, `Plano ${PLANS[plano ?? (ass.plano as PlanId)]?.nome ?? plano ?? ass.plano}`);
    if (pago(String(pg.status), evento.event)) {
      if (ass.status === 'cancelada') return;
      // pagou o plano de antes: ele continua valendo e a troca segue esperando
      if (plano) await admin.from('profiles').update({ plan: plano, trial_ends_at: null }).eq('id', ass.owner_id);
      await admin.from('assinaturas').update({
        status: 'ativa', atualizada_em: agora,
        proximo_vencimento: pg.dueDate ? proximoVencimento(String(pg.dueDate), ass.ciclo) : ass.proximo_vencimento,
      }).eq('owner_id', ass.owner_id);
    } else if (evento.event === 'PAYMENT_OVERDUE') {
      await admin.from('assinaturas').update({ status: 'atrasada', atualizada_em: agora }).eq('owner_id', ass.owner_id);
      await avisoDeAtraso(ass.owner_id, String(pg.id));
    }
    return;
  }

  await guardarFatura(ass.owner_id, pg, `Plano ${PLANS[ass.plano as PlanId]?.nome ?? ass.plano}`);

  if (pago(String(pg.status), evento.event)) {
    // cobrança antiga que caiu depois do cancelamento: guarda a fatura, mas não reativa o plano
    if (ass.status === 'cancelada') return;
    await admin.from('profiles').update({ plan: ass.plano, trial_ends_at: null }).eq('id', ass.owner_id);
    await admin.from('assinaturas').update({
      status: 'ativa', asaas_anterior: null, atualizada_em: agora,
      proximo_vencimento: pg.dueDate ? proximoVencimento(String(pg.dueDate), ass.ciclo) : null,
    }).eq('owner_id', ass.owner_id);
    // troca de plano: a assinatura antiga só sai depois que a nova foi paga
    if (ass.asaas_anterior) await contaHelpy().pedir(`/subscriptions/${ass.asaas_anterior}`, { method: 'DELETE' }).catch(() => {});
    await admin.from('alertas').insert({
      owner_id: ass.owner_id, origem: 'sistema', chave: `fatura:${pg.id}`,
      assunto: `Pagamento confirmado: plano ${PLANS[ass.plano as PlanId]?.nome ?? ass.plano}`,
      detalhe: 'Obrigado! O plano já está ativo.',
    });
  } else if (evento.event === 'PAYMENT_OVERDUE') {
    if (ass.asaas_anterior) {
      // troca de plano que não foi paga: desfaz e volta para a assinatura de antes, sem mexer no acesso
      await contaHelpy().pedir(`/subscriptions/${subId}`, { method: 'DELETE' }).catch(() => {});
      const { data: perfil } = await admin.from('profiles').select('plan, funcionarios_extra').eq('id', ass.owner_id).maybeSingle();
      const plano = (await planoDaAssinatura(ass.asaas_anterior)) ?? (perfil?.plan as PlanId | undefined);
      await admin.from('assinaturas').update({
        asaas_assinatura: ass.asaas_anterior, asaas_anterior: null, atualizada_em: agora,
        status: ass.status === 'ativa' ? 'ativa' : 'atrasada',
        ...(plano && PAGOS.includes(plano as PlanoPago)
          ? { plano, valor: valorDaAssinatura(precosVigentes(await precosDeTeste()), plano as PlanoPago, ass.ciclo === 'anual' ? 'anual' : 'mensal', Number(perfil?.funcionarios_extra ?? 0)) }
          : {}),
      }).eq('owner_id', ass.owner_id);
      await admin.from('alertas').insert({
        owner_id: ass.owner_id, origem: 'sistema', chave: `fatura:troca:${pg.id}`,
        assunto: 'A troca de plano não foi paga',
        detalhe: 'Você continua no plano de antes. Para trocar, escolha o plano de novo na página Plano.',
      });
      return;
    }
    await admin.from('assinaturas').update({ status: 'atrasada', atualizada_em: agora }).eq('owner_id', ass.owner_id);
    await avisoDeAtraso(ass.owner_id, String(pg.id));
  }
}

async function avisoDeAtraso(ownerId: string, pagamento: string) {
  await admin.from('alertas').insert({
    owner_id: ownerId, origem: 'sistema', chave: `fatura:atrasada:${pagamento}`,
    assunto: 'A fatura do plano venceu',
    detalhe: 'Pague pela página Plano para não perder o acesso. Se já pagou, pode ignorar.',
  });
}

// O plano de uma assinatura do Helpy vem no externalReference ("conta:plano").
async function planoDaAssinatura(id: string): Promise<PlanId | null> {
  const sub = await contaHelpy().pedir<{ externalReference?: string }>(`/subscriptions/${id}`).catch(() => null);
  const plano = String(sub?.externalReference ?? '').split(':')[1] as PlanId;
  return plano && plano !== 'trial' && PLANS[plano] ? plano : null;
}

async function aviso(req: Request, url: URL): Promise<Response> {
  const quem = url.searchParams.get('asaas');
  const token = req.headers.get('asaas-access-token') ?? '';
  const evento = await req.json().catch(() => ({}));
  if (quem === 'helpy') {
    if (!iguais(token, Deno.env.get('ASAAS_WEBHOOK_TOKEN') ?? '')) return new Response('', { status: 401 });
    // tratado antes de responder: se falhar, o Asaas manda de novo (o tratamento não repete efeito)
    try {
      await avisoDoHelpy(evento);
    } catch (e) {
      console.error('[asaas helpy]', (e as Error).message);
      return new Response('erro', { status: 500 });
    }
    return new Response('ok');
  }
  if (quem === 'loja') {
    const conta = url.searchParams.get('conta') ?? '';
    if (!UUID.test(conta)) return new Response('', { status: 404 });
    const { data: rec } = await admin.from('recebimentos').select('webhook_token').eq('owner_id', conta).maybeSingle();
    if (!rec || !iguais(token, rec.webhook_token)) return new Response('', { status: 401 });
    try {
      await pagamentoDaLoja(admin, conta, evento);
    } catch (e) {
      console.error('[asaas loja]', (e as Error).message);
      return new Response('erro', { status: 500 });
    }
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

    if (action === 'precos') {
      const [teste, carteira] = await Promise.all([precosDeTeste(), configLigada('carteira_disponivel')]);
      return json({ ...precosVigentes(teste), carteira });
    }

    if (action === 'status') {
      // só o que é deste Asaas: ao virar para produção, as cobranças do sandbox somem da tela
      const doAmbiente = AMBIENTE === 'sandbox' ? 'ambiente.is.null,ambiente.eq.sandbox' : 'ambiente.eq.producao';
      const [{ data: bruta }, { data: faturas }, { data: rec }, precos] = await Promise.all([
        admin.from('assinaturas').select('plano, status, valor, ciclo, ambiente, proximo_vencimento, atualizada_em').eq('owner_id', conta).maybeSingle(),
        admin.from('faturas').select('id, valor, status, vencimento, pago_em, link, forma, descricao').eq('owner_id', conta).or(doAmbiente)
          .order('criada_em', { ascending: false }).limit(12),
        admin.from('recebimentos').select('ambiente, conta_nome, ativo, modo, situacao').eq('owner_id', conta).maybeSingle(),
        precosDeTeste().then(precosVigentes),
      ]);
      const assinatura = bruta && (bruta.ambiente ?? 'sandbox') === AMBIENTE ? bruta : null;
      // abriu a página Plano: fecha o uso extra de mês que já acabou, se ainda estiver em aberto
      if (dono && Deno.env.get('ASAAS_API_KEY')) depois(fecharUsoExtra(conta));
      return json({
        cobranca: !!Deno.env.get('ASAAS_API_KEY'),
        ambiente: AMBIENTE,
        assinatura,
        faturas: faturas ?? [],
        recebimento: rec ?? null,
        precos,
      });
    }

    if (!dono && action !== 'pedido_cancelar') throw new UserError('Só o dono da conta mexe em pagamentos.', 403);

    if (action === 'assinar') {
      const plano = String(body.plano ?? '') as PlanoPago;
      if (!PAGOS.includes(plano)) throw new UserError('Escolha um plano.');
      const ciclo: Ciclo = body.ciclo === 'anual' ? 'anual' : 'mensal';
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

      const { data: guardada } = await admin.from('assinaturas').select('*').eq('owner_id', conta).maybeSingle();
      const atual = desteAmbiente(guardada);
      let cliente = (atual?.asaas_cliente ?? undefined) as string | undefined;
      if (cliente) {
        await c.pedir(`/customers/${cliente}`, { method: 'PUT', body: { name: nome, cpfCnpj: documento } }).catch(() => {});
      } else {
        const novo = await c.pedir<{ id: string }>('/customers', {
          method: 'POST',
          body: { name: nome, cpfCnpj: documento, email: user.email, externalReference: conta, notificationDisabled: false },
        });
        cliente = novo.id;
      }

      // as vagas extras de equipe seguem para o plano novo
      const { data: vagasDe } = await admin.from('profiles').select('funcionarios_extra').eq('id', conta).maybeSingle();
      const vagas = Number(vagasDe?.funcionarios_extra ?? 0);
      const valor = valorDaAssinatura(precosVigentes(await precosDeTeste()), plano, ciclo, vagas);
      const sub = await c.pedir<{ id: string }>('/subscriptions', {
        method: 'POST',
        body: {
          customer: cliente, billingType: 'UNDEFINED', value: valor, nextDueDate: hojeBr(), cycle: ciclo === 'anual' ? 'YEARLY' : 'MONTHLY',
          description: descricaoDaAssinatura(plano, ciclo, vagas),
          externalReference: `${conta}:${plano}:${ciclo}`,
        },
      });
      // pendente de antes (nunca paga) sai na hora; a ativa espera a nova ser paga
      const anterior = atual?.asaas_assinatura && atual.asaas_assinatura !== sub.id && atual.status !== 'cancelada' ? atual.asaas_assinatura : null;
      if (anterior && atual?.status === 'pendente') await c.pedir(`/subscriptions/${anterior}`, { method: 'DELETE' }).catch(() => {});
      // troca de plano em cima de outra troca que ainda não foi paga: a do meio não pode continuar cobrando
      if (atual?.asaas_anterior && anterior && atual.status !== 'pendente') {
        await c.pedir(`/subscriptions/${anterior}`, { method: 'DELETE' }).catch(() => {});
      }
      await admin.from('assinaturas').upsert({
        owner_id: conta, plano, valor, ciclo, ambiente: AMBIENTE, status: atual?.status === 'ativa' ? 'ativa' : 'pendente',
        asaas_cliente: cliente, asaas_assinatura: sub.id,
        // numa troca em cima de outra, a que vale continua sendo a primeira (a que foi paga)
        asaas_anterior: atual?.asaas_anterior ?? (anterior && atual?.status !== 'pendente' ? anterior : null),
        atualizada_em: new Date().toISOString(),
      });

      const pagamentos = await c.pedir<{ data?: Record<string, unknown>[] }>(`/subscriptions/${sub.id}/payments`);
      const primeiro = pagamentos.data?.[0];
      if (!primeiro?.invoiceUrl) throw new UserError('A assinatura foi criada, mas a fatura ainda não apareceu. Atualize a página em alguns segundos.', 502);
      await guardarFatura(conta, primeiro, `Plano ${PLANS[plano].nome} ${ciclo === 'anual' ? '(anual)' : '(mensal)'}`);
      return json({ url: primeiro.invoiceUrl, ambiente: AMBIENTE });
    }

    if (action === 'cancelar') {
      const { data: guardada } = await admin.from('assinaturas').select('*').eq('owner_id', conta).maybeSingle();
      const atual = desteAmbiente(guardada);
      if (!atual?.asaas_assinatura) throw new UserError('Não há assinatura para cancelar.');
      await contaHelpy().pedir(`/subscriptions/${atual.asaas_assinatura}`, { method: 'DELETE' });
      // se estava no meio de uma troca de plano, a antiga também para de cobrar
      if (atual.asaas_anterior) await contaHelpy().pedir(`/subscriptions/${atual.asaas_anterior}`, { method: 'DELETE' }).catch(() => {});
      await admin.from('assinaturas').update({ status: 'cancelada', asaas_anterior: null, atualizada_em: new Date().toISOString() }).eq('owner_id', conta);
      // o uso extra que ficou (inclusive deste mês) sai numa última fatura
      depois(fecharUsoExtra(conta, true));
      return json({ ok: true, vale_ate: atual.proximo_vencimento });
    }

    if (action === 'vagas') {
      // vagas extras de equipe: entram na mensalidade a partir da próxima fatura
      const quero = Math.trunc(Number(body.quantidade));
      if (!Number.isFinite(quero) || quero < 0 || quero > 50) throw new UserError('Escolha entre 0 e 50 vagas extras.');
      const { data: p } = await admin.from('profiles').select('plan, funcionarios_extra, cobranca_isenta').eq('id', conta).maybeSingle();
      if (!p) throw new UserError('Conta não encontrada.', 404);
      const { data: guardada } = await admin.from('assinaturas').select('*').eq('owner_id', conta).maybeSingle();
      const ass = desteAmbiente(guardada);
      const plano = (p.cobranca_isenta ? p.plan : ass?.plano) as PlanoPago | undefined;
      if (!plano || !PAGOS.includes(plano)) {
        throw new UserError(PAGOS.includes(p.plan as PlanoPago)
          ? 'As vagas extras entram na mensalidade: elas ficam disponíveis com uma assinatura feita pela página Plano.'
          : 'Vagas extras são para planos pagos. Assine um plano primeiro.');
      }
      const ciclo: Ciclo = ass?.ciclo === 'anual' ? 'anual' : 'mensal';
      const precos = precosVigentes(await precosDeTeste());
      const [{ count: membros }, { count: convites }] = await Promise.all([
        admin.from('equipe').select('user_id', { count: 'exact', head: true }).eq('owner_id', conta),
        admin.from('convites').select('token', { count: 'exact', head: true }).eq('owner_id', conta)
          .is('usado_em', null).gt('expira_em', new Date().toISOString()),
      ]);
      const ocupadas = (membros ?? 0) + (convites ?? 0);
      if (quero < ocupadas - PLANS[plano].funcionarios) {
        throw new UserError(`A equipe tem ${ocupadas} entre pessoas e convites. Remova alguém antes de diminuir as vagas.`);
      }
      const valor = valorDaAssinatura(precos, plano, ciclo, quero);
      let agora = 0;
      if (!p.cobranca_isenta) {
        if (!ass?.asaas_assinatura || ass.status !== 'ativa') throw new UserError('As vagas extras entram na mensalidade: elas ficam disponíveis com a assinatura em dia.');
        if (ass.asaas_anterior) throw new UserError('Há uma troca de plano esperando pagamento. Mude as vagas depois que ela for paga.');
        await contaHelpy().pedir(`/subscriptions/${ass.asaas_assinatura}`, {
          method: 'PUT',
          body: { value: valor, updatePendingPayments: true, description: descricaoDaAssinatura(plano, ciclo, quero) },
        });
        await admin.from('assinaturas').update({ valor, atualizada_em: new Date().toISOString() }).eq('owner_id', conta);
        // no anual a próxima cobrança só vem daqui a meses: as vagas novas pagam agora os meses que faltam
        const novas = quero - Number(p.funcionarios_extra ?? 0);
        if (ciclo === 'anual' && novas > 0 && ass.proximo_vencimento && ass.asaas_cliente) {
          const meses = Math.max(1, Math.ceil((new Date(`${ass.proximo_vencimento}T12:00:00Z`).getTime() - Date.now()) / (30.44 * 864e5)));
          agora = Math.round(novas * precos.vaga * meses * 100) / 100;
          if (agora >= MINIMO_FATURA) {
            const pg = await contaHelpy().pedir<Record<string, unknown> & { id: string }>('/payments', {
              method: 'POST',
              body: {
                customer: ass.asaas_cliente, billingType: 'UNDEFINED', value: agora, dueDate: hojeBr(3),
                description: `Helpy — ${novas} ${novas === 1 ? 'vaga extra' : 'vagas extras'} até a renovação (${meses} ${meses === 1 ? 'mês' : 'meses'})`,
                externalReference: `vagas:${conta}`,
              },
            });
            await guardarFatura(conta, pg, `${novas} ${novas === 1 ? 'vaga extra' : 'vagas extras'} até a renovação`);
          } else agora = 0;
        }
      }
      await admin.from('profiles').update({ funcionarios_extra: quero }).eq('id', conta);
      return json({ ok: true, vagas: quero, valor, ciclo, agora, isenta: !!p.cobranca_isenta });
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
      // a Carteira é uma subconta do Asaas do Helpy, e o Asaas só deixa conta de CNPJ abrir subcontas
      if (!(await configLigada('carteira_disponivel'))) {
        throw new UserError('A Carteira Helpy ainda não está disponível. Por enquanto, ligue a sua própria conta do Asaas em "Já tenho conta no Asaas".', 409);
      }
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
      try {
        await loja.pedir(`/payments/${ped.pagamento_id}/refund`, { method: 'POST', body: {} });
      } catch (e) {
        // o Asaas devolve o valor cheio ao cliente, mas tira do saldo: a taxa dele no pagamento não volta
        const saldo = await loja.pedir<{ balance?: number }>('/finance/balance').then((b) => Number(b.balance ?? 0)).catch(() => null);
        const total = Number(ped.total);
        if (saldo != null && saldo < total) {
          const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
          throw new UserError(
            `O Asaas devolve ${fmt(total)} ao cliente, mas tira do seu saldo, e hoje ele está em ${fmt(saldo)} (a taxa do Asaas nesse pagamento não volta). Coloque ${fmt(total - saldo)} no Asaas (um Pix para a sua própria conta) e tente de novo.`,
            409,
          );
        }
        throw e;
      }
      const { data: devolvido } = await admin.from('pedidos').update({ status: 'estornado' }).eq('id', id).eq('status', 'pago').select('id');
      if (devolvido?.length) await tirarTaxa(admin, conta, Number(ped.taxa ?? 0));
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
      // só cancela se ainda estiver aguardando: o pagamento pode ter caído agora mesmo
      const { data: cancelou } = await admin.from('pedidos').update({ status: 'cancelado' }).eq('id', id).eq('status', 'aguardando').select('id');
      if (!cancelou?.length) throw new UserError('O pagamento deste pedido acabou de cair. Atualize a página.', 409);
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
