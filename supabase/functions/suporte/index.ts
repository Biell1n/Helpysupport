// ============================================================
// suporte — a empresa abre chamado para a equipe Helpy
//
//   eu             → quem é (empresa, funcionário, equipe Helpy) e quantos abertos
//   status         → serviços do Helpy (bot do Discord, pagamentos) e aviso geral
//   diagnostico    → confere a conta e diz o que está errado e como resolver
//   abrir          → cria o chamado; o assistente do suporte responde na hora
//   listar / ver   → chamados da empresa (o funcionário vê só os dele)
//   responder      → a empresa manda mais informação (reabre se estava resolvido)
//   escalar        → "não resolveu": vai para a fila da equipe Helpy
//   resolver       → a empresa fecha o chamado
//   avaliar        → nota de 1 a 5 depois de resolvido
//   equipe_*       → só a equipe Helpy: fila, responder, status, aviso geral
//
// As tabelas do suporte não têm política de RLS: só esta função lê e grava.
// ============================================================

import { corsHeaders, json, UserError } from '../_shared/cors.ts';
import { admin, profileOf, requireUser } from '../_shared/db.ts';
import { planOf } from '../_shared/plans.ts';
import { addUsage, anthropic, emptyUsage, logUsage, MODELS, textOf } from '../_shared/ai.ts';
import { ARTIGOS, buscarArtigos, CATEGORIAS } from '../_shared/ajuda.ts';
import { gatewayLigado } from '../_shared/discord-tickets.ts';

type Nivel = 'ok' | 'atencao' | 'problema';
interface Item {
  id: string;
  nivel: Nivel;
  cat: string;
  titulo: string;
  detalhe: string;
  acao?: { rotulo: string; para: string };
}

const STATUS = ['ia', 'fila', 'aguardando_voce', 'resolvido'] as const;
const CATS = new Set(CATEGORIAS.map((c) => c.id));
const MAX_ABERTOS = 5;
const MAX_POR_DIA = 10;
const MAX_MSGS_CLIENTE = 60;
const DIA = 864e5;

const inicioDoMes = () => {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString();
};
const limpo = (v: unknown, max: number) => String(v ?? '').replace(/\u0000/g, '').trim().slice(0, max);

/** De quem é a conta: o dono vê a empresa toda; o funcionário fala em nome da empresa dele. */
async function quem(userId: string) {
  const [{ data: p }, { data: eq }] = await Promise.all([
    admin.from('profiles').select('tipo, empresa_id, full_name, company_name').eq('id', userId).maybeSingle(),
    admin.from('helpy_equipe').select('nome').eq('user_id', userId).maybeSingle(),
  ]);
  const tipo = p?.tipo ?? 'empresa';
  const empresa = tipo === 'funcionario' && p?.empresa_id ? p.empresa_id : userId;
  return { tipo, empresa, nome: p?.full_name || p?.company_name || '', staff: eq ? eq.nome : null };
}

// ---------- diagnóstico da conta ----------

async function diagnosticar(conta: string): Promise<Item[]> {
  const itens: Item[] = [];
  const agora = Date.now();
  const [perfil, ass, assistentes, canais, receb, parados, avisos, at, msgs, discordOn] = await Promise.all([
    profileOf(conta),
    admin.from('assinaturas').select('status, proximo_vencimento').eq('owner_id', conta).maybeSingle().then((r) => r.data),
    admin.from('assistants').select('id, name, is_public, config').eq('owner_id', conta).then((r) => r.data ?? []),
    admin.from('canais').select('id, tipo, status, nome, erro, ultimo_evento_em').eq('owner_id', conta).then((r) => r.data ?? []),
    admin.from('recebimentos').select('ativo, situacao').eq('owner_id', conta).maybeSingle().then((r) => r.data),
    admin.from('conversations').select('id', { count: 'exact', head: true }).eq('owner_id', conta).eq('teste', false)
      .eq('status', 'waiting').lt('escalado_em', new Date(agora - DIA).toISOString()).then((r) => r.count ?? 0),
    admin.from('alertas').select('assunto, detalhe, criado_em').eq('owner_id', conta).eq('origem', 'sistema').is('visto_em', null)
      .gte('criado_em', new Date(agora - 7 * DIA).toISOString()).order('criado_em', { ascending: false }).limit(5).then((r) => r.data ?? []),
    admin.from('conversations').select('id', { count: 'exact', head: true }).eq('owner_id', conta).eq('teste', false)
      .gte('created_at', inicioDoMes()).then((r) => r.count ?? 0),
    admin.from('conversation_messages').select('id, conversations!inner(owner_id, teste)', { count: 'exact', head: true })
      .eq('role', 'user').eq('conversations.owner_id', conta).eq('conversations.teste', false).gte('created_at', inicioDoMes()).then((r) => r.count ?? 0),
    gatewayLigado(),
  ]);
  const plano = planOf(perfil);

  // plano e cobrança
  if (plano.id === 'trial' && perfil.trial_ends_at && new Date(perfil.trial_ends_at).getTime() < agora) {
    itens.push({ id: 'teste-acabou', nivel: 'problema', cat: 'plano', titulo: 'O teste grátis terminou', detalhe: 'O assistente para de responder os clientes até você escolher um plano.', acao: { rotulo: 'Escolher plano', para: '/painel/plano' } });
  }
  if (ass?.status === 'atrasada') {
    itens.push({ id: 'fatura-atrasada', nivel: 'problema', cat: 'plano', titulo: 'Fatura do plano em atraso', detalhe: 'Pague a fatura para não perder o plano depois da tolerância.', acao: { rotulo: 'Ver assinatura', para: '/painel/plano' } });
  }
  const pct = (n: number, de: number) => (de ? Math.round((n / de) * 100) : 0);
  const pAt = pct(at, plano.atendimentos);
  const pMsg = pct(msgs, plano.mensagens);
  if (pAt >= 100 || pMsg >= 100) {
    itens.push({
      id: 'cota', nivel: perfil.extra_ativo ? 'atencao' : 'problema', cat: 'plano',
      titulo: pAt >= 100 ? 'Os atendimentos do mês acabaram' : 'As mensagens do mês acabaram',
      detalhe: perfil.extra_ativo ? 'O uso extra está ligado: o assistente segue respondendo e o excedente vai para a fatura.' : 'As conversas novas viram recado para a equipe até o dia 1º. Ligue o uso extra ou mude de plano.',
      acao: { rotulo: 'Ver plano', para: '/painel/plano' },
    });
  } else if (pAt >= 80 || pMsg >= 80) {
    itens.push({ id: 'cota-80', nivel: 'atencao', cat: 'plano', titulo: `Você já usou ${Math.max(pAt, pMsg)}% da cota do mês`, detalhe: `${at} de ${plano.atendimentos} atendimentos e ${msgs} de ${plano.mensagens} mensagens.`, acao: { rotulo: 'Ver plano', para: '/painel/plano' } });
  }

  // assistentes
  if (!assistentes.length) {
    itens.push({ id: 'sem-assistente', nivel: 'problema', cat: 'comecar', titulo: 'Nenhum assistente montado', detalhe: 'Monte o primeiro: conte como o negócio funciona e ele preenche a ficha.', acao: { rotulo: 'Montar assistente', para: '/painel/assistentes/novo' } });
  }
  for (const a of assistentes) {
    if (!a.is_public) itens.push({ id: `link-${a.id}`, nivel: 'atencao', cat: 'comecar', titulo: `O link do ${a.name} está desligado`, detalhe: 'Quem abrir o link não consegue conversar. Ligue em Assistentes, no menu ⋯ do cartão.', acao: { rotulo: 'Abrir Assistentes', para: '/painel/assistentes' } });
    const vende = /^sim/i.test(String((a.config as { fields?: Record<string, { value?: string }> })?.fields?.venda_no_chat?.value ?? ''));
    if (vende && !(receb?.ativo)) {
      itens.push({ id: `carteira-${a.id}`, nivel: 'problema', cat: 'vendas', titulo: `${a.name} vende pelo chat, mas a Carteira não está ativa`, detalhe: 'Sem a Carteira ele não gera o link de pagamento.', acao: { rotulo: 'Ativar Carteira', para: '/painel/carteira' } });
    }
  }

  // canais
  for (const c of canais) {
    const nome = { whatsapp: 'WhatsApp', instagram: 'Instagram', discord: 'Discord' }[c.tipo as string] ?? c.tipo;
    if (c.erro) {
      itens.push({ id: `canal-${c.id}`, nivel: 'problema', cat: 'canais', titulo: `${nome} com erro: ${c.nome ?? ''}`.trim(), detalhe: String(c.erro).slice(0, 300), acao: { rotulo: 'Abrir Canais', para: '/painel/canais' } });
    } else if (c.status !== 'ativo') {
      itens.push({ id: `canal-${c.id}`, nivel: 'atencao', cat: 'canais', titulo: `${nome} não está ativo: ${c.nome ?? ''}`.trim(), detalhe: 'Termine a conexão em Canais para ele receber mensagens.', acao: { rotulo: 'Abrir Canais', para: '/painel/canais' } });
    }
    if (c.tipo === 'discord' && c.status === 'ativo' && !discordOn) {
      itens.push({ id: 'discord-gateway', nivel: 'problema', cat: 'canais', titulo: 'O bot do Discord está fora do ar', detalhe: 'É do nosso lado, não da sua conta. A equipe Helpy já foi avisada; os tickets voltam a ser respondidos assim que ele voltar.' });
    }
  }

  // fila parada e avisos do sistema
  if (parados > 0) {
    itens.push({ id: 'fila-parada', nivel: 'atencao', cat: 'chamados', titulo: `${parados} ${parados === 1 ? 'chamado espera' : 'chamados esperam'} há mais de 24 horas`, detalhe: 'O cliente está aguardando alguém da equipe.', acao: { rotulo: 'Abrir a fila', para: '/painel/atendimentos' } });
  }
  for (const [i, a] of avisos.entries()) {
    itens.push({ id: `aviso-${i}`, nivel: 'atencao', cat: 'chamados', titulo: String(a.assunto).slice(0, 140), detalhe: String(a.detalhe ?? '').slice(0, 300), acao: { rotulo: 'Ver avisos', para: '/painel/avisos' } });
  }

  // o que está em dia também aparece: a pessoa vê o que foi conferido
  if (!itens.some((x) => x.cat === 'plano')) itens.push({ id: 'plano-ok', nivel: 'ok', cat: 'plano', titulo: `Plano ${plano.nome} em dia`, detalhe: `${at} de ${plano.atendimentos} atendimentos e ${msgs} de ${plano.mensagens} mensagens neste mês.` });
  if (assistentes.length && !itens.some((x) => x.cat === 'comecar')) itens.push({ id: 'assistentes-ok', nivel: 'ok', cat: 'comecar', titulo: assistentes.length === 1 ? `${assistentes[0].name} no ar` : `${assistentes.length} assistentes no ar`, detalhe: 'O link está ligado.' });
  if (canais.length && !itens.some((x) => x.cat === 'canais')) itens.push({ id: 'canais-ok', nivel: 'ok', cat: 'canais', titulo: canais.length === 1 ? 'Canal conectado' : `${canais.length} canais conectados`, detalhe: 'Sem erro de conexão.' });
  const peso = { problema: 0, atencao: 1, ok: 2 };
  return itens.sort((a, b) => peso[a.nivel] - peso[b.nivel]);
}

// ---------- assistente do suporte: primeira resposta ----------

const PEDE_EQUIPE = '[EQUIPE]';

async function primeiraResposta(conta: string, cat: string, assunto: string, descricao: string, diag: Item[]) {
  const cands = [...buscarArtigos(`${assunto} ${descricao}`.slice(0, 300), 4), ...ARTIGOS.filter((a) => a.cat === cat)];
  const artigos = [...new Map(cands.map((a) => [a.id, a])).values()].slice(0, 6);
  const sistema = `Você é o assistente do suporte do Helpy (plataforma de assistentes de atendimento com IA para empresas). Quem escreve é uma EMPRESA cliente do Helpy, abrindo um chamado.

Responda em português do Brasil, curto (até 120 palavras), direto e gentil, com passos numerados quando houver o que fazer. Use **negrito** só nos nomes de telas e botões.

Use SOMENTE os artigos da central de ajuda e o diagnóstico da conta abaixo. Se o diagnóstico mostrar a causa provável, diga qual é e como resolver. Nunca invente tela, botão, preço, prazo ou recurso que não esteja aqui. Nunca peça senha, token, chave ou dados de cartão.

Passe para a equipe Helpy (escreva ${PEDE_EQUIPE} sozinho na última linha) quando: for cobrança indevida, reembolso, estorno, pagamento que não confirmou com comprovante, pedido de cópia ou exclusão de dados, suspeita de invasão, erro do sistema (tela quebrada, algo que deveria funcionar e não funciona), o bot do Discord fora do ar, ou quando os artigos não resolvem. Nesse caso diga em uma frase que a equipe Helpy vai olhar e responder aqui, e, se fizer sentido, o que a pessoa pode já mandar (prints, número do pedido). Não prometa prazo.

DIAGNÓSTICO DA CONTA (conferido agora):
${diag.filter((d) => d.nivel !== 'ok').map((d) => `- [${d.nivel}] ${d.titulo}: ${d.detalhe}`).join('\n') || '- nada de errado encontrado'}

ARTIGOS:
${artigos.map((a) => `### ${a.titulo}\n${a.texto}`).join('\n\n')}`;
  const uso = emptyUsage();
  try {
    const r = await anthropic.messages.create({
      model: MODELS.atendimento,
      // o modelo pode raciocinar antes de escrever: folga para o texto sair inteiro
      max_tokens: 3000,
      ...(MODELS.atendimento === 'claude-haiku-4-5' ? {} : { output_config: { effort: 'low' } }),
      system: sistema,
      messages: [{ role: 'user', content: `Categoria: ${CATEGORIAS.find((c) => c.id === cat)?.nome ?? cat}\nAssunto: ${assunto}\n\n${descricao}` }],
    });
    addUsage(uso, r.usage);
    await logUsage(admin, conta, null, 'atendimento', MODELS.atendimento, uso);
    let texto = textOf(r.content as Array<{ type: string; text?: string }>);
    const equipe = texto.includes(PEDE_EQUIPE);
    texto = texto.replaceAll(PEDE_EQUIPE, '').trim();
    if (!texto) return null;
    return { texto, equipe, artigos: artigos.slice(0, 3).map((a) => ({ id: a.id, titulo: a.titulo })) };
  } catch (e) {
    console.error('[suporte] ia', e);
    return null;
  }
}

// ---------- avisos ----------

async function avisarEquipeHelpy(ch: { id: string; numero: number; assunto: string; categoria: string; prioridade: string }, empresa: string) {
  const [{ data: equipe }, { data: p }] = await Promise.all([
    admin.from('helpy_equipe').select('user_id'),
    admin.from('profiles').select('company_name, full_name, plan').eq('id', empresa).maybeSingle(),
  ]);
  const quemAbriu = p?.company_name || p?.full_name || 'Uma empresa';
  for (const m of equipe ?? []) {
    await admin.from('alertas').insert({
      owner_id: m.user_id, origem: 'sistema', chave: `suporte:fila:${ch.id}:${Date.now()}`,
      assunto: `${ch.prioridade === 'alta' ? 'Prioridade · ' : ''}Suporte nº ${ch.numero}: ${ch.assunto}`.slice(0, 200),
      detalhe: `${quemAbriu} · plano ${p?.plan ?? '—'} · ${CATEGORIAS.find((c) => c.id === ch.categoria)?.nome ?? ch.categoria}. Responda em Ajuda → Fila do suporte.`,
    }).then(() => {}, () => {});
  }
}

async function avisarEmpresa(ch: { id: string; numero: number; autor_id: string; empresa_id: string }, texto: string) {
  const destinos = [...new Set([ch.autor_id, ch.empresa_id])];
  for (const d of destinos) {
    await admin.from('alertas').insert({
      owner_id: d, origem: 'sistema', chave: `suporte:resposta:${ch.id}:${Date.now()}`,
      assunto: `A equipe Helpy respondeu o chamado nº ${ch.numero}`,
      detalhe: `${texto.slice(0, 220)}${texto.length > 220 ? '…' : ''} Veja em Ajuda → Meus chamados.`,
    }).then(() => {}, () => {});
  }
}

// ---------- leitura ----------

const CAMPOS = 'id, numero, autor_id, empresa_id, categoria, assunto, status, prioridade, assistant_id, plano, nota, criado_em, atualizado_em, resolvido_em';

/** Chamado parado: resposta da equipe sem retorno em 7 dias, ou da IA em 3 dias, fecha sozinho. */
async function fecharParados(filtro: { empresa?: string }) {
  const limites = [['aguardando_voce', 7], ['ia', 3]] as const;
  for (const [st, dias] of limites) {
    let q = admin.from('suporte_chamados').update({ status: 'resolvido', resolvido_em: new Date().toISOString() })
      .eq('status', st).lt('atualizado_em', new Date(Date.now() - dias * DIA).toISOString());
    if (filtro.empresa) q = q.eq('empresa_id', filtro.empresa);
    const { data } = await q.select('id');
    for (const c of data ?? []) {
      await admin.from('suporte_mensagens').insert({ chamado_id: c.id, autor: 'sistema', texto: `Fechado sozinho depois de ${dias} dias sem retorno. Se ainda precisar, é só responder aqui que ele reabre.` });
    }
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function chamadoPara(id: string, user: { id: string }, eu: Awaited<ReturnType<typeof quem>>) {
  if (!UUID.test(id)) throw new UserError('Chamado não encontrado.', 404);
  const { data: ch } = await admin.from('suporte_chamados').select(`${CAMPOS}, diagnostico`).eq('id', id).maybeSingle();
  if (!ch) throw new UserError('Chamado não encontrado.', 404);
  const dono = eu.tipo === 'funcionario' ? ch.autor_id === user.id : ch.empresa_id === eu.empresa;
  if (!dono && !eu.staff) throw new UserError('Chamado não encontrado.', 404);
  return ch;
}

async function comMensagens(ch: Record<string, unknown>, staff: boolean) {
  const { data: msgs } = await admin.from('suporte_mensagens').select('id, autor, autor_nome, texto, criado_em')
    .eq('chamado_id', ch.id as string).order('criado_em').limit(300);
  const out: Record<string, unknown> = { ...ch, mensagens: msgs ?? [] };
  if (staff) {
    const [{ data: p }, autor] = await Promise.all([
      admin.from('profiles').select('company_name, full_name, plan').eq('id', ch.empresa_id as string).maybeSingle(),
      admin.auth.admin.getUserById(ch.autor_id as string).then((r) => r.data?.user ?? null).catch(() => null),
    ]);
    out.empresa = { nome: p?.company_name || p?.full_name || '—', plano: p?.plan ?? null, email: autor?.email ?? null };
  } else {
    delete out.diagnostico; // o retrato da cobrança fica com a equipe Helpy
  }
  return out;
}

// ---------- servidor ----------

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? '');
    const user = await requireUser(req);
    const eu = await quem(user.id);
    if (eu.tipo === 'cliente' && !eu.staff) throw new UserError('O suporte é para empresas que usam o Helpy. Fale com a empresa pelo chat dela.', 403);

    if (action === 'eu') {
      const abertos = await admin.from('suporte_chamados').select('id', { count: 'exact', head: true })
        .eq(eu.tipo === 'funcionario' ? 'autor_id' : 'empresa_id', eu.tipo === 'funcionario' ? user.id : eu.empresa)
        .in('status', ['fila', 'aguardando_voce', 'ia']).then((r) => r.count ?? 0);
      const fila = eu.staff
        ? await admin.from('suporte_chamados').select('id', { count: 'exact', head: true }).eq('status', 'fila').then((r) => r.count ?? 0)
        : 0;
      return json({ tipo: eu.tipo, staff: !!eu.staff, abertos, fila });
    }

    if (action === 'status') {
      const [{ data: aviso }, discord, asaas, usaDiscord] = await Promise.all([
        admin.from('helpy_config').select('valor').eq('chave', 'suporte_aviso').maybeSingle(),
        gatewayLigado(),
        fetch('https://api.asaas.com/v3/', { signal: AbortSignal.timeout(3000) }).then(() => true, () => false),
        // o bot do Discord só importa para quem tem Discord conectado
        admin.from('canais').select('id', { count: 'exact', head: true }).eq('owner_id', eu.empresa).eq('tipo', 'discord').eq('status', 'ativo').then((r) => (r.count ?? 0) > 0),
      ]);
      const v = aviso?.valor as { texto?: string; nivel?: string; em?: string } | null;
      return json({
        aviso: v?.texto ? v : null,
        servicos: [
          { id: 'chat', nome: 'Chat e atendimento automático', ok: true },
          ...(usaDiscord || eu.staff ? [{ id: 'discord', nome: 'Bot do Discord', ok: discord }] : []),
          { id: 'pagamentos', nome: 'Pagamentos (Pix, cartão e boleto)', ok: asaas },
        ],
      });
    }

    if (action === 'diagnostico') {
      if (eu.tipo !== 'empresa') throw new UserError('Só o dono da conta pode verificar a conta. Abra um chamado que a gente confere.', 403);
      return json({ itens: await diagnosticar(eu.empresa) });
    }

    if (action === 'abrir') {
      const categoria = limpo(body.categoria, 30);
      const assunto = limpo(body.assunto, 140);
      const descricao = limpo(body.descricao, 4000);
      if (!CATS.has(categoria)) throw new UserError('Escolha sobre o que é o chamado.');
      if (assunto.length < 3) throw new UserError('Escreva um assunto curto.');
      if (descricao.length < 15) throw new UserError('Conte um pouco mais do que aconteceu (pelo menos uma frase).');
      const filtro = eu.tipo === 'funcionario' ? ['autor_id', user.id] as const : ['empresa_id', eu.empresa] as const;
      const [abertos, hoje] = await Promise.all([
        admin.from('suporte_chamados').select('id', { count: 'exact', head: true }).eq(filtro[0], filtro[1]).neq('status', 'resolvido').then((r) => r.count ?? 0),
        admin.from('suporte_chamados').select('id', { count: 'exact', head: true }).eq('autor_id', user.id).gte('criado_em', new Date(Date.now() - DIA).toISOString()).then((r) => r.count ?? 0),
      ]);
      if (abertos >= MAX_ABERTOS) throw new UserError(`Você já tem ${abertos} chamados abertos. Continue num deles ou feche os que já resolveram.`, 429);
      if (hoje >= MAX_POR_DIA) throw new UserError('Muitos chamados abertos hoje. Continue num dos que já estão abertos.', 429);

      let assistantId: string | null = null;
      if (body.assistant_id && UUID.test(String(body.assistant_id))) {
        const { data: a } = await admin.from('assistants').select('id').eq('id', String(body.assistant_id)).eq('owner_id', eu.empresa).maybeSingle();
        assistantId = a?.id ?? null;
      }
      const diag = await diagnosticar(eu.empresa);
      const perfil = await profileOf(eu.empresa);
      const plano = planOf(perfil);
      // Business tem prioridade; problema do nosso lado também
      const prioridade = plano.id === 'business' || diag.some((d) => d.id === 'discord-gateway') ? 'alta' : 'normal';
      const { data: ch, error } = await admin.from('suporte_chamados').insert({
        autor_id: user.id, empresa_id: eu.empresa, categoria, assunto, prioridade, assistant_id: assistantId,
        diagnostico: diag, plano: plano.id,
      }).select(CAMPOS).single();
      if (error || !ch) throw error ?? new Error('chamado não criado');
      await admin.from('suporte_mensagens').insert({ chamado_id: ch.id, autor: 'cliente', autor_id: user.id, autor_nome: eu.nome || null, texto: descricao });

      const r = await primeiraResposta(eu.empresa, categoria, assunto, descricao, diag);
      if (r) await admin.from('suporte_mensagens').insert({ chamado_id: ch.id, autor: 'ia', autor_nome: 'Assistente do suporte', texto: r.texto });
      // sem resposta da IA, ou ela mesma pediu a equipe: vai direto para a fila
      if (!r || r.equipe) {
        await admin.from('suporte_chamados').update({ status: 'fila' }).eq('id', ch.id);
        ch.status = 'fila';
        await avisarEquipeHelpy(ch, eu.empresa);
      }
      return json({ chamado: await comMensagens(ch, false), artigos: r?.artigos ?? [] });
    }

    if (action === 'listar') {
      await fecharParados({ empresa: eu.empresa });
      let q = admin.from('suporte_chamados').select(CAMPOS).order('atualizado_em', { ascending: false }).limit(100);
      q = eu.tipo === 'funcionario' ? q.eq('autor_id', user.id) : q.eq('empresa_id', eu.empresa);
      const { data } = await q;
      return json({ chamados: data ?? [] });
    }

    if (action === 'ver') {
      const ch = await chamadoPara(String(body.id ?? ''), user, eu);
      return json({ chamado: await comMensagens(ch, !!eu.staff && ch.empresa_id !== eu.empresa) });
    }

    if (action === 'responder' || action === 'escalar' || action === 'resolver' || action === 'avaliar') {
      const ch = await chamadoPara(String(body.id ?? ''), user, eu);
      const agora = new Date().toISOString();

      if (action === 'responder') {
        const texto = limpo(body.texto, 4000);
        if (!texto) throw new UserError('Escreva a mensagem.');
        const { count } = await admin.from('suporte_mensagens').select('id', { count: 'exact', head: true }).eq('chamado_id', ch.id).eq('autor', 'cliente');
        if ((count ?? 0) >= MAX_MSGS_CLIENTE) throw new UserError('Este chamado já está muito longo. Abra um novo, se for outro assunto.', 429);
        await admin.from('suporte_mensagens').insert({ chamado_id: ch.id, autor: 'cliente', autor_id: user.id, autor_nome: eu.nome || null, texto });
        // responder chama a equipe (resolvido reabre; a IA não volta a responder)
        const iaParaFila = ch.status === 'ia' || ch.status === 'resolvido' || ch.status === 'aguardando_voce';
        await admin.from('suporte_chamados').update({ status: 'fila', atualizado_em: agora, resolvido_em: null }).eq('id', ch.id);
        if (iaParaFila) await avisarEquipeHelpy(ch, ch.empresa_id);
      }
      if (action === 'escalar') {
        if (ch.status !== 'ia') throw new UserError('Este chamado já está com a equipe.');
        await admin.from('suporte_mensagens').insert({ chamado_id: ch.id, autor: 'sistema', texto: 'Passou para a equipe Helpy.' });
        await admin.from('suporte_chamados').update({ status: 'fila', atualizado_em: agora }).eq('id', ch.id);
        await avisarEquipeHelpy(ch, ch.empresa_id);
      }
      if (action === 'resolver') {
        await admin.from('suporte_mensagens').insert({ chamado_id: ch.id, autor: 'sistema', texto: 'Marcado como resolvido.' });
        await admin.from('suporte_chamados').update({ status: 'resolvido', atualizado_em: agora, resolvido_em: agora }).eq('id', ch.id);
      }
      if (action === 'avaliar') {
        const nota = Number(body.nota);
        if (ch.status !== 'resolvido') throw new UserError('Dá para avaliar depois de resolvido.');
        if (!Number.isInteger(nota) || nota < 1 || nota > 5) throw new UserError('Nota de 1 a 5.');
        await admin.from('suporte_chamados').update({ nota }).eq('id', ch.id);
      }
      const { data: novo } = await admin.from('suporte_chamados').select(`${CAMPOS}, diagnostico`).eq('id', ch.id).single();
      return json({ chamado: await comMensagens(novo!, false) });
    }

    // ---------- equipe Helpy ----------
    if (action.startsWith('equipe_')) {
      if (!eu.staff) throw new UserError('Só a equipe Helpy.', 403);

      if (action === 'equipe_fila') {
        await fecharParados({});
        const status = STATUS.includes(body.status) ? body.status : 'fila';
        const { data } = await admin.from('suporte_chamados').select(CAMPOS).eq('status', status)
          .order('prioridade', { ascending: true }).order('atualizado_em', { ascending: status !== 'resolvido' }).limit(200);
        const donos = [...new Set((data ?? []).map((c) => c.empresa_id))];
        const { data: perfis } = donos.length
          ? await admin.from('profiles').select('id, company_name, full_name').in('id', donos)
          : { data: [] };
        const nomes = new Map((perfis ?? []).map((p) => [p.id, p.company_name || p.full_name || '—']));
        const contagem = await Promise.all(STATUS.map((s) => admin.from('suporte_chamados').select('id', { count: 'exact', head: true }).eq('status', s).then((r) => [s, r.count ?? 0])));
        return json({ chamados: (data ?? []).map((c) => ({ ...c, empresa_nome: nomes.get(c.empresa_id) ?? '—' })), contagem: Object.fromEntries(contagem) });
      }

      if (action === 'equipe_responder' || action === 'equipe_status') {
        const ch = await chamadoPara(String(body.id ?? ''), user, eu);
        const agora = new Date().toISOString();
        if (action === 'equipe_responder') {
          const texto = limpo(body.texto, 5000);
          if (!texto) throw new UserError('Escreva a resposta.');
          await admin.from('suporte_mensagens').insert({ chamado_id: ch.id, autor: 'equipe', autor_id: user.id, autor_nome: `${eu.staff} · Equipe Helpy`, texto });
          const resolver = body.resolver === true;
          await admin.from('suporte_chamados').update({
            status: resolver ? 'resolvido' : 'aguardando_voce', atualizado_em: agora, resolvido_em: resolver ? agora : null,
          }).eq('id', ch.id);
          await avisarEmpresa(ch, texto);
        } else {
          const patch: Record<string, unknown> = { atualizado_em: agora };
          if (STATUS.includes(body.status)) {
            patch.status = body.status;
            patch.resolvido_em = body.status === 'resolvido' ? agora : null;
          }
          if (body.prioridade === 'alta' || body.prioridade === 'normal') patch.prioridade = body.prioridade;
          await admin.from('suporte_chamados').update(patch).eq('id', ch.id);
        }
        const { data: novo } = await admin.from('suporte_chamados').select(`${CAMPOS}, diagnostico`).eq('id', ch.id).single();
        return json({ chamado: await comMensagens(novo!, true) });
      }

      if (action === 'equipe_aviso') {
        const texto = limpo(body.texto, 400);
        const nivel = body.nivel === 'problema' ? 'problema' : 'info';
        // sem texto = sem aviso (a coluna não aceita nulo)
        const valor = texto ? { texto, nivel, em: new Date().toISOString() } : {};
        const { error } = await admin.from('helpy_config').upsert({ chave: 'suporte_aviso', valor, atualizado_em: new Date().toISOString() }, { onConflict: 'chave' });
        if (error) throw error;
        return json({ aviso: texto ? valor : null });
      }
    }

    throw new UserError(`Ação desconhecida: ${action}`);
  } catch (err) {
    if (err instanceof UserError) return json({ error: err.message }, err.status);
    console.error('[suporte]', err);
    return json({ error: 'Algo deu errado do nosso lado. Tente de novo em instantes.' }, 500);
  }
});
