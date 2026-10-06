// ============================================================
// Fontes de dados externas das tabelas.
//
//   url → um CSV na internet (Google Planilhas "publicar na web",
//         OneDrive, Dropbox, qualquer link que devolva CSV). O Helpy
//         copia as linhas e atualiza de tempos em tempos.
//   api → um endereço JSON do sistema da empresa (ERP como TOTVS
//         Protheus ou SAP, ou um banco SQL com uma API na frente).
//         Nada é copiado: o assistente pergunta ao vivo.
//
// Qualquer endereço digitado pelo cliente passa por urlSegura() para
// o servidor não virar ponte para a rede interna (SSRF).
// ============================================================

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { UserError } from './cors.ts';

export interface ApiConfig {
  url: string;
  header_nome?: string;
  header_valor?: string;
  /** nome do parâmetro de busca na URL (ex.: "q", "$filter" não; algo simples) */
  param_busca?: string;
  /** onde fica a lista no JSON: "value", "d.results", "data.items"… vazio = descobre */
  caminho?: string;
}

export type Linha = Record<string, string>;

const LIMITE_BYTES = 3_000_000;
const LIMITE_LINHAS = 5_000;
const TEMPO_MS = 10_000;
export const VALIDADE_URL_MS = 6 * 60 * 60 * 1000;

// ------------------------------------------------------------
// Segurança de endereço
// ------------------------------------------------------------

function ipPrivado(ip: string): boolean {
  const v4 = ip.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) || a >= 224;
  }
  const v6 = ip.toLowerCase().replace(/^\[|\]$/g, '');
  if (v6.includes(':')) {
    if (v6 === '::' || v6 === '::1') return true;
    const mapeado = v6.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapeado) return ipPrivado(mapeado[1]);
    return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(v6);
  }
  return false;
}

export async function urlSegura(bruta: string): Promise<URL> {
  let u: URL;
  try {
    u = new URL(String(bruta ?? '').trim());
  } catch {
    throw new UserError('Esse endereço não parece um link válido.');
  }
  if (!['https:', 'http:'].includes(u.protocol)) throw new UserError('Use um endereço que comece com https://');
  if (u.username || u.password) throw new UserError('Coloque usuário e senha no campo de cabeçalho, não no link.');
  const host = u.hostname.toLowerCase().replace(/\.$/, '');
  if (
    host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') ||
    host.endsWith('.internal') || host === 'metadata.google.internal' || ipPrivado(host)
  ) {
    throw new UserError('Esse endereço é de rede interna. O Helpy só alcança endereços públicos da internet.');
  }
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(host) && !host.includes(':')) {
    try {
      const ips = [
        ...(await Deno.resolveDns(host, 'A').catch(() => [] as string[])),
        ...(await Deno.resolveDns(host, 'AAAA').catch(() => [] as string[])),
      ];
      if (ips.some(ipPrivado)) throw new UserError('Esse endereço aponta para uma rede interna.');
    } catch (e) {
      if (e instanceof UserError) throw e;
    }
  }
  return u;
}

async function baixar(u: URL, headers: Record<string, string> = {}): Promise<{ texto: string; tipo: string }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TEMPO_MS);
  let res: Response;
  let atual = u;
  try {
    // segue até 3 redirecionamentos, checando cada destino
    for (let i = 0; ; i++) {
      res = await fetch(atual, { headers, redirect: 'manual', signal: ctrl.signal });
      if (res.status >= 300 && res.status < 400 && res.headers.get('location') && i < 3) {
        atual = await urlSegura(new URL(res.headers.get('location')!, atual).toString());
        await res.body?.cancel();
        continue;
      }
      break;
    }
  } catch (e) {
    clearTimeout(timer);
    if (e instanceof UserError) throw e;
    throw new UserError(ctrl.signal.aborted
      ? 'O endereço demorou demais para responder (mais de 10 s).'
      : 'Não conseguimos alcançar esse endereço. Ele está público na internet?');
  }
  try {
    if (res!.status === 401 || res!.status === 403) {
      throw new UserError(`O sistema recusou o acesso (${res!.status}). Confira o cabeçalho de autorização.`);
    }
    if (!res!.ok) throw new UserError(`O endereço respondeu com erro ${res!.status}.`);
    const tamanho = Number(res!.headers.get('content-length') ?? 0);
    if (tamanho > LIMITE_BYTES) throw new UserError('O arquivo passa de 3 MB. Filtre ou divida antes.');
    const buf = await res!.arrayBuffer();
    if (buf.byteLength > LIMITE_BYTES) throw new UserError('O arquivo passa de 3 MB. Filtre ou divida antes.');
    return { texto: new TextDecoder().decode(buf), tipo: res!.headers.get('content-type') ?? '' };
  } finally {
    clearTimeout(timer);
  }
}

// ------------------------------------------------------------
// Planilha por link (CSV)
// ------------------------------------------------------------

/** Link de edição do Google Planilhas vira link de exportação CSV. */
export function linkCsv(url: string): string {
  const g = url.match(/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (g && !/\/pub\?|output=csv|format=csv/.test(url)) {
    const gid = url.match(/[#&?]gid=(\d+)/)?.[1] ?? '0';
    return `https://docs.google.com/spreadsheets/d/${g[1]}/export?format=csv&gid=${gid}`;
  }
  return url.trim();
}

export function lerCsv(texto: string): string[][] {
  const t = texto.replace(/^﻿/, '');
  const primeira = t.split(/\r?\n/, 1)[0] ?? '';
  const sep = (primeira.match(/;/g)?.length ?? 0) > (primeira.match(/,/g)?.length ?? 0) ? ';'
    : (primeira.match(/\t/g)?.length ?? 0) > (primeira.match(/,/g)?.length ?? 0) ? '\t' : ',';
  const linhas: string[][] = [];
  let linha: string[] = [];
  let campo = '';
  let aspas = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (aspas) {
      if (ch === '"' && t[i + 1] === '"') { campo += '"'; i++; }
      else if (ch === '"') aspas = false;
      else campo += ch;
    } else if (ch === '"') aspas = true;
    else if (ch === sep) { linha.push(campo); campo = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && t[i + 1] === '\n') i++;
      linha.push(campo);
      campo = '';
      if (linha.some((c) => c.trim())) linhas.push(linha);
      linha = [];
      if (linhas.length > LIMITE_LINHAS) break;
    } else campo += ch;
  }
  if (campo || linha.length) {
    linha.push(campo);
    if (linha.some((c) => c.trim())) linhas.push(linha);
  }
  return linhas;
}

export function chaveDe(rotulo: string, usadas: Set<string>): string {
  const base = rotulo.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'coluna';
  let k = base;
  for (let i = 2; usadas.has(k); i++) k = `${base}_${i}`;
  usadas.add(k);
  return k;
}

export async function baixarCsv(url: string): Promise<{ cabecalho: string[]; linhas: string[][] }> {
  const u = await urlSegura(linkCsv(url));
  const { texto, tipo } = await baixar(u);
  if (/text\/html/.test(tipo) || /^\s*<(!doctype|html)/i.test(texto)) {
    throw new UserError(
      'O link abriu uma página, não a planilha. No Google Planilhas use Arquivo → Compartilhar → Publicar na web → CSV.',
    );
  }
  const todas = lerCsv(texto);
  if (todas.length < 1) throw new UserError('A planilha está vazia.');
  const cabecalho = todas[0].map((c, i) => c.trim() || `Coluna ${i + 1}`);
  return { cabecalho, linhas: todas.slice(1, LIMITE_LINHAS + 1) };
}

/**
 * Copia a planilha do link para dentro da tabela. As colunas que
 * aparecerem de novo no cabeçalho são criadas; as linhas são trocadas.
 */
export async function sincronizarUrl(db: SupabaseClient, tabelaId: string) {
  const { data: t, error } = await db.from('tabelas').select('id, fonte, fonte_url').eq('id', tabelaId).single();
  if (error || !t) throw new UserError('Tabela não encontrada.', 404);
  if (t.fonte !== 'url' || !t.fonte_url) throw new UserError('Esta tabela não está ligada a um link.');

  try {
    const { cabecalho, linhas } = await baixarCsv(t.fonte_url);
    const { data: cols } = await db.from('tabela_colunas').select('chave, rotulo, ordem').eq('tabela_id', tabelaId);
    const porRotulo = new Map((cols ?? []).map((c) => [c.rotulo.trim().toLowerCase(), c.chave]));
    const usadas = new Set((cols ?? []).map((c) => c.chave));
    let ordem = Math.max(-1, ...(cols ?? []).map((c) => c.ordem)) + 1;
    const novas: Record<string, unknown>[] = [];
    const chaves = cabecalho.map((r) => {
      const ja = porRotulo.get(r.toLowerCase());
      if (ja) return ja;
      const k = chaveDe(r, usadas);
      porRotulo.set(r.toLowerCase(), k);
      novas.push({ tabela_id: tabelaId, chave: k, rotulo: r.slice(0, 80), tipo: 'texto', ordem: ordem++ });
      return k;
    });
    if (novas.length) {
      const { error: e } = await db.from('tabela_colunas').insert(novas);
      if (e) throw e;
    }
    const registros = linhas.map((l) => {
      const dados: Record<string, string> = {};
      chaves.forEach((k, i) => {
        const v = (l[i] ?? '').trim();
        if (v) dados[k] = v.slice(0, 2000);
      });
      return { tabela_id: tabelaId, dados };
    }).filter((r) => Object.keys(r.dados).length);

    const { error: eDel } = await db.from('tabela_linhas').delete().eq('tabela_id', tabelaId);
    if (eDel) throw eDel;
    for (let i = 0; i < registros.length; i += 500) {
      const { error: eIns } = await db.from('tabela_linhas').insert(registros.slice(i, i + 500));
      if (eIns) throw eIns;
    }
    await db.from('tabelas')
      .update({ sincronizada_em: new Date().toISOString(), sincronizacao_erro: null })
      .eq('id', tabelaId);
    return { linhas: registros.length, colunas_novas: novas.length };
  } catch (e) {
    const msg = e instanceof UserError ? e.message : 'Falha ao atualizar a planilha.';
    await db.from('tabelas').update({ sincronizacao_erro: msg }).eq('id', tabelaId);
    throw e;
  }
}

// ------------------------------------------------------------
// API ao vivo
// ------------------------------------------------------------

function pegar(obj: unknown, caminho: string): unknown {
  return caminho.split('.').filter(Boolean).reduce<unknown>(
    (o, p) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[p] : undefined),
    obj,
  );
}

/** Acha a lista de registros no JSON: raiz, OData (value / d.results) ou chaves comuns. */
export function listaDe(json: unknown, caminho?: string): unknown[] {
  if (caminho?.trim()) {
    const v = pegar(json, caminho.trim());
    if (Array.isArray(v)) return v;
    throw new UserError(`Não achamos uma lista em "${caminho}" na resposta.`);
  }
  if (Array.isArray(json)) return json;
  for (const c of ['value', 'd.results', 'd', 'data', 'items', 'results', 'rows', 'records', 'registros', 'dados', 'produtos']) {
    const v = pegar(json, c);
    if (Array.isArray(v)) return v;
  }
  if (json && typeof json === 'object') {
    const arr = Object.values(json as Record<string, unknown>).find(Array.isArray);
    if (arr) return arr as unknown[];
    return [json];
  }
  throw new UserError('A resposta não traz uma lista de registros.');
}

/** Deixa cada registro plano: { "preco": "10", "estoque.qtd": "3" }. */
export function achatar(o: unknown, prefixo = '', out: Linha = {}, nivel = 0): Linha {
  if (o === null || o === undefined) return out;
  if (typeof o !== 'object') {
    if (prefixo) out[prefixo] = String(o).slice(0, 300);
    return out;
  }
  if (Array.isArray(o)) {
    if (o.every((x) => typeof x !== 'object')) {
      if (prefixo) out[prefixo] = o.join(', ').slice(0, 300);
    }
    return out;
  }
  if (nivel > 2) return out;
  for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
    if (k === '__metadata' || k.startsWith('@odata')) continue;
    achatar(v, prefixo ? `${prefixo}.${k}` : k, out, nivel + 1);
    if (Object.keys(out).length >= 40) break;
  }
  return out;
}

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export async function consultarApi(cfg: ApiConfig, busca = ''): Promise<{ total: number; linhas: Linha[] }> {
  const u = await urlSegura(cfg.url);
  const termo = busca.trim();
  if (termo && cfg.param_busca?.trim()) u.searchParams.set(cfg.param_busca.trim(), termo);
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (cfg.header_nome?.trim() && cfg.header_valor) {
    const nome = cfg.header_nome.trim();
    if (!/^[A-Za-z0-9-]{1,60}$/.test(nome) || /^(host|content-length|cookie)$/i.test(nome)) {
      throw new UserError('Nome de cabeçalho inválido.');
    }
    headers[nome] = cfg.header_valor;
  }
  const { texto } = await baixar(u, headers);
  let json: unknown;
  try {
    json = JSON.parse(texto);
  } catch {
    throw new UserError('O endereço não devolveu JSON. Ele precisa responder em JSON.');
  }
  let linhas = listaDe(json, cfg.caminho).map((x) => achatar(x));
  if (termo && !cfg.param_busca?.trim()) {
    const t = semAcento(termo);
    const palavras = t.split(/\s+/).filter((w) => w.length >= 3);
    const texto = (l: Linha) => semAcento(Object.values(l).join(' '));
    const exatos = linhas.filter((l) => texto(l).includes(t));
    linhas = exatos.length || !palavras.length ? exatos : linhas.filter((l) => palavras.every((w) => texto(l).includes(w)));
  }
  return { total: linhas.length, linhas: linhas.slice(0, 50) };
}
