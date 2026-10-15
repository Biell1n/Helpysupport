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
const DISCORD = 'https://discord.com/api/v10';


export const NOMES: Record<TipoCanal, string> = { whatsapp: 'WhatsApp', instagram: 'Instagram', discord: 'Discord' };

/**
 * O que fica no Vault para cada canal: o token de acesso e, quando a
 * empresa usa o próprio app da Meta, o segredo desse app (para conferir
 * que o aviso veio mesmo da Meta).
 */
export interface Segredo {
  token: string;
  app_secret?: string;
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

async function pedir(url: string, init: RequestInit, servico: string) {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(15000) });
  if (!res.ok) {
    const corpo = await res.text().catch(() => '');
    throw new ErroDoCanal(servico, res.status, corpo);
  }
  return res.status === 204 ? null : res.json().catch(() => null);
}

/** Envia um texto para o contato pelo canal (respostas do assistente e da equipe). */
export async function enviarPeloCanal(db: SupabaseClient, canal: Canal, contato: string, texto: string) {
  const token = await tokenDo(db, canal.id);
  if (canal.tipo === 'whatsapp') {
    for (const parte of pedacos(texto, 4000)) {
      await pedir(`${GRAPH}/${canal.externo_id}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to: contato, type: 'text', text: { preview_url: false, body: parte } }),
      }, 'O WhatsApp');
    }
  } else if (canal.tipo === 'instagram') {
    for (const parte of pedacos(texto, 1000)) {
      await pedir(`${GRAPH_IG}/me/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipient: { id: contato }, message: { text: parte } }),
      }, 'O Instagram');
    }
  } else {
    // Discord: mensagem direta do bot para a pessoa
    const dm = await pedir(`${DISCORD}/users/@me/channels`, {
      method: 'POST',
      headers: { Authorization: `Bot ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipient_id: contato }),
    }, 'O Discord') as { id: string };
    for (const parte of pedacos(texto, 1900)) {
      await pedir(`${DISCORD}/channels/${dm.id}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bot ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: parte, allowed_mentions: { parse: [] } }),
      }, 'O Discord');
    }
  }
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
