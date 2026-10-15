// ============================================================
// Onde a Meta e o Discord avisam que chegou mensagem. Atende pelo
// mesmo endereço do chat público (public-chat), que já é aberto sem
// login:
//
//   GET  ?canal=meta&hub.mode=subscribe… → a Meta confirmando o endereço
//   POST ?canal=meta (WhatsApp/Instagram) → assinatura conferida, resposta
//                                           em segundo plano pelo canal
//   POST ?discord=helpy                   → bot do Helpy: /helpy, tickets e
//                                           menu de configuração (Ed25519)
//   POST ?discord=<canal>                 → bot próprio da empresa (Ed25519)
//   POST ?discord=gateway                 → o servidor ligado no Discord
//                                           (mensagens livres dos tickets),
//                                           com a chave DISCORD_GATEWAY_KEY
//
// A segurança é a assinatura de cada aviso.
// ============================================================

import { admin } from './db.ts';
import {
  assinaturaDiscordOk,
  assinaturaMetaOk,
  type Canal,
  DISCORD_HELPY,
  enviarPeloCanal,
  jaVista,
  responderInteracaoDiscord,
  segredoDo,
  type TipoCanal,
} from './canais.ts';
import { atenderNoCanal } from './canal-atender.ts';
import { helpyNoTicket, type Interacao, interacaoDoTicket, type MensagemGateway, mensagemDoGateway, ticketDo } from './discord-tickets.ts';
import { registrarComandosHelpy } from './canais.ts';

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

const SO_TEXTO = 'Por enquanto eu leio só mensagens de texto por aqui. Pode escrever o que você precisa?';
const COM_A_EQUIPE = 'Sua mensagem chegou para a equipe. A resposta vem por mensagem direta aqui no Discord.';

const ok = (corpo = 'ok', status = 200, tipo = 'text/plain') => new Response(corpo, { status, headers: { 'Content-Type': tipo } });
const jsonOk = (v: unknown) => ok(JSON.stringify(v), 200, 'application/json');

/** Roda depois de responder 200 (a Meta reenvia se demorarmos). */
function depois(p: Promise<unknown>) {
  const seguro = p.catch((e) => console.error('canal:', e));
  if (typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(seguro);
}

async function canalPor(tipo: TipoCanal, externoId: string): Promise<Canal | null> {
  const { data } = await admin.from('canais').select('*').eq('tipo', tipo).eq('externo_id', externoId).maybeSingle();
  return (data as Canal) ?? null;
}

async function marcarErro(canal: Canal, e: unknown) {
  await admin.from('canais').update({ status: 'erro', erro: String((e as Error)?.message ?? e).slice(0, 500) }).eq('id', canal.id);
}

/** Uma mensagem de um contato: atende e devolve pelo mesmo canal. */
async function atender(canal: Canal, contato: { id: string; nome?: string | null; telefone?: string | null }, texto: string | null) {
  try {
    if (texto === null) {
      await enviarPeloCanal(admin, canal, contato.id, SO_TEXTO);
      return;
    }
    const resposta = await atenderNoCanal(admin, canal, contato, texto);
    if (resposta) await enviarPeloCanal(admin, canal, contato.id, resposta);
  } catch (e) {
    console.error('canal:', canal.tipo, e);
    await marcarErro(canal, e);
  }
}

// ------------------------------------------------------------
// Meta (WhatsApp Cloud API e Instagram)
// ------------------------------------------------------------
type Recebida = {
  canal: Canal; id: string; contato: { id: string; nome?: string | null; telefone?: string | null }; texto: string | null;
  /** Instagram: mensagem que a própria conta mandou (pelo Helpy ou por alguém no app) */
  eco?: boolean;
};

type WaMsg = {
  id: string; from: string; type: string;
  text?: { body?: string }; button?: { text?: string };
  interactive?: { button_reply?: { title?: string }; list_reply?: { title?: string } };
};

async function lerMeta(corpo: Record<string, unknown>): Promise<Recebida[]> {
  const out: Recebida[] = [];
  const entradas = (corpo.entry as Record<string, unknown>[] | undefined) ?? [];

  if (corpo.object === 'whatsapp_business_account') {
    for (const e of entradas) {
      for (const ch of (e.changes as { field?: string; value?: Record<string, unknown> }[] | undefined) ?? []) {
        const v = ch.value ?? {};
        const numero = String((v.metadata as { phone_number_id?: string } | undefined)?.phone_number_id ?? '');
        const msgs = (v.messages as WaMsg[] | undefined) ?? [];
        if (!numero || !msgs.length) continue; // status de entrega, leitura etc.
        const canal = await canalPor('whatsapp', numero);
        if (!canal) continue;
        const nomes = new Map(((v.contacts as { wa_id: string; profile?: { name?: string } }[] | undefined) ?? []).map((c) => [c.wa_id, c.profile?.name ?? null]));
        for (const m of msgs) {
          const texto = m.text?.body ?? m.button?.text ?? m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? null;
          out.push({ canal, id: `wa:${m.id}`, contato: { id: m.from, nome: nomes.get(m.from) ?? null, telefone: m.from }, texto });
        }
      }
    }
  } else if (corpo.object === 'instagram') {
    for (const e of entradas) {
      const conta = String(e.id ?? '');
      const canal = conta ? await canalPor('instagram', conta) : null;
      if (!canal) continue;
      type IgEvento = { sender?: { id?: string }; recipient?: { id?: string }; message?: { mid?: string; text?: string; is_echo?: boolean; attachments?: unknown[] } };
      for (const ev of (e.messaging as IgEvento[] | undefined) ?? []) {
        const m = ev.message;
        const de = ev.sender?.id;
        if (!m?.mid || !de) continue;
        if (m.is_echo || de === conta) {
          // o que a própria conta mandou: pode ser alguém da empresa respondendo pelo app
          const para = ev.recipient?.id;
          if (para && m.text) out.push({ canal, id: `ig:${m.mid}`, contato: { id: para }, texto: m.text, eco: true });
          continue;
        }
        out.push({ canal, id: `ig:${m.mid}`, contato: { id: de }, texto: m.text ?? null });
      }
    }
  }
  return out;
}

/**
 * Alguém da empresa respondeu pelo app do Instagram (e não pelo painel):
 * a resposta entra em Atendimentos e o assistente para de falar por cima.
 * O que o próprio Helpy mandou fica marcado ao enviar e é ignorado aqui.
 */
async function ecoDoInstagram(r: Recebida) {
  await new Promise((ok) => setTimeout(ok, 4000)); // o Helpy marca o que mandou logo depois do envio
  if (await jaVista(admin, `ig:eu:${r.id.slice(3)}`)) return;
  const { data: c } = await admin.from('conversations').select('id, status')
    .eq('canal_id', r.canal.id).eq('contato_externo', r.contato.id)
    .order('last_message_at', { ascending: false }).limit(1).maybeSingle();
  if (!c || !r.texto) return;
  // corrida rara: o eco chegou antes de o Helpy marcar o envio (mesmo texto há pouco)
  const { data: recentes } = await admin.from('conversation_messages').select('content')
    .eq('conversation_id', c.id).in('role', ['assistant', 'agent', 'system'])
    .gte('created_at', new Date(Date.now() - 120e3).toISOString());
  if ((recentes ?? []).some((m) => String(m.content).trim() === r.texto!.trim() || r.texto!.trim().endsWith(String(m.content).trim()))) return;
  await admin.from('conversation_messages').insert({ conversation_id: c.id, role: 'agent', content: r.texto, author_name: 'Equipe (pelo app do Instagram)' });
  if (c.status !== 'human') {
    await admin.from('conversations').update({
      status: 'human', assumido_por: null, assumido_nome: 'Equipe (Instagram)', assumido_em: new Date().toISOString(), fechado_em: null, encerrado_por: null,
    }).eq('id', c.id);
  }
}

async function meta(req: Request): Promise<Response> {
  const url = new URL(req.url);

  // confirmação do endereço no painel da Meta
  if (req.method === 'GET') {
    const token = url.searchParams.get('hub.verify_token') ?? '';
    const desafio = url.searchParams.get('hub.challenge') ?? '';
    if (url.searchParams.get('hub.mode') !== 'subscribe' || !token || !desafio) return ok('', 400);
    const global = Deno.env.get('META_VERIFY_TOKEN');
    let vale = !!global && token === global;
    if (!vale) {
      const { count } = await admin.from('canais').select('id', { count: 'exact', head: true }).eq('verificar_token', token);
      vale = (count ?? 0) > 0;
    }
    return vale ? ok(desafio) : ok('', 403);
  }

  const bruto = await req.text();
  let corpo: Record<string, unknown>;
  try {
    corpo = JSON.parse(bruto);
  } catch {
    return ok('', 400);
  }
  const recebidas = await lerMeta(corpo);
  if (!recebidas.length) return ok();

  // a assinatura vale para o aviso inteiro: segredo do app do Helpy ou o do app da própria empresa
  const segredos = [Deno.env.get('META_APP_SECRET') ?? '', Deno.env.get('INSTAGRAM_APP_SECRET') ?? ''];
  for (const c of new Set(recebidas.map((r) => r.canal.id))) {
    const s = await segredoDo(admin, c).catch(() => null);
    if (s?.app_secret) segredos.push(s.app_secret);
  }
  if (!segredos.some(Boolean)) {
    console.error('canal-webhook: falta META_APP_SECRET (ou o segredo do app no canal)');
    return ok('', 503);
  }
  if (!(await assinaturaMetaOk(bruto, req.headers.get('X-Hub-Signature-256'), segredos))) return ok('', 401);

  depois((async () => {
    for (const r of recebidas) {
      if (r.canal.status === 'pausado') continue;
      if (await jaVista(admin, r.id)) continue;
      if (r.eco) await ecoDoInstagram(r);
      else await atender(r.canal, r.contato, r.texto);
    }
  })());
  return ok();
}

// ------------------------------------------------------------
// Discord (comando /helpy)
// ------------------------------------------------------------
const efemera = (content: string) => jsonOk({ type: 4, data: { content, flags: 64 } });

/**
 * Discord. Dois jeitos de chegar aqui:
 *   ?discord=helpy  → o bot do próprio Helpy, um só para todas as empresas;
 *                     o servidor (guild_id) diz qual canal e qual assistente
 *   ?discord=<id>   → bot próprio da empresa (jeito antigo), pelo id do canal
 */
async function discord(req: Request, alvo: string): Promise<Response> {
  if (req.method !== 'POST') return ok('', 404);
  if (alvo === 'gateway') return gateway(req);
  const doHelpy = alvo === 'helpy';
  let canal: Canal | null = null;
  if (!doHelpy) {
    if (!/^[0-9a-f-]{36}$/i.test(alvo)) return ok('', 404);
    const { data } = await admin.from('canais').select('*').eq('id', alvo).eq('tipo', 'discord').maybeSingle();
    canal = data as Canal | null;
    if (!canal) return ok('', 404);
  }

  const bruto = await req.text();
  const chave = doHelpy ? DISCORD_HELPY.chavePublica : canal?.config?.public_key ?? '';
  const assinou = await assinaturaDiscordOk(bruto, req.headers.get('X-Signature-Ed25519'), req.headers.get('X-Signature-Timestamp'), chave);
  if (!assinou) return ok('assinatura inválida', 401);

  const i = JSON.parse(bruto) as Interacao;
  if (i.type === 1) return jsonOk({ type: 1 }); // PING do Discord ao salvar o endereço

  if (doHelpy) {
    if (!i.guild_id) return efemera('Use os comandos do Helpy dentro do servidor da empresa.');
    const { data } = await admin.from('canais').select('*')
      .eq('tipo', 'discord').eq('externo_id', i.guild_id).eq('config->>modo', 'helpy').maybeSingle();
    canal = data as Canal | null;
    if (!canal) {
      return efemera('Este servidor ainda não está ligado a um assistente. Quem administra o servidor pode ligar em Canais, no painel do Helpy.');
    }
    // tickets, botões e menu de configuração
    const r = interacaoDoTicket(i, canal);
    if (r) {
      if (r.depois) depois(r.depois());
      return jsonOk(r.resposta);
    }
  }
  if (i.type !== 2 || i.data?.name !== 'helpy') return efemera('Comando desconhecido.');
  if (!canal) return ok('', 404);
  if (canal.status === 'pausado') return efemera('O atendimento por aqui está pausado no momento.');

  const pessoa = i.member?.user ?? i.user;
  const texto = String(i.data.options?.find((o) => o.name === 'mensagem')?.value ?? '');
  if (!pessoa?.id) return efemera('Não consegui identificar quem mandou.');

  // /helpy dentro do tópico de um ticket: vale como mensagem do atendimento
  if (doHelpy) {
    const t = await ticketDo(i.channel_id);
    if (t && t.canal_id === canal.id) {
      const r = helpyNoTicket(i, t, canal, texto);
      depois(r.depois());
      return jsonOk(r.resposta);
    }
  }

  const atual = canal;
  depois((async () => {
    try {
      const resposta = await atenderNoCanal(admin, atual, { id: pessoa.id, nome: pessoa.global_name ?? pessoa.username ?? null }, texto);
      await responderInteracaoDiscord(i.application_id, i.token, resposta ?? COM_A_EQUIPE);
    } catch (e) {
      console.error('canal: discord', e);
      await responderInteracaoDiscord(i.application_id, i.token, 'Não consegui responder agora. Tente de novo em instantes.').catch(() => {});
    }
  })());
  // "pensando…" só para quem perguntou; a resposta chega em seguida
  return jsonOk({ type: 5, data: { flags: 64 } });
}

// ------------------------------------------------------------
// O servidor ligado no Discord (gateway/discord-gateway.mjs)
// ------------------------------------------------------------
function chaveIgual(a: string, b: string) {
  if (!a || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

/**
 * Fala com o servidor que fica conectado no Discord. Ele se identifica com
 * a chave DISCORD_GATEWAY_KEY e manda:
 *   config   → ao ligar: recebe o token do bot (assim ele só guarda a chave)
 *   ping     → sinal de vida (o painel e o /helpy-config mostram "ligado")
 *   mensagem → alguém escreveu no tópico de um ticket
 */
async function gateway(req: Request): Promise<Response> {
  const chave = Deno.env.get('DISCORD_GATEWAY_KEY') ?? '';
  const veio = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!chave || !chaveIgual(veio, chave)) return ok('', 401);
  const corpo = await req.json().catch(() => ({})) as { tipo?: string; info?: Record<string, unknown>; mensagem?: MensagemGateway };
  const sinal = () => admin.from('helpy_servicos').upsert({ nome: 'discord-gateway', visto_em: new Date().toISOString(), info: corpo.info ?? {} });

  if (corpo.tipo === 'config') {
    const token = Deno.env.get('DISCORD_BOT_TOKEN');
    if (!token) return jsonOk({ pronto: false, motivo: 'Falta DISCORD_BOT_TOKEN nas variáveis das funções do Supabase.' });
    await sinal();
    await registrarComandosHelpy().catch((e) => console.warn('[gateway] comandos', e?.message));
    return jsonOk({ pronto: true, token, app_id: DISCORD_HELPY.appId });
  }
  if (corpo.tipo === 'ping') {
    await sinal();
    return jsonOk({ ok: true });
  }
  if (corpo.tipo === 'mensagem' && corpo.mensagem?.id && corpo.mensagem.author?.id) {
    depois(mensagemDoGateway(corpo.mensagem));
    return jsonOk({ ok: true });
  }
  return ok('', 400);
}

/** O pedido veio da Meta ou do Discord (e não do chat)? */
export function ehDoCanal(req: Request): boolean {
  const q = new URL(req.url).searchParams;
  return q.has('canal') || q.has('discord');
}

export async function receberDoCanal(req: Request): Promise<Response> {
  try {
    const discordId = new URL(req.url).searchParams.get('discord');
    return discordId ? await discord(req, discordId) : await meta(req);
  } catch (e) {
    console.error('canal-webhook:', e);
    return ok('', 500);
  }
}
