// ============================================================
// Canais: WhatsApp, Instagram (Direct) e Discord.
//
// Envio pelo canal, tokens no Vault, conferência de assinaturas e dos
// tokens ao conectar. O atendimento em si fica em canal-atender.ts.
// ============================================================

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

export type TipoCanal = 'whatsapp' | 'instagram' | 'discord';

export interface Canal {
  id: string;
  owner_id: string;
  assistant_id: string;
  tipo: TipoCanal;
  status: string;
  nome: string | null;
  externo_id: string;
  config: Record<string, string>;
}

const GRAPH = 'https://graph.facebook.com/v21.0';
const GRAPH_IG = 'https://graph.instagram.com/v21.0';
export const DISCORD = 'https://discord.com/api/v10';

export const NOMES: Record<TipoCanal, string> = { whatsapp: 'WhatsApp', instagram: 'Instagram', discord: 'Discord' };

/**
 * O que fica no Vault para cada canal: o token de acesso e, quando a
 * empresa usa o próprio app da Meta, o segredo desse app (para conferir
 * que o aviso veio mesmo da Meta).
 */
export interface Segredo {
  token: string;
  app_secret?: string;
  /** Discord (bot do Helpy): webhook do canal dos tickets, para a equipe aparecer com o próprio nome */
  webhook?: { id: string; token: string; canal: string };
}

export async function segredoDo(db: SupabaseClient, canalId: string): Promise<Segredo> {
  const { data, error } = await db.rpc('helpy_canal_segredo', { p_canal: canalId });
  if (error || !data) throw new Error('Token do canal não encontrado.');
  const bruto = String(data);
  try {
    const s = JSON.parse(bruto);
    if (s && typeof s.token === 'string') return s;
  } catch {
    /* formato antigo: só o token */
  }
  return { token: bruto };
}

export async function guardarSegredo(db: SupabaseClient, canalId: string, s: Segredo) {
  const { error } = await db.rpc('helpy_canal_guardar_segredo', { p_canal: canalId, p_valor: JSON.stringify(s) });
  if (error) throw error;
}

/** Token do canal (fica no Vault; só o servidor lê). */
export async function tokenDo(db: SupabaseClient, canalId: string): Promise<string> {
  return (await segredoDo(db, canalId)).token;
}

/** Quebra textos longos no limite de cada serviço, de preferência no fim de um parágrafo. */
export function pedacos(texto: string, max: number): string[] {
  const out: string[] = [];
  let resto = texto.trim();
  while (resto.length > max) {
    let corte = resto.lastIndexOf('\n', max);
    if (corte < max * 0.5) corte = resto.lastIndexOf(' ', max);
    if (corte < max * 0.5) corte = max;
    out.push(resto.slice(0, corte).trim());
    resto = resto.slice(corte).trim();
  }
  if (resto) out.push(resto);
  return out;
}

/** Erro de um serviço de fora, com a explicação que dá para mostrar no painel. */
export class ErroDoCanal extends Error {
  status: number;
  corpo: string;
  constructor(servico: string, status: number, corpo: string) {
    super(explicar(servico, status, corpo));
    this.status = status;
    this.corpo = corpo;
  }
}

function explicar(servico: string, status: number, corpo: string) {
  // janela de 24 h do WhatsApp: fora dela só dá para mandar modelo aprovado
  if (/131047|re-engagement|24 hours?/i.test(corpo)) {
    return 'Passaram mais de 24 horas desde a última mensagem do cliente. Por regra do WhatsApp, só dá para falar com ele de novo quando ele escrever (ou com um modelo de mensagem aprovado pela Meta).';
  }
  if (status === 401 || /OAuthException|invalid.*token|190/i.test(corpo)) {
    return `${servico} recusou o token: ele venceu ou foi revogado. Gere outro e conecte de novo.`;
  }
  if (/50007/.test(corpo)) return 'O Discord não deixou o bot mandar mensagem direta para essa pessoa (ela bloqueou mensagens de bots ou saiu do servidor).';
  return `${servico} recusou (${status}): ${corpo.slice(0, 300)}`;
}

export async function pedir(url: string, init: RequestInit, servico: string) {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(15000) });
  if (!res.ok) {
    const corpo = await res.text().catch(() => '');
    throw new ErroDoCanal(servico, res.status, corpo);
  }
  return res.status === 204 ? null : res.json().catch(() => null);
}

/** Quem da equipe respondeu pelo painel (o nome aparece para o cliente). */
export interface Autor {
  nome: string;
  foto?: string | null;
}

/**
 * Envia um texto para o contato pelo canal (respostas do assistente e da equipe).
 * Com `autor`, é a equipe respondendo pelo painel: o nome de quem atende vai junto.
 */
export async function enviarPeloCanal(db: SupabaseClient, canal: Canal, contato: string, texto: string, autor?: Autor | null) {
  // Discord, ticket: a conversa fica no tópico privado do servidor
  if (canal.tipo === 'discord' && contato.startsWith('ticket:')) {
    await postarNoTopico(db, canal, contato.slice(7), texto, autor);
    return;
  }
  const token = ehBotDoHelpy(canal) ? tokenDoBotHelpy() : await tokenDo(db, canal.id);
  if (canal.tipo === 'whatsapp') {
    const corpo = autor ? `*${autor.nome}* (equipe)\n${texto}` : texto;
    for (const parte of pedacos(corpo, 4000)) {
      await pedir(`${GRAPH}/${canal.externo_id}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to: contato, type: 'text', text: { preview_url: false, body: parte } }),
      }, 'O WhatsApp');
    }
  } else if (canal.tipo === 'instagram') {
    const corpo = autor ? `${autor.nome} (equipe):\n${texto}` : texto;
    for (const parte of pedacos(corpo, 1000)) {
      const r = await pedir(`${GRAPH_IG}/me/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipient: { id: contato }, message: { text: parte } }),
      }, 'O Instagram') as { message_id?: string } | null;
      // a Meta devolve um "eco" de tudo que a conta manda; este é nosso (não é alguém respondendo pelo app)
      if (r?.message_id) await jaVista(db, `ig:eu:${r.message_id}`);
    }
  } else {
    // Discord: mensagem direta do bot para a pessoa
    const dm = await pedir(`${DISCORD}/users/@me/channels`, {
      method: 'POST',
      headers: { Authorization: `Bot ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipient_id: contato }),
    }, 'O Discord') as { id: string };
    const corpo = autor ? `**${autor.nome}** (equipe)\n${texto}` : texto;
    for (const parte of pedacos(corpo, 1900)) {
      await pedir(`${DISCORD}/channels/${dm.id}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bot ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: parte, allowed_mentions: { parse: [] } }),
      }, 'O Discord');
    }
  }
}

/** Chamada à API do Discord com o bot do Helpy. */
export function botHelpy(caminho: string, init: { method?: string; body?: unknown; motivo?: string } = {}) {
  const headers: Record<string, string> = { Authorization: `Bot ${tokenDoBotHelpy()}` };
  if (init.body !== undefined) headers['Content-Type'] = 'application/json';
  if (init.motivo) headers['X-Audit-Log-Reason'] = encodeURIComponent(init.motivo);
  return pedir(`${DISCORD}${caminho}`, {
    method: init.method ?? 'GET',
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  }, 'O Discord');
}

/**
 * Escreve no tópico de um ticket. A equipe sai pelo webhook do canal, com o
 * nome (e a foto) de quem atende; sem o webhook, o bot escreve com o nome em
 * negrito. O assistente fala pelo próprio bot, que tem o nome dele no servidor.
 */
export async function postarNoTopico(db: SupabaseClient, canal: Canal, topico: string, texto: string, autor?: Autor | null) {
  if (autor) {
    const s = await segredoDo(db, canal.id).catch(() => null);
    if (s?.webhook) {
      try {
        for (const parte of pedacos(texto, 1900)) {
          await pedir(`${DISCORD}/webhooks/${s.webhook.id}/${s.webhook.token}?thread_id=${topico}&wait=true`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              content: parte,
              username: `${nomeDeWebhook(autor.nome)} · equipe`,
              ...(autor.foto ? { avatar_url: autor.foto } : {}),
              allowed_mentions: { parse: [] },
            }),
          }, 'O Discord');
        }
        return;
      } catch (e) {
        if (!(e instanceof ErroDoCanal)) throw e;
        // webhook apagado no servidor: esquece; em qualquer recusa, o bot manda no lugar
        if (e.status === 404 || e.status === 401) {
          const { webhook: _w, ...resto } = s;
          await guardarSegredo(db, canal.id, resto).catch(() => {});
        }
        console.warn('[discord] webhook da equipe', e.status, e.corpo.slice(0, 200));
      }
    }
  }
  const corpo = autor ? `**${autor.nome}** · equipe\n${texto}` : texto;
  for (const parte of pedacos(corpo, 1900)) {
    await botHelpy(`/channels/${topico}/messages`, { method: 'POST', body: { content: parte, allowed_mentions: { parse: [] } } });
  }
}

/**
 * Ticket do Discord: os avisos importantes (pagamento, equipe entrou, atendimento
 * encerrado) também chegam no privado do cliente, com o link do atendimento. É uma
 * mensagem direta do bot (sem custo). Quem fechou o privado para o servidor não recebe.
 */
export async function noPrivadoDoDiscord(db: SupabaseClient, canal: Canal, topico: string, texto: string) {
  if (!ehBotDoHelpy(canal)) return;
  const { data: t } = await db.from('discord_tickets').select('cliente_id').eq('thread_id', topico).maybeSingle();
  if (!t?.cliente_id) return;
  try {
    const dm = await botHelpy('/users/@me/channels', { method: 'POST', body: { recipient_id: t.cliente_id } }) as { id: string };
    const corpo = `**${canal.nome ?? 'Atendimento'}**\n${texto}\n\nSeu atendimento: https://discord.com/channels/${canal.externo_id}/${topico}`;
    for (const parte of pedacos(corpo, 1900)) {
      await botHelpy(`/channels/${dm.id}/messages`, { method: 'POST', body: { content: parte, allowed_mentions: { parse: [] } } });
    }
  } catch (e) {
    // privado fechado (50007) ou pessoa saiu do servidor: o aviso já ficou no ticket
    console.warn('[discord] privado', e instanceof ErroDoCanal ? e.status : (e as Error)?.message);
  }
}

/** Nome que o Discord aceita num webhook (sem "discord" e "clyde"). */
function nomeDeWebhook(nome: string) {
  const limpo = nome.replace(/discord|clyde/gi, '').replace(/\s+/g, ' ').trim().slice(0, 60);
  return limpo || 'Equipe';
}

/** Mensagem já vista (o WhatsApp e o Instagram reenviam quando demoramos a responder). */
export async function jaVista(db: SupabaseClient, id: string): Promise<boolean> {
  const { error } = await db.from('canal_eventos').insert({ id: id.slice(0, 200) });
  // de vez em quando apaga os antigos (a Meta não reenvia depois de alguns dias)
  if (Math.random() < 0.02) {
    await db.from('canal_eventos').delete().lt('criado_em', new Date(Date.now() - 3 * 86400e3).toISOString());
  }
  return !!error; // chave repetida = já processada
}

// ------------------------------------------------------------
// Conferências de assinatura (quem chama o webhook é mesmo a Meta / o Discord?)
// ------------------------------------------------------------
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
const deHex = (s: string) => new Uint8Array((s.match(/.{1,2}/g) ?? []).map((x) => parseInt(x, 16)));

function iguais(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

/** Cabeçalho X-Hub-Signature-256 da Meta: HMAC-SHA256 do corpo com o segredo do app. */
export async function assinaturaMetaOk(corpo: string, cabecalho: string | null, segredos: string[]): Promise<boolean> {
  if (!cabecalho?.startsWith('sha256=')) return false;
  const recebida = cabecalho.slice(7);
  for (const s of segredos.filter(Boolean)) {
    const chave = await crypto.subtle.importKey('raw', new TextEncoder().encode(s), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const calc = hex(await crypto.subtle.sign('HMAC', chave, new TextEncoder().encode(corpo)));
    if (iguais(calc, recebida)) return true;
  }
  return false;
}

/** Discord: assinatura Ed25519 de (timestamp + corpo) com a chave pública do app. */
export async function assinaturaDiscordOk(corpo: string, assinatura: string | null, momento: string | null, chavePublica: string): Promise<boolean> {
  if (!assinatura || !momento || !chavePublica) return false;
  try {
    const chave = await crypto.subtle.importKey('raw', deHex(chavePublica), { name: 'Ed25519' }, false, ['verify']);
    return await crypto.subtle.verify('Ed25519', chave, deHex(assinatura), new TextEncoder().encode(momento + corpo));
  } catch {
    return false;
  }
}

// ------------------------------------------------------------
// Conferência do token ao conectar (e o que mostrar no painel)
// ------------------------------------------------------------
export async function conferirWhatsApp(phoneNumberId: string, token: string) {
  const r = await pedir(`${GRAPH}/${encodeURIComponent(phoneNumberId)}?fields=display_phone_number,verified_name`, {
    headers: { Authorization: `Bearer ${token}` },
  }, 'O WhatsApp') as { display_phone_number?: string; verified_name?: string };
  return { externo_id: phoneNumberId, nome: [r.verified_name, r.display_phone_number].filter(Boolean).join(' · ') || phoneNumberId };
}

export async function conferirInstagram(token: string) {
  const r = await pedir(`${GRAPH_IG}/me?fields=user_id,username`, { headers: { Authorization: `Bearer ${token}` } }, 'O Instagram') as { user_id?: string; id?: string; username?: string };
  const id = String(r.user_id ?? r.id ?? '');
  if (!id) throw new Error('O Instagram não devolveu o id da conta profissional.');
  return { externo_id: id, nome: r.username ? `@${r.username}` : id };
}

/** Discord: confere o token do bot, pega o id e a chave pública do app e registra o comando /helpy. */
export async function conferirDiscord(token: string) {
  const app = await pedir(`${DISCORD}/applications/@me`, { headers: { Authorization: `Bot ${token}` } }, 'O Discord') as { id: string; name?: string; verify_key?: string };
  if (!app?.id || !app.verify_key) throw new Error('O Discord não devolveu os dados do aplicativo.');
  await pedir(`${DISCORD}/applications/${app.id}/commands`, {
    method: 'PUT',
    headers: { Authorization: `Bot ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify([{
      name: 'helpy',
      description: 'Fale com o atendimento',
      type: 1,
      // no servidor e na conversa direta com o bot
      contexts: [0, 1],
      options: [{ type: 3, name: 'mensagem', description: 'O que você quer saber?', required: true, max_length: 1500 }],
    }]),
  }, 'O Discord');
  return { externo_id: app.id, nome: app.name ?? 'Bot do Discord', config: { public_key: app.verify_key } };
}

// ------------------------------------------------------------
// O bot do Discord do próprio Helpy (um só para todas as empresas)
// ------------------------------------------------------------
// Id e chave pública do app não são segredo; o token do bot e o segredo do
// OAuth ficam nas variáveis das funções (DISCORD_BOT_TOKEN, DISCORD_CLIENT_SECRET).
export const DISCORD_HELPY = {
  appId: Deno.env.get('DISCORD_APP_ID') ?? '1560424740315856979',
  chavePublica: Deno.env.get('DISCORD_PUBLIC_KEY') ?? '014cedaf79afc181578dbdec73d3176a9742b1353f0e5f79daea7772a477f62e',
};
// O que o bot pede ao entrar no servidor (sem Administrador):
export const PERM = {
  ADMINISTRADOR: 1n << 3n,
  GERENCIAR_CANAIS: 1n << 4n,
  GERENCIAR_SERVIDOR: 1n << 5n,
  VER_CANAL: 1n << 10n,
  ENVIAR: 1n << 11n,
  LINKS: 1n << 14n,
  ANEXOS: 1n << 15n,
  HISTORICO: 1n << 16n,
  APELIDO: 1n << 26n,
  GERENCIAR_CARGOS: 1n << 28n,
  WEBHOOKS: 1n << 29n,
  GERENCIAR_TOPICOS: 1n << 34n,
  TOPICOS_PRIVADOS: 1n << 36n,
  ENVIAR_EM_TOPICOS: 1n << 38n,
};
export const PERMISSOES_BOT = String(
  PERM.VER_CANAL | PERM.ENVIAR | PERM.LINKS | PERM.ANEXOS | PERM.HISTORICO | PERM.APELIDO |
    PERM.WEBHOOKS | PERM.GERENCIAR_TOPICOS | PERM.TOPICOS_PRIVADOS | PERM.ENVIAR_EM_TOPICOS,
);

/** Os comandos do bot do Helpy (iguais em todos os servidores). */
type Comando = { name: string; description: string; type: number; contexts: number[]; options?: unknown[]; default_member_permissions?: string };
export const COMANDOS_HELPY: Comando[] = [
  {
    name: 'helpy', description: 'Fale com o atendimento', type: 1, contexts: [0],
    options: [{ type: 3, name: 'mensagem', description: 'O que você quer saber?', required: true, max_length: 1500 }],
  },
  { name: 'atendimento', description: 'Abre um atendimento privado com a empresa', type: 1, contexts: [0] },
  {
    name: 'helpy-config', description: 'Configura o atendimento do Helpy neste servidor', type: 1, contexts: [0],
    default_member_permissions: String(PERM.GERENCIAR_SERVIDOR),
  },
];

/** Link para o dono do servidor dar ao bot as permissões que faltam (sem tirar e pôr de novo). */
export function urlPermissoesBot(servidor: string) {
  const q = new URLSearchParams({
    client_id: DISCORD_HELPY.appId, scope: 'bot applications.commands', permissions: PERMISSOES_BOT,
    guild_id: servidor, disable_guild_select: 'true',
  });
  return `https://discord.com/oauth2/authorize?${q}`;
}

export const ehBotDoHelpy = (c: Pick<Canal, 'tipo' | 'config'>) => c.tipo === 'discord' && c.config?.modo === 'helpy';

export function tokenDoBotHelpy(): string {
  const t = Deno.env.get('DISCORD_BOT_TOKEN');
  if (!t) throw new Error('O bot do Helpy no Discord ainda não foi configurado (falta DISCORD_BOT_TOKEN).');
  return t;
}

export function discordHelpyPronto() {
  return !!Deno.env.get('DISCORD_BOT_TOKEN') && !!Deno.env.get('DISCORD_CLIENT_SECRET');
}

/** Endereço do Discord para adicionar o bot do Helpy a um servidor (com a volta para o painel). */
export function urlAdicionarBot(state: string, redirect: string) {
  const q = new URLSearchParams({
    client_id: DISCORD_HELPY.appId,
    scope: 'bot applications.commands identify',
    permissions: PERMISSOES_BOT,
    response_type: 'code',
    redirect_uri: redirect,
    state,
    prompt: 'consent',
  });
  return `https://discord.com/oauth2/authorize?${q}`;
}

/**
 * Link para o bot poder montar o atendimento sozinho (criar canais e o cargo
 * da equipe). Depois de montar, o dono pode tirar essas duas permissões.
 */
export function urlPermissoesMontagem(servidor: string) {
  const q = new URLSearchParams({
    client_id: DISCORD_HELPY.appId, scope: 'bot applications.commands',
    permissions: String(BigInt(PERMISSOES_BOT) | PERM.GERENCIAR_CANAIS | PERM.GERENCIAR_CARGOS),
    guild_id: servidor, disable_guild_select: 'true',
  });
  return `https://discord.com/oauth2/authorize?${q}`;
}

/** Troca o código da volta pelo servidor onde o bot foi adicionado (o Discord confirma qual foi). */
export async function servidorDoCodigo(code: string, redirect: string): Promise<{ id: string; name: string }> {
  const segredo = Deno.env.get('DISCORD_CLIENT_SECRET');
  if (!segredo) throw new Error('O bot do Helpy no Discord ainda não foi configurado (falta DISCORD_CLIENT_SECRET).');
  const r = await pedir(`${DISCORD}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code', code, redirect_uri: redirect,
      client_id: DISCORD_HELPY.appId, client_secret: segredo,
    }),
  }, 'O Discord') as { guild?: { id: string; name: string } };
  if (!r?.guild?.id) throw new Error('O Discord não disse em qual servidor o bot entrou. Tente adicionar de novo.');
  return { id: r.guild.id, name: r.guild.name };
}

/**
 * Deixa o app do Helpy pronto para atender: endereço das interações e o
 * comando /helpy (global). Só muda o que estiver diferente.
 */
export async function prepararBotHelpy(endereco: string) {
  const cab = { Authorization: `Bot ${tokenDoBotHelpy()}`, 'Content-Type': 'application/json' };
  const app = await pedir(`${DISCORD}/applications/@me`, { headers: cab }, 'O Discord') as { interactions_endpoint_url?: string | null };
  if (app?.interactions_endpoint_url !== endereco) {
    await pedir(`${DISCORD}/applications/@me`, {
      method: 'PATCH', headers: cab,
      body: JSON.stringify({
        interactions_endpoint_url: endereco,
        description: 'Atendimento com IA para o seu servidor: tickets privados, respostas do assistente da empresa, agendamentos e a equipe no mesmo lugar. helpysupport.com',
      }),
    }, 'O Discord');
  }
  await registrarComandosHelpy();
}

/** Grava os comandos do bot (só quando mudaram: o Discord limita quantas vezes dá para criar). */
export async function registrarComandosHelpy() {
  const cab = { Authorization: `Bot ${tokenDoBotHelpy()}`, 'Content-Type': 'application/json' };
  const url = `${DISCORD}/applications/${DISCORD_HELPY.appId}/commands`;
  const atuais = await pedir(url, { headers: cab }, 'O Discord') as Array<{ name: string; description: string; options?: unknown[]; default_member_permissions?: string | null }>;
  const igual = atuais?.length === COMANDOS_HELPY.length && COMANDOS_HELPY.every((c) => {
    const a = atuais.find((x) => x.name === c.name);
    return a && a.description === c.description && (a.options?.length ?? 0) === (c.options?.length ?? 0) &&
      (a.default_member_permissions ?? null) === (c.default_member_permissions ?? null);
  });
  if (!igual) await pedir(url, { method: 'PUT', headers: cab, body: JSON.stringify(COMANDOS_HELPY) }, 'O Discord');
}

/** No servidor da empresa, o bot do Helpy usa o nome (e, se der, a foto) do assistente. */
export async function apelidarBotHelpy(servidor: string, nome: string, foto?: string | null) {
  const cab = { Authorization: `Bot ${tokenDoBotHelpy()}`, 'Content-Type': 'application/json' };
  const feito = { nome: false, foto: false };
  try {
    await pedir(`${DISCORD}/guilds/${servidor}/members/@me`, { method: 'PATCH', headers: cab, body: JSON.stringify({ nick: nome.slice(0, 32) }) }, 'O Discord');
    feito.nome = true;
  } catch (e) {
    console.warn('[discord] apelido', (e as Error).message);
  }
  if (foto) {
    try {
      const r = await fetch(fotoNossa(foto), { signal: AbortSignal.timeout(10000), redirect: 'error' });
      const tipo = r.headers.get('content-type') ?? 'image/png';
      const bytes = new Uint8Array(await r.arrayBuffer());
      if (r.ok && /^image\//.test(tipo) && bytes.length < 8_000_000) {
        let bin = '';
        for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        await pedir(`${DISCORD}/guilds/${servidor}/members/@me`, {
          method: 'PATCH', headers: cab, body: JSON.stringify({ avatar: `data:${tipo};base64,${btoa(bin)}` }),
        }, 'O Discord');
        feito.foto = true;
      }
    } catch (e) {
      console.warn('[discord] foto no servidor', (e as Error).message);
    }
  }
  return feito;
}

/** O bot do Helpy ainda está neste servidor? (o dono pode ter removido pelo Discord) */
export async function botNoServidor(servidor: string): Promise<boolean> {
  try {
    await pedir(`${DISCORD}/guilds/${servidor}`, { headers: { Authorization: `Bot ${tokenDoBotHelpy()}` } }, 'O Discord');
    return true;
  } catch (e) {
    if (e instanceof ErroDoCanal && (e.status === 403 || e.status === 404)) return false;
    throw e;
  }
}

/** O bot do Helpy sai do servidor (ao desconectar o canal). */
export async function sairDoServidor(servidor: string) {
  await pedir(`${DISCORD}/users/@me/guilds/${servidor}`, { method: 'DELETE', headers: { Authorization: `Bot ${tokenDoBotHelpy()}` } }, 'O Discord');
}

/** Nome que o Discord aceita para um bot: 2 a 32 caracteres, sem @ # : ``` e sem a palavra "discord". */
function nomeDeBot(nome: string) {
  const limpo = nome.replace(/[@#:`]/g, '').replace(/discord/gi, '').replace(/\s+/g, ' ').trim().slice(0, 32);
  return limpo.length >= 2 ? limpo : 'Atendimento';
}

// A foto do assistente só é baixada do nosso armazenamento (o link fica salvo na conta e
// poderia apontar para qualquer lugar, inclusive a rede interna).
function fotoNossa(url: string): string {
  const base = `${Deno.env.get('SUPABASE_URL') ?? ''}/storage/v1/object/public/`;
  if (!base.startsWith('https://') || !url.startsWith(base) || url.includes('..')) throw new Error('foto fora do armazenamento');
  return url;
}

/**
 * Discord: deixa o bot com a cara do assistente (nome e foto) e cadastra
 * sozinho o endereço das interações, para a empresa não precisar colar.
 * Cada parte pode falhar sem impedir a conexão (o Discord limita a troca
 * de nome a duas por hora); o resultado diz o que deu certo.
 */
export async function vestirBotDiscord(token: string, o: { nome: string; foto?: string | null; endereco?: string; descricao?: string }) {
  const feito = { nome: false, foto: false, endereco: false };
  const cab = { Authorization: `Bot ${token}`, 'Content-Type': 'application/json' };

  const perfil: Record<string, string> = { username: nomeDeBot(o.nome) };
  if (o.foto) {
    try {
      const r = await fetch(fotoNossa(o.foto), { signal: AbortSignal.timeout(10000), redirect: 'error' });
      const tipo = r.headers.get('content-type') ?? 'image/png';
      const bytes = new Uint8Array(await r.arrayBuffer());
      if (r.ok && bytes.length < 8_000_000 && /^image\//.test(tipo)) {
        let bin = '';
        for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        perfil.avatar = `data:${tipo};base64,${btoa(bin)}`;
      }
    } catch {
      /* sem foto: fica a que já estava */
    }
  }
  try {
    await pedir(`${DISCORD}/users/@me`, { method: 'PATCH', headers: cab, body: JSON.stringify(perfil) }, 'O Discord');
    feito.nome = true;
    feito.foto = !!perfil.avatar;
  } catch (e) {
    console.warn('[discord] nome/foto', (e as Error).message);
    // a foto sozinha às vezes passa quando o nome bateu no limite de trocas
    if (perfil.avatar) {
      try {
        await pedir(`${DISCORD}/users/@me`, { method: 'PATCH', headers: cab, body: JSON.stringify({ avatar: perfil.avatar }) }, 'O Discord');
        feito.foto = true;
      } catch { /* segue */ }
    }
  }

  if (o.endereco) {
    try {
      // o Discord testa o endereço na hora (PING assinado); por isso o canal já precisa estar salvo
      await pedir(`${DISCORD}/applications/@me`, {
        method: 'PATCH', headers: cab,
        body: JSON.stringify({ interactions_endpoint_url: o.endereco, ...(o.descricao ? { description: o.descricao.slice(0, 400) } : {}) }),
      }, 'O Discord');
      feito.endereco = true;
    } catch (e) {
      console.warn('[discord] endereço', (e as Error).message);
    }
  }
  return feito;
}

/** Discord: troca a resposta "pensando…" pela resposta de verdade. */
export async function responderInteracaoDiscord(applicationId: string, interacaoToken: string, texto: string) {
  const [primeira, ...resto] = pedacos(texto, 1900);
  await pedir(`${DISCORD}/webhooks/${applicationId}/${interacaoToken}/messages/@original`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: primeira ?? '…', allowed_mentions: { parse: [] } }),
  }, 'O Discord');
  for (const parte of resto) {
    await pedir(`${DISCORD}/webhooks/${applicationId}/${interacaoToken}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: parte, allowed_mentions: { parse: [] } }),
    }, 'O Discord');
  }
}
