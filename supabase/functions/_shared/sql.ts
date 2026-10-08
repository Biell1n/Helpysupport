// ============================================================
// Banco SQL do cliente, consultado ao vivo pelo atendente.
//
// PostgreSQL, MySQL/MariaDB e SQL Server. Regras de segurança:
//   - só endereço público (o mesmo filtro de rede interna das APIs)
//   - só leitura: transação READ ONLY onde o banco permite, e a consulta
//     é montada aqui (SELECT em uma tabela/visão, colunas escolhidas),
//     nunca SQL livre vindo do chat
//   - nomes de tabela e coluna validados e entre aspas; a busca vai como
//     parâmetro (nada de concatenar texto do cliente)
//   - tempo máximo de 8 s e no máximo 20 linhas por consulta
//   - a senha fica no Vault e só é aberta aqui, no servidor
// ============================================================

import { UserError } from './cors.ts';
import { urlSegura } from './rede.ts';

type Linha = Record<string, string>;

export type Motor = 'postgres' | 'mysql' | 'sqlserver';

export interface SqlConfig {
  motor: Motor;
  host: string;
  porta?: number;
  banco: string;
  usuario: string;
  header_valor?: string; // a senha (vai para o Vault ao salvar)
  tabela: string; // tabela ou visão: "produtos" ou "vendas.produtos"
  colunas?: string[];
  ssl?: boolean;
}

const PORTA: Record<Motor, number> = { postgres: 5432, mysql: 3306, sqlserver: 1433 };
const NOME_RE = /^[A-Za-z_][A-Za-z0-9_$]{0,62}$/;
const MAX_LINHAS = 20;
export const TEMPO_MS = 8000;

function partes(nome: string): string[] {
  const p = nome.trim().split('.');
  if (!p.length || p.length > 2 || !p.every((x) => NOME_RE.test(x))) {
    throw new UserError(`Nome inválido: "${nome}". Use só letras, números e _ (ex.: produtos ou estoque.produtos).`);
  }
  return p;
}

function aspas(motor: Motor, nome: string): string {
  return partes(nome).map((x) => (motor === 'mysql' ? `\`${x}\`` : motor === 'sqlserver' ? `[${x}]` : `"${x}"`)).join('.');
}

export function configSql(bruta: unknown): SqlConfig {
  const c = (bruta ?? {}) as Record<string, unknown>;
  const s = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max);
  const motor = (['postgres', 'mysql', 'sqlserver'].includes(String(c.motor)) ? c.motor : 'postgres') as Motor;
  const porta = Number(c.porta) || PORTA[motor];
  if (porta < 1024 || porta > 65535) throw new UserError('Porta inválida. Use a porta do banco (ex.: 5432, 3306 ou 1433).');
  const colunas = Array.isArray(c.colunas) ? (c.colunas as unknown[]).map((x) => s(x, 63)).filter(Boolean).slice(0, 30) : [];
  colunas.forEach(partes);
  const cfg: SqlConfig = {
    motor,
    host: s(c.host, 255).replace(/^\w+:\/\//, '').replace(/\/.*$/, ''),
    porta,
    banco: s(c.banco, 128),
    usuario: s(c.usuario, 128),
    header_valor: String(c.header_valor ?? '').slice(0, 512),
    tabela: s(c.tabela, 130),
    colunas,
    ssl: c.ssl !== false,
  };
  if (!cfg.host || !cfg.banco || !cfg.usuario || !cfg.tabela) throw new UserError('Preencha servidor, banco, usuário e tabela.');
  partes(cfg.tabela);
  return cfg;
}

/** O servidor do banco precisa ser público (mesma checagem das APIs, contra acesso à rede interna). */
export async function hostPublico(host: string) {
  await urlSegura(`https://${host.includes(':') && !host.startsWith('[') ? `[${host}]` : host}/`);
}

/** "óleo" → "%óleo%", com % e _ do texto valendo como letra. */
export function termoDeBusca(busca: string): string {
  return `%${busca.trim().slice(0, 100).replace(/[%_\\]/g, (x) => `\\${x}`)}%`;
}

export function montarConsulta(cfg: SqlConfig, busca: string, comBusca: boolean) {
  const m = cfg.motor;
  const cols = cfg.colunas?.length ? cfg.colunas.map((c) => aspas(m, c)).join(', ') : '*';
  const tabela = aspas(m, cfg.tabela);
  const procurar = comBusca && busca && cfg.colunas?.length;
  const cond = procurar
    ? cfg.colunas!.map((c) =>
        m === 'postgres' ? `cast(${aspas(m, c)} as text) ilike $1`
        : m === 'mysql' ? `cast(${aspas(m, c)} as char) like ?`
        : `cast(${aspas(m, c)} as nvarchar(4000)) like @busca escape '\\'`
      ).join(' or ')
    : '';
  const where = cond ? ` where ${cond}` : '';
  if (m === 'sqlserver') return { texto: `select top ${MAX_LINHAS} ${cols} from ${tabela}${where}`, params: procurar ? 1 : 0 };
  return { texto: `select ${cols} from ${tabela}${where} limit ${MAX_LINHAS}`, params: procurar ? (m === 'mysql' ? cfg.colunas!.length : 1) : 0 };
}

export function comTempo<T>(p: Promise<T>): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, nao) => setTimeout(() => nao(new UserError('O banco demorou demais para responder (mais de 8 s).')), TEMPO_MS)),
  ]);
}

export function texto(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 19).replace('T', ' ').replace(' 00:00:00', '');
  if (typeof v === 'object') return JSON.stringify(v).slice(0, 300);
  return String(v).slice(0, 300);
}

export function traduzErro(e: unknown): never {
  if (e instanceof UserError) throw e;
  const msg = String((e as Error)?.message ?? e);
  const code = String((e as { code?: string })?.code ?? '');
  if (/password|authentication|login failed|access denied|28P01|ER_ACCESS_DENIED/i.test(msg + code)) throw new UserError('Usuário ou senha do banco recusados.');
  if (/does not exist|doesn't exist|invalid object name|42P01|ER_NO_SUCH_TABLE/i.test(msg + code)) throw new UserError('Tabela ou coluna não encontrada. Confira o nome (ex.: estoque.produtos).');
  if (/permission denied|SELECT command denied|42501/i.test(msg + code)) throw new UserError('O usuário não tem permissão de leitura nessa tabela.');
  if (/ENOTFOUND|getaddrinfo|name resolution/i.test(msg + code)) throw new UserError('Não achamos esse servidor. Confira o endereço.');
  if (/ssl|tls|certificate/i.test(msg)) throw new UserError('Falha no SSL. Se o banco não usa SSL, desmarque a opção.');
  if (/ECONNREFUSED|ETIMEDOUT|timeout|connect|closed/i.test(msg + code)) throw new UserError('Não conseguimos conectar no banco. Ele aceita conexões de fora (firewall liberado para a internet ou para o Helpy)?');
  console.error('[sql]', e);
  throw new UserError('O banco respondeu com erro. Confira os dados da conexão.');
}

/** Roda a consulta (com ou sem busca) e devolve as linhas como texto. */
export async function consultarSql(
  cfg: SqlConfig,
  busca = '',
  interno: { redeLocalEmTeste?: boolean } = {}, // só testes automatizados; nunca vem de pedido de usuário
): Promise<{ total: number; linhas: Linha[] }> {
  if (!interno.redeLocalEmTeste) await hostPublico(cfg.host);
  const termo = termoDeBusca(busca);
  const { texto: consulta, params } = montarConsulta(cfg, busca.trim(), true);
  let bruto: Record<string, unknown>[] = [];
  try {
    if (cfg.motor === 'postgres') {
      const { default: postgres } = await import('npm:postgres@3.4.5');
      const sql = postgres({
        host: cfg.host, port: cfg.porta, database: cfg.banco, username: cfg.usuario, password: cfg.header_valor,
        ssl: cfg.ssl ? 'require' : false, max: 1, connect_timeout: 6, idle_timeout: 1, prepare: false,
        connection: { application_name: 'helpy', statement_timeout: TEMPO_MS, default_transaction_read_only: true },
      });
      try {
        bruto = await comTempo(sql.begin('read only', (tx) => tx.unsafe(consulta, params ? [termo] : []))) as Record<string, unknown>[];
      } finally {
        sql.end({ timeout: 1 }).catch(() => {});
      }
    } else if (cfg.motor === 'mysql') {
      const mysql = await import('npm:mysql2@3.11.3/promise');
      const con = await comTempo(mysql.createConnection({
        host: cfg.host, port: cfg.porta, database: cfg.banco, user: cfg.usuario, password: cfg.header_valor,
        ssl: cfg.ssl ? { rejectUnauthorized: false } : undefined, connectTimeout: 6000, dateStrings: true,
      }));
      try {
        await con.query('SET SESSION TRANSACTION READ ONLY');
        await con.query(`SET SESSION MAX_EXECUTION_TIME=${TEMPO_MS}`).catch(() => {}); // MariaDB não tem; o tempo total ainda vale
        const [linhas] = await comTempo(con.query(consulta, Array(params).fill(termo)));
        bruto = linhas as Record<string, unknown>[];
      } finally {
        con.end().catch(() => {});
      }
    } else {
      // SQL Server roda numa função à parte: o driver da Microsoft é pesado e deixaria o chat lento
      bruto = await comTempo(sqlServerRemoto(cfg, busca));
    }
  } catch (e) {
    traduzErro(e);
  }
  const linhas = bruto.slice(0, MAX_LINHAS).map((r) => Object.fromEntries(Object.entries(r).slice(0, 40).map(([k, v]) => [k, texto(v)])));
  return { total: linhas.length, linhas };
}

/** Chama a função sql-server com a chave de serviço (só o próprio Helpy consegue). */
async function sqlServerRemoto(cfg: SqlConfig, busca: string): Promise<Record<string, unknown>[]> {
  const r = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/sql-server`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ cfg, busca }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new UserError(d.error ?? 'O banco SQL Server respondeu com erro.');
  return d.linhas ?? [];
}
