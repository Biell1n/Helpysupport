// ============================================================
// Tickets do Discord (bot do próprio Helpy).
//
//   /helpy-config     → menu só para quem administra o servidor: canal do
//                       botão, cargo da equipe, canal de avisos da equipe e
//                       o que falta para funcionar. Dá para escolher tudo
//                       à mão, ler o passo a passo ou pedir "Montar tudo
//                       pra mim" (o bot cria a categoria, os canais e o
//                       cargo já com as permissões certas)
//   Abrir atendimento → botão fixado no canal (ou /atendimento): cria um
//                       tópico privado só do cliente, da equipe e do bot
//   no tópico         → o cliente conversa com o assistente; quem é da
//                       equipe escreve ali e assume. Tudo cai em
//                       Atendimentos, e o que a equipe faz no painel
//                       (responder, assumir, devolver, encerrar) aparece
//                       no tópico.
//
// As mensagens livres do tópico chegam pelo servidor que fica ligado no
// Discord (gateway/discord-gateway.mjs). Sem ele, dá para falar no tópico
// pelo /helpy.
// ============================================================

import { admin } from './db.ts';
import {
  botHelpy,
  type Canal,
  DISCORD_HELPY,
  ErroDoCanal,
  guardarSegredo,
  jaVista,
  pedacos,
  PERM,
  PERMISSOES_BOT,
  postarNoTopico,
  type Segredo,
  segredoDo,
  urlPermissoesBot,
  urlPermissoesMontagem,
} from './canais.ts';
import { atenderNoCanal } from './canal-atender.ts';

const AZUL = 0x1f66f4;
const SITE = Deno.env.get('SITE_URL') ?? 'https://helpysupport.com';
const SO_TEXTO = 'Por enquanto eu leio só mensagens de texto por aqui. Pode escrever o que você precisa?';

export type Pessoa = { id: string; username?: string; global_name?: string | null };
export type Membro = { user?: Pessoa; nick?: string | null; roles?: string[]; permissions?: string };

export interface Ticket {
  thread_id: string;
  canal_id: string;
  cliente_id: string;
  cliente_nome: string | null;
  status_avisado: string | null;
  fechado_em: string | null;
}

const contatoDo = (thread: string) => `ticket:${thread}`;
export const nomeDe = (m: Membro | undefined, p: Pessoa | undefined) =>
  String(m?.nick || p?.global_name || p?.username || 'Alguém').slice(0, 80);

/** Quem administra o servidor (Gerenciar servidor ou Administrador). */
export function ehAdmin(m: Membro | undefined) {
  const p = BigInt(m?.permissions ?? '0');
  return (p & PERM.ADMINISTRADOR) !== 0n || (p & PERM.GERENCIAR_SERVIDOR) !== 0n;
}

/** O servidor que fica ligado no Discord deu sinal de vida nos últimos minutos? */
export async function gatewayLigado(): Promise<boolean> {
  const { data } = await admin.from('helpy_servicos').select('visto_em').eq('nome', 'discord-gateway').maybeSingle();
  return !!data && Date.now() - new Date(data.visto_em).getTime() < 5 * 60e3;
}

export async function ticketDo(thread: string | undefined): Promise<Ticket | null> {
  if (!thread || !/^\d{5,30}$/.test(thread)) return null;
  const { data } = await admin.from('discord_tickets').select('*').eq('thread_id', thread).maybeSingle();
  return (data as Ticket) ?? null;
}

async function conversaDo(t: Ticket) {
  const { data } = await admin.from('conversations')
    .select('id, status, assumido_nome, escalado_em')
    .eq('canal_id', t.canal_id).eq('contato_externo', contatoDo(t.thread_id))
    .order('last_message_at', { ascending: false }).limit(1).maybeSingle();
  return data as { id: string; status: string; assumido_nome: string | null; escalado_em: string | null } | null;
}

async function salvarConfig(canal: Canal, mudar: Record<string, string | null>) {
  const config = { ...canal.config };
  for (const [k, v] of Object.entries(mudar)) {
    if (v === null) delete config[k];
    else config[k] = v;
  }
  await admin.from('canais').update({ config }).eq('id', canal.id);
  canal.config = config;
}

const fala = (thread: string, content: string, extra: Record<string, unknown> = {}) =>
  botHelpy(`/channels/${thread}/messages`, { method: 'POST', body: { content, allowed_mentions: { parse: [] }, ...extra } });

// ------------------------------------------------------------
// Permissões: o que o bot (ou o cargo da equipe) pode fazer num canal
// ------------------------------------------------------------
type Sobrescrita = { id: string; type: number; allow: string; deny: string };
type Cargo = { id: string; permissions: string };

async function permissoesNoCanal(servidor: string, canalId: string, alvo: { usuario?: string; cargos: string[] }) {
  const [cargos, canal] = await Promise.all([
    botHelpy(`/guilds/${servidor}/roles`) as Promise<Cargo[]>,
    botHelpy(`/channels/${canalId}`) as Promise<{ permission_overwrites?: Sobrescrita[]; guild_id?: string }>,
  ]);
  if (canal.guild_id !== servidor) throw new Error('canal de outro servidor');
  const de = (id: string) => BigInt(cargos.find((c) => c.id === id)?.permissions ?? '0');
  let p = de(servidor); // @everyone tem o mesmo id do servidor
  for (const c of alvo.cargos) p |= de(c);
  if (p & PERM.ADMINISTRADOR) return -1n; // tudo liberado
  const sob = canal.permission_overwrites ?? [];
  const todos = sob.find((o) => o.id === servidor);
  if (todos) p = (p & ~BigInt(todos.deny)) | BigInt(todos.allow);
  let negar = 0n, liberar = 0n;
  for (const o of sob) {
    if (o.type === 0 && alvo.cargos.includes(o.id)) {
      negar |= BigInt(o.deny);
      liberar |= BigInt(o.allow);
    }
  }
  p = (p & ~negar) | liberar;
  const meu = alvo.usuario ? sob.find((o) => o.type === 1 && o.id === alvo.usuario) : null;
  if (meu) p = (p & ~BigInt(meu.deny)) | BigInt(meu.allow);
  if (!(p & PERM.VER_CANAL)) return 0n;
  return p;
}

const tem = (p: bigint, bit: bigint) => p === -1n || (p & bit) !== 0n;

const PRECISA_BOT: [bigint, string][] = [
  [PERM.VER_CANAL, 'Ver canal'],
  [PERM.ENVIAR, 'Enviar mensagens'],
  [PERM.ENVIAR_EM_TOPICOS, 'Enviar mensagens em tópicos'],
  [PERM.TOPICOS_PRIVADOS, 'Criar tópicos privados'],
  [PERM.GERENCIAR_TOPICOS, 'Gerenciar tópicos'],
  [PERM.LINKS, 'Inserir links'],
  [PERM.HISTORICO, 'Ver histórico de mensagens'],
];

/** O que falta para o atendimento funcionar bem (cada linha já diz o que fazer). */
async function conferencia(canal: Canal): Promise<{ ok: boolean; linhas: string[] }> {
  const linhas: string[] = [];
  let ok = true;
  const servidor = canal.externo_id;
  const painel = canal.config.painel_canal;
  const cargo = canal.config.cargo_equipe;

  if (!painel) {
    ok = false;
    linhas.push('❌ Escolha abaixo o **canal do atendimento**: é onde fica o botão "Abrir atendimento" e onde os tickets são criados.');
  } else {
    try {
      const membro = await botHelpy(`/guilds/${servidor}/members/${DISCORD_HELPY.appId}`) as { roles: string[] };
      const p = await permissoesNoCanal(servidor, painel, { usuario: DISCORD_HELPY.appId, cargos: membro.roles ?? [] });
      const faltam = PRECISA_BOT.filter(([bit]) => !tem(p, bit)).map(([, nome]) => nome);
      if (faltam.length) {
        ok = false;
        linhas.push(`❌ No canal <#${painel}>, o bot precisa de: **${faltam.join(', ')}**. Use o botão "Dar permissões ao bot" ou libere nas permissões do canal.`);
      } else linhas.push(`✅ O bot tem tudo o que precisa em <#${painel}>.`);
      if (!tem(p, PERM.WEBHOOKS)) {
        linhas.push('➖ Opcional: com **Gerenciar webhooks**, a resposta dada pelo site aparece com o nome e a foto de quem atende.');
      }
    } catch (e) {
      ok = false;
      linhas.push(`❌ Não consegui conferir o canal <#${painel}> (${e instanceof ErroDoCanal && e.status === 404 ? 'ele foi apagado' : 'sem acesso'}). Escolha outro.`);
    }
  }

  if (painel) {
    try {
      const p = await permissoesNoCanal(servidor, painel, { cargos: [] });
      if (!tem(p, PERM.VER_CANAL)) {
        linhas.push(`⚠️ O @everyone não vê <#${painel}>. Se só um cargo deve abrir atendimento, tudo bem; se não, libere **Ver canal**.`);
      } else if (!tem(p, PERM.ENVIAR_EM_TOPICOS)) {
        ok = false;
        linhas.push(`❌ Os clientes não conseguem escrever no ticket: em <#${painel}>, libere **Enviar mensagens em tópicos** para o @everyone.`);
      } else linhas.push('✅ Os clientes veem o botão e conseguem escrever no ticket.');
    } catch { /* já avisado acima */ }
  }

  if (!cargo) {
    linhas.push('➖ Escolha o **cargo da equipe**: ele é chamado quando o cliente pede uma pessoa. Sem cargo, só quem administra o servidor vê os tickets.');
  } else if (painel) {
    try {
      const p = await permissoesNoCanal(servidor, painel, { cargos: [cargo] });
      if (!tem(p, PERM.GERENCIAR_TOPICOS) || !tem(p, PERM.ENVIAR_EM_TOPICOS)) {
        linhas.push(`⚠️ O cargo <@&${cargo}> precisa de **Gerenciar tópicos** e **Enviar mensagens em tópicos** em <#${painel}> para ver e responder todos os tickets.`);
      } else linhas.push(`✅ O cargo <@&${cargo}> vê e responde os tickets.`);
    } catch {
      linhas.push(`⚠️ Não consegui conferir o cargo <@&${cargo}>.`);
    }
  }

  const equipe = canal.config.canal_equipe;
  if (!equipe) {
    linhas.push('➖ Opcional: um **canal de avisos da equipe** recebe "novo atendimento" e "o cliente pediu uma pessoa", com o link do ticket.');
  } else {
    try {
      const membro = await botHelpy(`/guilds/${servidor}/members/${DISCORD_HELPY.appId}`) as { roles: string[] };
      const p = await permissoesNoCanal(servidor, equipe, { usuario: DISCORD_HELPY.appId, cargos: membro.roles ?? [] });
      linhas.push(tem(p, PERM.ENVIAR)
        ? `✅ Os avisos da equipe chegam em <#${equipe}>.`
        : `❌ O bot não consegue escrever em <#${equipe}>: libere **Ver canal** e **Enviar mensagens** para ele.`);
    } catch {
      linhas.push(`❌ Não consegui conferir <#${equipe}>. Escolha outro.`);
    }
  }

  linhas.push(
    (await gatewayLigado())
      ? '✅ Conversa livre nos tickets: ligada (é só escrever no tópico).'
      : '➖ Conversa livre nos tickets: desligada no momento. Enquanto isso, no ticket, o cliente fala com `/helpy`.',
  );
  if (painel && !canal.config.painel_msg) linhas.push('👉 Falta só **publicar o botão** no canal.');
  return { ok, linhas };
}

/** O menu do /helpy-config (só quem administra vê). */
async function menuConfig(canal: Canal, aviso?: string) {
  const { data: a } = await admin.from('assistants').select('name, config').eq('id', canal.assistant_id).maybeSingle();
  const nome = String(a?.config?.fields?.nome_assistente?.value ?? '').trim() || a?.name || 'o assistente';
  const { linhas } = await conferencia(canal);
  const painel = canal.config.painel_canal;
  const cargo = canal.config.cargo_equipe;
  const equipe = canal.config.canal_equipe;
  return {
    content: aviso ?? '',
    allowed_mentions: { parse: [] },
    embeds: [{
      color: AZUL,
      title: 'Atendimento do Helpy neste servidor',
      description: [
        `Quem atende: **${nome}** (troque em Canais, no painel do Helpy).`,
        '',
        'Como funciona: o cliente clica em **Abrir atendimento**, o bot cria um tópico privado e o assistente conversa com ele. Quando precisa de uma pessoa, a equipe é chamada. Tudo aparece em Atendimentos no painel, e quem responde por lá aparece aqui com o próprio nome.',
        '',
        'Escolha os canais e o cargo do seu jeito nos menus abaixo, veja o **passo a passo**, ou clique em **⚡ Montar tudo pra mim** que eu crio tudo pronto.',
        '',
        ...linhas,
      ].join('\n'),
    }],
    components: [
      { type: 1, components: [{
        type: 8, custom_id: 'cfg:canal', placeholder: 'Canal do atendimento (onde fica o botão)', channel_types: [0],
        min_values: 1, max_values: 1, ...(painel ? { default_values: [{ id: painel, type: 'channel' }] } : {}),
      }] },
      { type: 1, components: [{
        type: 6, custom_id: 'cfg:cargo', placeholder: 'Cargo da equipe (quem atende)', min_values: 0, max_values: 1,
        ...(cargo ? { default_values: [{ id: cargo, type: 'role' }] } : {}),
      }] },
      { type: 1, components: [{
        type: 8, custom_id: 'cfg:equipe', placeholder: 'Canal de avisos da equipe (opcional)', channel_types: [0],
        min_values: 0, max_values: 1, ...(equipe ? { default_values: [{ id: equipe, type: 'channel' }] } : {}),
      }] },
      { type: 1, components: [
        { type: 2, style: 3, custom_id: 'cfg:montar', label: 'Montar tudo pra mim', emoji: { name: '⚡' } },
        { type: 2, style: 2, custom_id: 'cfg:guia', label: 'Passo a passo', emoji: { name: '📋' } },
        { type: 2, style: 1, custom_id: 'cfg:publicar', label: canal.config.painel_msg ? 'Publicar o botão de novo' : 'Publicar o botão', disabled: !painel },
        { type: 2, style: 2, custom_id: 'cfg:checar', label: 'Conferir de novo' },
      ] },
      { type: 1, components: [
        { type: 2, style: 5, url: urlPermissoesBot(canal.externo_id), label: 'Dar permissões ao bot' },
        { type: 2, style: 5, url: `${SITE}/painel/atendimentos`, label: 'Abrir o painel' },
      ] },
    ],
  };
}

const VOLTAR = { type: 1, components: [{ type: 2, style: 2, custom_id: 'cfg:checar', label: 'Voltar ao menu' }] };

/** O passo a passo para montar à mão (para quem quer do próprio jeito). */
function passoAPasso() {
  return {
    content: '',
    allowed_mentions: { parse: [] },
    embeds: [{
      color: AZUL,
      title: '📋 Passo a passo para montar à mão',
      description: [
        '**1. Cargo da equipe**',
        'Configurações do servidor → Cargos → **Criar cargo**. Nome sugerido: `Equipe de atendimento`. Dê esse cargo para quem atende.',
        '',
        '**2. Categoria (opcional)**',
        'Clique com o botão direito na lista de canais → **Criar categoria**: `Atendimento`.',
        '',
        '**3. Canal do atendimento** — ex.: `#abrir-atendimento`',
        'Editar canal → Permissões:',
        '• **@everyone**: Ver canal ✅ · Ver histórico ✅ · Enviar mensagens em tópicos ✅ · Enviar mensagens ❌',
        '• **Equipe de atendimento**: Ver canal ✅ · Gerenciar tópicos ✅ · Enviar mensagens em tópicos ✅',
        '• **o bot**: Ver canal · Enviar mensagens · Enviar mensagens em tópicos · Criar tópicos privados · Gerenciar tópicos · Inserir links · Gerenciar webhooks ✅',
        '',
        '**4. Canal de avisos da equipe (opcional)** — ex.: `#equipe-atendimento`',
        '• **@everyone**: Ver canal ❌',
        '• **Equipe de atendimento** e **o bot**: Ver canal ✅ · Enviar mensagens ✅',
        'Ali chegam "novo atendimento" e "o cliente pediu uma pessoa", com o link do ticket.',
        '',
        '**5. Volte aqui**',
        'Escolha o canal do atendimento, o cargo e o canal de avisos nos menus e clique em **Publicar o botão**. O menu mostra com ✅ e ❌ se ficou faltando alguma coisa.',
      ].join('\n'),
    }],
    components: [VOLTAR],
  };
}

// ------------------------------------------------------------
// Montar tudo pra mim: categoria, canais e cargo com as permissões certas
// ------------------------------------------------------------
async function permissoesDoBotNoServidor(servidor: string) {
  const [cargos, membro] = await Promise.all([
    botHelpy(`/guilds/${servidor}/roles`) as Promise<Cargo[]>,
    botHelpy(`/guilds/${servidor}/members/${DISCORD_HELPY.appId}`) as Promise<{ roles: string[] }>,
  ]);
  let p = BigInt(cargos.find((c) => c.id === servidor)?.permissions ?? '0');
  for (const id of membro.roles ?? []) p |= BigInt(cargos.find((c) => c.id === id)?.permissions ?? '0');
  return { p: p & PERM.ADMINISTRADOR ? -1n : p, cargos };
}

/** O que a montagem vai criar (o que já existe e está configurado é aproveitado). */
async function oQueMontar(canal: Canal) {
  const servidor = canal.externo_id;
  const { p, cargos } = await permissoesDoBotNoServidor(servidor);
  const existe = async (id?: string) => !!id && await botHelpy(`/channels/${id}`).then(() => true).catch(() => false);
  const cargo = canal.config.cargo_equipe && cargos.some((c) => c.id === canal.config.cargo_equipe) ? canal.config.cargo_equipe : null;
  const plano = {
    cargo,
    painel: (await existe(canal.config.painel_canal)) ? canal.config.painel_canal : null,
    equipe: (await existe(canal.config.canal_equipe)) ? canal.config.canal_equipe : null,
  };
  const faltaCanais = !tem(p, PERM.GERENCIAR_CANAIS) && (!plano.painel || !plano.equipe);
  const faltaCargos = !tem(p, PERM.GERENCIAR_CARGOS) && !plano.cargo;
  // as permissões que o bot dá a si mesmo no canal novo ele precisa ter no servidor
  const base = BigInt(PERMISSOES_BOT);
  const faltaBase = p !== -1n && (p & base) !== base && (!plano.painel || !plano.equipe);
  return {
    ...plano,
    faltam: [faltaCanais && 'Gerenciar canais', faltaCargos && 'Gerenciar cargos', faltaBase && 'as permissões do atendimento'].filter(Boolean) as string[],
  };
}

async function previaDaMontagem(canal: Canal) {
  const m = await oQueMontar(canal);
  const itens = [
    '📁 a categoria **Atendimento**',
    m.painel ? `💬 vou usar <#${m.painel}> para o botão (já está escolhido)` : '💬 o canal **#abrir-atendimento**: todo mundo vê e abre atendimento por ali, mas não escreve no canal (só dentro do próprio ticket)',
    m.equipe ? `🔔 vou usar <#${m.equipe}> para os avisos (já está escolhido)` : '🔔 o canal **#equipe-atendimento**: só a equipe vê; chegam os avisos de novo atendimento e quando o cliente pede uma pessoa',
    m.cargo ? `👥 vou usar o cargo <@&${m.cargo}> (já está escolhido)` : '👥 o cargo **@Equipe de atendimento**: quem tiver esse cargo vê e responde todos os tickets',
    '📌 e publico o botão **Abrir atendimento**',
  ];
  const linhas = [...itens];
  const botoes: unknown[] = [];
  if (m.faltam.length) {
    linhas.push('', `⚠️ Para criar sozinho eu preciso, só agora, de **${m.faltam.join('** e **')}**. Clique em **Dar permissões para montar**, autorize e depois em **Criar agora**. Depois de pronto, se quiser, pode tirar essas permissões do bot.`);
    botoes.push({ type: 2, style: 5, url: urlPermissoesMontagem(canal.externo_id), label: 'Dar permissões para montar' });
  }
  botoes.push({ type: 2, style: 3, custom_id: 'cfg:montar_ok', label: 'Criar agora', emoji: { name: '⚡' } });
  botoes.push({ type: 2, style: 2, custom_id: 'cfg:checar', label: 'Voltar' });
  return {
    content: '',
    allowed_mentions: { parse: [] },
    embeds: [{ color: AZUL, title: '⚡ Montar tudo pra mim', description: ['Vou criar:', '', ...linhas].join('\n') }],
    components: [{ type: 1, components: botoes }],
  };
}

const sobre = (id: string, type: 0 | 1, allow: bigint, deny = 0n) => ({ id, type, allow: String(allow), deny: String(deny) });

/** Cria o que falta e deixa tudo configurado. Devolve o aviso para o menu. */
async function montarTudo(canal: Canal): Promise<string> {
  const servidor = canal.externo_id;
  const m = await oQueMontar(canal);
  if (m.faltam.length) {
    return `Ainda falta dar ao bot: **${m.faltam.join('** e **')}**. Clique em ⚡ Montar tudo pra mim → Dar permissões para montar, e tente de novo.`;
  }
  const bot = DISCORD_HELPY.appId;
  const motivo = 'Atendimento do Helpy (montado pelo /helpy-config)';
  const criados: string[] = [];

  let cargo = m.cargo;
  if (!cargo) {
    const r = await botHelpy(`/guilds/${servidor}/roles`, {
      method: 'POST', motivo, body: { name: 'Equipe de atendimento', color: AZUL, mentionable: true, permissions: '0' },
    }) as { id: string };
    cargo = r.id;
    criados.push(`o cargo <@&${cargo}>`);
  }

  let categoria: string | undefined;
  if (!m.painel || !m.equipe) {
    const r = await botHelpy(`/guilds/${servidor}/channels`, { method: 'POST', motivo, body: { name: 'Atendimento', type: 4 } }) as { id: string };
    categoria = r.id;
  }

  let painel = m.painel;
  if (!painel) {
    const r = await botHelpy(`/guilds/${servidor}/channels`, {
      method: 'POST', motivo,
      body: {
        name: 'abrir-atendimento', type: 0, parent_id: categoria,
        topic: 'Clique em "Abrir atendimento" para falar com a gente. A conversa é privada.',
        permission_overwrites: [
          sobre(servidor, 0, PERM.VER_CANAL | PERM.HISTORICO | PERM.ENVIAR_EM_TOPICOS | PERM.ANEXOS, PERM.ENVIAR),
          sobre(cargo, 0, PERM.VER_CANAL | PERM.HISTORICO | PERM.ENVIAR_EM_TOPICOS | PERM.GERENCIAR_TOPICOS | PERM.ANEXOS),
          sobre(bot, 1, PERM.VER_CANAL | PERM.ENVIAR | PERM.ENVIAR_EM_TOPICOS | PERM.TOPICOS_PRIVADOS | PERM.GERENCIAR_TOPICOS |
            PERM.LINKS | PERM.ANEXOS | PERM.HISTORICO | PERM.WEBHOOKS),
        ],
      },
    }) as { id: string };
    painel = r.id;
    criados.push(`<#${painel}>`);
  }

  let equipe = m.equipe;
  if (!equipe) {
    const r = await botHelpy(`/guilds/${servidor}/channels`, {
      method: 'POST', motivo,
      body: {
        name: 'equipe-atendimento', type: 0, parent_id: categoria,
        topic: 'Avisos do Helpy: novos atendimentos e clientes pedindo uma pessoa.',
        permission_overwrites: [
          sobre(servidor, 0, 0n, PERM.VER_CANAL),
          sobre(cargo, 0, PERM.VER_CANAL | PERM.ENVIAR | PERM.HISTORICO),
          sobre(bot, 1, PERM.VER_CANAL | PERM.ENVIAR | PERM.LINKS | PERM.HISTORICO),
        ],
      },
    }) as { id: string };
    equipe = r.id;
    criados.push(`<#${equipe}>`);
    await fala(equipe, [
      `👋 Aqui chegam os avisos do atendimento: cada novo ticket e quando um cliente pede uma pessoa, sempre com o link.`,
      `Quem tiver o cargo <@&${cargo}> vê e responde todos os tickets. Para dar o cargo: clique no nome da pessoa → **Cargos** → **Equipe de atendimento**.`,
    ].join('\n'));
  }

  await salvarConfig(canal, { painel_canal: painel, cargo_equipe: cargo, canal_equipe: equipe, ...(categoria ? { categoria } : {}) });
  const publicado = await publicarPainel(canal);
  return [
    criados.length ? `✅ Pronto! Criei ${criados.join(', ')}${categoria ? ' (na categoria **Atendimento**)' : ''}.` : '✅ Pronto!',
    publicado.replace(/^Pronto! /, ''),
    `👉 Agora é só dar o cargo <@&${cargo}> para quem atende.`,
  ].join('\n');
}

/** Aviso no canal da equipe (se tiver um). Devolve se mandou. */
async function avisarEquipe(config: Record<string, string>, texto: string, chamarCargo = false) {
  const equipe = config.canal_equipe;
  if (!equipe) return false;
  const cargo = config.cargo_equipe;
  const comCargo = chamarCargo && cargo;
  await fala(equipe, comCargo ? `<@&${cargo}> ${texto}` : texto, comCargo ? { allowed_mentions: { roles: [cargo] } } : {});
  return true;
}

/** Publica (ou republica) a mensagem com o botão "Abrir atendimento" e prepara o webhook da equipe. */
async function publicarPainel(canal: Canal): Promise<string> {
  const painel = canal.config.painel_canal;
  if (!painel) return 'Escolha primeiro o canal do atendimento.';
  const { data: a } = await admin.from('assistants').select('name, config').eq('id', canal.assistant_id).maybeSingle();
  const nome = String(a?.config?.fields?.nome_assistente?.value ?? '').trim() || a?.name || 'nosso assistente';
  let msg: { id: string };
  try {
    msg = await botHelpy(`/channels/${painel}/messages`, {
      method: 'POST',
      body: {
        embeds: [{
          color: AZUL,
          title: 'Precisa de ajuda?',
          description: `Clique em **Abrir atendimento** para falar com ${nome}. A conversa é privada: só você e a equipe veem.`,
        }],
        components: [{ type: 1, components: [{ type: 2, style: 1, custom_id: 'abrir', label: 'Abrir atendimento', emoji: { name: '💬' } }] }],
      },
    }) as { id: string };
  } catch (e) {
    if (e instanceof ErroDoCanal && (e.status === 403 || e.status === 404)) {
      return `Não consegui escrever em <#${painel}>. Confira se o bot pode ver o canal e enviar mensagens nele.`;
    }
    throw e;
  }
  const antigo = canal.config.painel_msg;
  const antigoCanal = canal.config.painel_msg_canal;
  if (antigo && antigoCanal) await botHelpy(`/channels/${antigoCanal}/messages/${antigo}`, { method: 'DELETE' }).catch(() => {});
  await salvarConfig(canal, { painel_msg: msg.id, painel_msg_canal: painel });

  // webhook do canal: a resposta da equipe pelo site sai com o nome de quem atende
  let extra = '';
  const s: Segredo = await segredoDo(admin, canal.id).catch(() => ({ token: '' }));
  if (s.webhook?.canal !== painel) {
    try {
      const w = await botHelpy(`/channels/${painel}/webhooks`, { method: 'POST', body: { name: 'Equipe (Helpy)' }, motivo: 'Respostas da equipe pelo painel do Helpy' }) as { id: string; token: string };
      if (s.webhook) await botHelpy(`/webhooks/${s.webhook.id}`, { method: 'DELETE' }).catch(() => {});
      await guardarSegredo(admin, canal.id, { ...s, webhook: { id: w.id, token: w.token, canal: painel } });
    } catch {
      extra = ' (Sem "Gerenciar webhooks", as respostas do site saem pelo bot com o nome em negrito.)';
    }
  }
  return `Pronto! O botão está em <#${painel}>.${extra}`;
}

// ------------------------------------------------------------
// Tickets
// ------------------------------------------------------------
/** Abre um ticket (tópico privado) para a pessoa. Devolve o que mostrar para ela. */
async function abrirTicket(canal: Canal, pessoa: Pessoa, membro: Membro | undefined, ondeEsta?: string): Promise<string> {
  const painel = canal.config.painel_canal || ondeEsta;
  if (!painel) return 'O atendimento ainda não foi configurado neste servidor. Quem administra pode usar /helpy-config.';

  const { data: aberto } = await admin.from('discord_tickets').select('thread_id')
    .eq('canal_id', canal.id).eq('cliente_id', pessoa.id).is('fechado_em', null)
    .order('criado_em', { ascending: false }).limit(1).maybeSingle();
  if (aberto) {
    const existe = await botHelpy(`/channels/${aberto.thread_id}`).then(() => true).catch((e) => !(e instanceof ErroDoCanal && e.status === 404));
    if (existe) return `Você já tem um atendimento aberto: <#${aberto.thread_id}>`;
    await admin.from('discord_tickets').update({ fechado_em: new Date().toISOString() }).eq('thread_id', aberto.thread_id);
  }

  const nome = nomeDe(membro, pessoa);
  let topico: { id: string };
  try {
    topico = await botHelpy(`/channels/${painel}/threads`, {
      method: 'POST',
      body: { name: `💬 ${nome}`.slice(0, 100), type: 12, invitable: false, auto_archive_duration: 10080 },
      motivo: `Atendimento de ${nome}`,
    }) as { id: string };
  } catch (e) {
    if (e instanceof ErroDoCanal && e.status === 403) {
      return 'Não consegui abrir o atendimento: falta permissão para o bot criar tópicos privados. Avise quem administra o servidor (/helpy-config mostra o que falta).';
    }
    throw e;
  }
  await botHelpy(`/channels/${topico.id}/thread-members/${pessoa.id}`, { method: 'PUT' });
  await admin.from('discord_tickets').insert({
    thread_id: topico.id, canal_id: canal.id, cliente_id: pessoa.id, cliente_nome: nome.slice(0, 120), status_avisado: 'bot',
  });
  const livre = await gatewayLigado();
  await fala(topico.id, [
    `Oi, <@${pessoa.id}>! Seu atendimento está aberto.`,
    livre ? 'Escreva aqui embaixo o que você precisa.' : 'Para falar comigo aqui, use **/helpy** com a sua mensagem.',
    'Se quiser falar com uma pessoa da equipe, é só pedir.',
  ].join('\n'), {
    allowed_mentions: { users: [pessoa.id] },
    components: [{ type: 1, components: [
      { type: 2, style: 2, custom_id: 't:assumir', label: 'Assumir (equipe)', emoji: { name: '✋' } },
      { type: 2, style: 2, custom_id: 't:devolver', label: 'Devolver ao assistente', emoji: { name: '🤖' } },
      { type: 2, style: 4, custom_id: 't:encerrar', label: 'Encerrar', emoji: { name: '✅' } },
    ] }],
  });
  await avisarEquipe(canal.config, `🆕 Novo atendimento de **${nome}**: <#${topico.id}>`).catch((e) => console.warn('[ticket] aviso equipe', e?.message));
  return `Pronto! Seu atendimento: <#${topico.id}>`;
}

/**
 * Uma mensagem no tópico de um ticket (escrita livre, pelo gateway, ou pelo
 * /helpy). Do cliente: o assistente responde. De outra pessoa: é a equipe,
 * fica registrada em Atendimentos com o nome dela e o assistente para.
 * Devolve o que o bot deve dizer no tópico (ou null).
 */
export async function noTicket(t: Ticket, canal: Canal, pessoa: Pessoa, membro: Membro | undefined, texto: string | null): Promise<string | null> {
  if (pessoa.id === t.cliente_id) {
    if (t.fechado_em) return null;
    if (texto === null) return SO_TEXTO;
    return await atenderNoCanal(admin, canal, { id: contatoDo(t.thread_id), nome: t.cliente_nome, rotulo: `Discord · ${t.cliente_nome ?? t.cliente_id}` }, texto);
  }

  // equipe escrevendo no tópico
  if (texto === null) return null;
  const c = await conversaDo(t);
  if (!c) return null; // o cliente ainda não escreveu nada
  const nome = nomeDe(membro, pessoa);
  await admin.from('conversation_messages').insert({ conversation_id: c.id, role: 'agent', content: texto.slice(0, 4000), author_name: `${nome} (Discord)` });
  if (c.status !== 'human') {
    await admin.from('conversations').update({
      status: 'human', assumido_por: null, assumido_nome: nome, assumido_em: new Date().toISOString(), fechado_em: null, encerrado_por: null,
    }).eq('id', c.id);
  }
  await admin.from('discord_tickets').update({ status_avisado: 'human', fechado_em: null }).eq('thread_id', t.thread_id);
  return null;
}

/** Depois da resposta do assistente: se ele chamou alguém da equipe, o cargo é avisado (uma vez). */
export async function chamarEquipeSePreciso(t: Ticket, canal: Canal) {
  const c = await conversaDo(t);
  if (c?.status !== 'waiting' || t.status_avisado === 'waiting') return;
  await admin.from('discord_tickets').update({ status_avisado: 'waiting' }).eq('thread_id', t.thread_id);
  // com canal de avisos: chama lá, com o link; sem ele, chama dentro do ticket
  const avisou = await avisarEquipe(canal.config, `🙋 **${t.cliente_nome ?? 'Um cliente'}** precisa de alguém da equipe: <#${t.thread_id}>`, true)
    .catch(() => false);
  const cargo = canal.config.cargo_equipe;
  if (!avisou && cargo) await fala(t.thread_id, `<@&${cargo}>, este atendimento precisa de alguém da equipe.`, { allowed_mentions: { roles: [cargo] } });
}

/**
 * O status da conversa mudou (pelo painel ou pelos botões do tópico):
 * avisa no tópico, uma vez, e fecha ou reabre o tópico junto.
 */
export async function avisarStatus(t: Ticket, c: { status: string; assumido_nome: string | null }) {
  if (t.status_avisado === c.status) return;
  const antes = t.status_avisado;
  await admin.from('discord_tickets').update({
    status_avisado: c.status, fechado_em: c.status === 'closed' ? new Date().toISOString() : null,
  }).eq('thread_id', t.thread_id);

  if (antes === 'closed' && c.status !== 'closed') {
    await botHelpy(`/channels/${t.thread_id}`, { method: 'PATCH', body: { archived: false, locked: false } }).catch(() => {});
    await fala(t.thread_id, 'Atendimento reaberto.');
  }
  const { data: dono } = await admin.from('canais').select('config').eq('id', t.canal_id).maybeSingle();
  const config = (dono?.config ?? {}) as Record<string, string>;
  const cliente = t.cliente_nome ?? 'cliente';
  if (c.status === 'human') {
    await fala(t.thread_id, `**${c.assumido_nome ?? 'Alguém da equipe'}** entrou no atendimento.`);
    await avisarEquipe(config, `✋ **${c.assumido_nome ?? 'Alguém da equipe'}** assumiu o atendimento de **${cliente}**: <#${t.thread_id}>`).catch(() => {});
  } else if (c.status === 'bot' && antes && antes !== 'bot' && antes !== 'closed') {
    await fala(t.thread_id, 'O atendimento voltou para o assistente. Pode continuar escrevendo por aqui.');
  } else if (c.status === 'closed') {
    await fala(t.thread_id, 'Atendimento encerrado. Obrigado pelo contato! Se precisar de novo, é só abrir outro atendimento.');
    await avisarEquipe(config, `✅ Atendimento de **${cliente}** encerrado: <#${t.thread_id}>`).catch(() => {});
    await botHelpy(`/channels/${t.thread_id}`, { method: 'PATCH', body: { archived: true, locked: true }, motivo: 'Atendimento encerrado' }).catch(() => {});
  }
}

/** Botões do tópico: assumir, devolver ao assistente e encerrar. */
async function botaoDoTicket(acao: string, t: Ticket, canal: Canal, pessoa: Pessoa, membro: Membro | undefined): Promise<string | null> {
  const daEquipe = pessoa.id !== t.cliente_id;
  if (acao !== 'encerrar' && !daEquipe) return 'Esse botão é para a equipe. É só escrever aqui que o atendimento continua.';
  const c = await conversaDo(t);
  if (!c) {
    if (acao === 'encerrar') {
      await avisarStatus(t, { status: 'closed', assumido_nome: null });
      return null;
    }
    return 'O cliente ainda não escreveu nada neste atendimento.';
  }
  const agora = new Date().toISOString();
  const nome = nomeDe(membro, pessoa);
  const patch = acao === 'assumir'
    ? { status: 'human', assumido_por: null, assumido_nome: nome, assumido_em: agora, fechado_em: null, encerrado_por: null }
    : acao === 'devolver'
    ? { status: 'bot', assumido_por: null, assumido_nome: null, assumido_em: null, fechado_em: null, encerrado_por: null }
    : { status: 'closed', fechado_em: agora, encerrado_por: daEquipe ? 'equipe' : 'cliente' };
  if (c.status === patch.status && acao !== 'assumir') return null;
  await admin.from('conversations').update(patch).eq('id', c.id);
  await admin.from('conversation_messages').insert({
    conversation_id: c.id, role: 'system',
    content: acao === 'assumir' ? `${nome} assumiu pelo Discord.` : acao === 'devolver' ? `${nome} devolveu ao assistente pelo Discord.` : `${nome} encerrou pelo Discord.`,
  });
  // assumir de novo (outra pessoa da equipe) também avisa no tópico
  await avisarStatus({ ...t, status_avisado: acao === 'assumir' ? null : t.status_avisado }, { status: patch.status, assumido_nome: nome });
  return null;
}

// ------------------------------------------------------------
// Interações do Discord (comandos e botões) que não são o /helpy simples
// ------------------------------------------------------------
export type Interacao = {
  type: number; id: string; token: string; application_id: string; guild_id?: string; channel_id?: string;
  data?: { name?: string; custom_id?: string; values?: string[]; options?: { name: string; value: string }[] };
  member?: Membro;
  user?: Pessoa;
};

const editarOriginal = (i: Interacao, corpo: Record<string, unknown>) =>
  fetch(`https://discord.com/api/v10/webhooks/${i.application_id}/${i.token}/messages/@original`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo), signal: AbortSignal.timeout(15000),
  }).then(async (r) => {
    if (!r.ok) console.warn('[discord] editar resposta', r.status, (await r.text()).slice(0, 200));
  });

/**
 * Trata a interação. Devolve a resposta imediata (o Discord espera em até
 * 3 s) e o trabalho que continua depois dela.
 */
export function interacaoDoTicket(i: Interacao, canal: Canal): { resposta: unknown; depois?: () => Promise<void> } | null {
  const pessoa = i.member?.user ?? i.user;
  if (!pessoa) return null;
  const id = i.data?.custom_id ?? '';
  const comando = i.type === 2 ? i.data?.name : null;

  // ---- menu de configuração (só quem administra) ----
  if (comando === 'helpy-config' || id.startsWith('cfg:')) {
    if (!ehAdmin(i.member)) return { resposta: { type: 4, data: { flags: 64, content: 'Só quem administra o servidor configura o atendimento.' } } };
    if (comando) {
      return {
        resposta: { type: 5, data: { flags: 64 } },
        depois: async () => await editarOriginal(i, await menuConfig(canal)),
      };
    }
    return {
      resposta: { type: 6 },
      depois: async () => {
        if (id === 'cfg:guia') return await editarOriginal(i, passoAPasso());
        if (id === 'cfg:montar') return await editarOriginal(i, await previaDaMontagem(canal));
        let aviso: string | undefined;
        if (id === 'cfg:canal') await salvarConfig(canal, { painel_canal: i.data?.values?.[0] ?? null });
        else if (id === 'cfg:cargo') await salvarConfig(canal, { cargo_equipe: i.data?.values?.[0] ?? null });
        else if (id === 'cfg:equipe') await salvarConfig(canal, { canal_equipe: i.data?.values?.[0] ?? null });
        else if (id === 'cfg:publicar') aviso = await publicarPainel(canal);
        else if (id === 'cfg:montar_ok') {
          try {
            aviso = await montarTudo(canal);
          } catch (e) {
            console.error('[discord] montar', e);
            aviso = e instanceof ErroDoCanal && e.status === 403
              ? '❌ O Discord não deixou criar (falta permissão). Clique em ⚡ Montar tudo pra mim → Dar permissões para montar, e tente de novo.'
              : '❌ Não consegui terminar de montar agora. O que já foi criado ficou; tente de novo em instantes.';
          }
        }
        await editarOriginal(i, await menuConfig(canal, aviso));
      },
    };
  }

  // ---- abrir atendimento (botão fixado ou /atendimento) ----
  if (id === 'abrir' || comando === 'atendimento') {
    if (canal.status === 'pausado') return { resposta: { type: 4, data: { flags: 64, content: 'O atendimento por aqui está pausado no momento.' } } };
    return {
      resposta: { type: 5, data: { flags: 64 } },
      depois: async () => {
        let texto: string;
        try {
          texto = await abrirTicket(canal, pessoa, i.member, comando ? i.channel_id : undefined);
        } catch (e) {
          console.error('[ticket] abrir', e);
          texto = 'Não consegui abrir o atendimento agora. Tente de novo em instantes.';
        }
        await editarOriginal(i, { content: texto });
      },
    };
  }

  // ---- botões dentro do ticket ----
  if (id.startsWith('t:')) {
    return {
      resposta: { type: 5, data: { flags: 64 } },
      depois: async () => {
        const t = await ticketDo(i.channel_id);
        let texto: string | null = 'Este botão não é de um atendimento.';
        if (t) {
          try {
            texto = await botaoDoTicket(id.slice(2), t, canal, pessoa, i.member);
          } catch (e) {
            console.error('[ticket] botão', e);
            texto = 'Não deu certo agora. Tente de novo em instantes.';
          }
        }
        await editarOriginal(i, { content: texto ?? 'Feito.' });
      },
    };
  }
  return null;
}

/** /helpy escrito dentro do tópico de um ticket: vale como mensagem no ticket (resposta visível para todos). */
export function helpyNoTicket(i: Interacao, t: Ticket, canal: Canal, texto: string) {
  const pessoa = (i.member?.user ?? i.user)!;
  return {
    resposta: { type: 5 },
    depois: async () => {
      let saida: string;
      try {
        const r = await noTicket(t, canal, pessoa, i.member, texto);
        saida = pessoa.id === t.cliente_id
          ? (r ?? 'Sua mensagem chegou para a equipe, que responde por aqui.')
          : `**${nomeDe(i.member, pessoa)}** · equipe\n${texto}`;
      } catch (e) {
        console.error('[ticket] /helpy', e);
        saida = 'Não consegui responder agora. Tente de novo em instantes.';
      }
      const [primeira, ...resto] = pedacos(saida, 1900);
      await editarOriginal(i, { content: primeira, allowed_mentions: { parse: [] } });
      for (const parte of resto) await fala(t.thread_id, parte);
      if (pessoa.id === t.cliente_id) await chamarEquipeSePreciso(t, canal).catch((e) => console.warn('[ticket] chamar equipe', e?.message));
    },
  };
}

// ------------------------------------------------------------
// O que chega do servidor ligado no Discord (gateway)
// ------------------------------------------------------------
export type MensagemGateway = {
  id: string; channel_id: string; guild_id?: string; content?: string; anexos?: number;
  author: Pessoa; member?: Membro;
};

export async function mensagemDoGateway(m: MensagemGateway) {
  const t = await ticketDo(m.channel_id);
  if (!t) return;
  const { data } = await admin.from('canais').select('*').eq('id', t.canal_id).maybeSingle();
  const canal = data as Canal | null;
  if (!canal || canal.status === 'pausado' || (m.guild_id && m.guild_id !== canal.externo_id)) return;
  if (await jaVista(admin, `dc:${m.id}`)) return;
  const texto = (m.content ?? '').trim() || null;
  if (m.author.id === t.cliente_id) {
    // "digitando…" enquanto o assistente pensa
    await botHelpy(`/channels/${t.thread_id}/typing`, { method: 'POST' }).catch(() => {});
  }
  const resposta = await noTicket(t, canal, m.author, m.member, texto);
  if (resposta) await postarNoTopico(admin, canal, t.thread_id, resposta);
  if (m.author.id === t.cliente_id) await chamarEquipeSePreciso(t, canal);
}

/** Painel → Discord: a equipe mudou o status da conversa (assumiu, devolveu, encerrou, reabriu). */
export async function sincronizarConversa(conversa: { canal_id: string | null; contato_externo: string | null; status: string; assumido_nome: string | null }) {
  if (!conversa.contato_externo?.startsWith('ticket:')) return false;
  const t = await ticketDo(conversa.contato_externo.slice(7));
  if (!t || t.canal_id !== conversa.canal_id) return false;
  await avisarStatus(t, conversa);
  return true;
}
