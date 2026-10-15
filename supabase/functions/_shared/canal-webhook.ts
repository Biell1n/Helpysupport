// ============================================================
// Onde a Meta e o Discord avisam que chegou mensagem. Atende pelo
// mesmo endereço do chat público (public-chat), que já é aberto sem
// login:
//
//   GET  ?canal=meta&hub.mode=subscribe… → a Meta confirmando o endereço
//   POST ?canal=meta (WhatsApp/Instagram) → assinatura conferida, resposta
//                                           em segundo plano pelo canal
//   POST ?discord=<canal>                 → comando /helpy (Ed25519)
//
// A segurança é a assinatura de cada aviso.
// ============================================================

import { admin } from './db.ts';
import {
  assinaturaDiscordOk,
  assinaturaMetaOk,
  type Canal,
  enviarPeloCanal,
  jaVista,
  responderInteracaoDiscord,
  segredoDo,
  type TipoCanal,
} from './canais.ts';
import { atenderNoCanal } from './canal-atender.ts';

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
type Recebida = { canal: Canal; id: string; contato: { id: string; nome?: string | null; telefone?: string | null }; texto: string | null };

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
      type IgEvento = { sender?: { id?: string }; message?: { mid?: string; text?: string; is_echo?: boolean; attachments?: unknown[] } };
      for (const ev of (e.messaging as IgEvento[] | undefined) ?? []) {
        const m = ev.message;
        const de = ev.sender?.id;
        if (!m?.mid || !de || m.is_echo || de === conta) continue; // o que a própria conta mandou
        out.push({ canal, id: `ig:${m.mid}`, contato: { id: de }, texto: m.text ?? null });
      }
    }
  }
  return out;
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
      await atender(r.canal, r.contato, r.texto);
    }
  })());
  return ok();
}

// ------------------------------------------------------------
// Discord (comando /helpy)
// ------------------------------------------------------------
type Interacao = {
  type: number; id: string; token: string; application_id: string;
  data?: { name?: string; options?: { name: string; value: string }[] };
  member?: { user?: { id: string; username?: string; global_name?: string } };
  user?: { id: string; username?: string; global_name?: string };
};

async function discord(req: Request, canalId: string): Promise<Response> {
  if (req.method !== 'POST' || !/^[0-9a-f-]{36}$/i.test(canalId)) return ok('', 404);
  const { data } = await admin.from('canais').select('*').eq('id', canalId).eq('tipo', 'discord').maybeSingle();
  const canal = data as Canal | null;
  if (!canal) return ok('', 404);

  const bruto = await req.text();
  const assinou = await assinaturaDiscordOk(
    bruto, req.headers.get('X-Signature-Ed25519'), req.headers.get('X-Signature-Timestamp'), canal.config?.public_key ?? '',
  );
  if (!assinou) return ok('assinatura inválida', 401);

  const i = JSON.parse(bruto) as Interacao;
  if (i.type === 1) return jsonOk({ type: 1 }); // PING do Discord ao salvar o endereço
  if (i.type !== 2 || i.data?.name !== 'helpy') return jsonOk({ type: 4, data: { content: 'Comando desconhecido.', flags: 64 } });
  if (canal.status === 'pausado') {
    return jsonOk({ type: 4, data: { content: 'O atendimento por aqui está pausado no momento.', flags: 64 } });
  }

  const pessoa = i.member?.user ?? i.user;
  const texto = String(i.data.options?.find((o) => o.name === 'mensagem')?.value ?? '');
  if (!pessoa?.id) return jsonOk({ type: 4, data: { content: 'Não consegui identificar quem mandou.', flags: 64 } });

  depois((async () => {
    try {
      const resposta = await atenderNoCanal(admin, canal, { id: pessoa.id, nome: pessoa.global_name ?? pessoa.username ?? null }, texto);
      await responderInteracaoDiscord(i.application_id, i.token, resposta ?? COM_A_EQUIPE);
    } catch (e) {
      console.error('canal: discord', e);
      await responderInteracaoDiscord(i.application_id, i.token, 'Não consegui responder agora. Tente de novo em instantes.').catch(() => {});
    }
  })());
  // "pensando…" só para quem perguntou; a resposta chega em seguida
  return jsonOk({ type: 5, data: { flags: 64 } });
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
