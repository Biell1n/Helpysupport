// ============================================================
// sql-server — consulta um banco Microsoft SQL Server do cliente.
//
// Separada do chat porque o driver (mssql/tedious) é pesado. Só aceita
// chamada do próprio Helpy (chave de serviço). A consulta já chega
// remontada aqui com _shared/sql.ts (SELECT TOP 20, nomes validados,
// busca como parâmetro).
// ============================================================

import mssql from 'npm:mssql@11.0.1';
import { corsHeaders, json, UserError } from '../_shared/cors.ts';
import { comTempo, configSql, hostPublico, montarConsulta, TEMPO_MS, termoDeBusca, traduzErro } from '../_shared/sql.ts';

function papelDoToken(req: Request): string {
  try {
    const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    return String(JSON.parse(atob(jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).role ?? '');
  } catch {
    return '';
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    // o gateway já conferiu a assinatura do token (verify_jwt); aqui conferimos que é a chave de serviço
    if (papelDoToken(req) !== 'service_role') return json({ error: 'Acesso negado.' }, 403);
    const { cfg: bruto, busca } = await req.json();
    const cfg = configSql(bruto);
    if (cfg.motor !== 'sqlserver') throw new UserError('Motor inválido.');
    await hostPublico(cfg.host);
    // a consulta é remontada aqui, do mesmo jeito validado: nada de SQL pronto vindo de fora
    const { texto: consulta, params } = montarConsulta(cfg, String(busca ?? '').trim(), true);
    // o pacote mssql não traz tipos para o Deno; o formato usado aqui é só request/query/close
    type Pool = { request(): { input(n: string, v: string): void; query(q: string): Promise<{ recordset?: unknown[] }> }; close(): Promise<void> };
    const pool = await comTempo<Pool>(new mssql.ConnectionPool({
      server: cfg.host, port: cfg.porta, database: cfg.banco, user: cfg.usuario, password: cfg.header_valor,
      options: { encrypt: !!cfg.ssl, trustServerCertificate: true, readOnlyIntent: true },
      connectionTimeout: 6000, requestTimeout: TEMPO_MS, pool: { max: 1, min: 0 },
    }).connect());
    try {
      const r = pool.request();
      if (params) r.input('busca', termoDeBusca(String(busca ?? '')));
      const res = await comTempo(r.query(consulta));
      return json({ linhas: res.recordset ?? [] });
    } finally {
      pool.close().catch(() => {});
    }
  } catch (e) {
    try {
      traduzErro(e);
    } catch (u) {
      if (u instanceof UserError) return json({ error: u.message }, 400);
    }
    return json({ error: 'Falha no SQL Server.' }, 500);
  }
});
