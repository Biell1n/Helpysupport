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

/** Só o próprio Helpy chama esta função: a chave de serviço do projeto (formato novo ou JWT antigo). */
function chamadaInterna(req: Request): boolean {
  const recebida = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const esperada = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (recebida && esperada && recebida.length === esperada.length) {
    let dif = 0;
    for (let i = 0; i < recebida.length; i++) dif |= recebida.charCodeAt(i) ^ esperada.charCodeAt(i);
    if (dif === 0) return true;
  }
  try {
    return JSON.parse(atob(recebida.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).role === 'service_role';
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    if (!chamadaInterna(req)) return json({ error: 'Acesso negado.' }, 403);
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
