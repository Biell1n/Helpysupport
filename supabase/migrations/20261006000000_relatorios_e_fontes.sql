-- ============================================================
-- Helpy — relatórios e fontes de dados externas
--
-- Só acrescenta (nada é apagado): dá para aplicar por cima do
-- esquema de 20261005000000_helpy_schema.sql.
-- ============================================================

-- ------------------------------------------------------------
-- Fontes de dados: além da planilha digitada no Helpy, uma tabela
-- pode vir de um link (CSV / Google Planilhas publicada na web) ou
-- de uma API do sistema da empresa (ERP, banco com API, etc.).
--
--   fonte = 'manual' → linhas em tabela_linhas, editadas no Helpy
--   fonte = 'url'    → linhas copiadas do link; sincronizadas de tempos em tempos
--   fonte = 'api'    → nada é copiado; o assistente consulta ao vivo
-- ------------------------------------------------------------
alter table public.tabelas add column if not exists fonte text not null default 'manual';
alter table public.tabelas add column if not exists fonte_url text;
alter table public.tabelas add column if not exists api_config jsonb;
alter table public.tabelas add column if not exists sincronizada_em timestamptz;
alter table public.tabelas add column if not exists sincronizacao_erro text;

do $$ begin
  alter table public.tabelas add constraint tabelas_fonte_check
    check (fonte in ('manual', 'url', 'api'));
exception when duplicate_object then null; end $$;

-- ------------------------------------------------------------
-- Assuntos mais perguntados: a IA agrupa as primeiras mensagens dos
-- clientes e o resultado fica guardado para não gastar a cada visita.
-- ------------------------------------------------------------
create table if not exists public.relatorio_assuntos (
  owner_id uuid not null references auth.users(id) on delete cascade,
  dias integer not null,
  assuntos jsonb not null default '[]',
  amostra integer not null default 0,
  gerado_em timestamptz not null default now(),
  primary key (owner_id, dias)
);

alter table public.relatorio_assuntos enable row level security;

drop policy if exists "relatório próprio" on public.relatorio_assuntos;
create policy "relatório próprio" on public.relatorio_assuntos
  for select using (owner_id = auth.uid());

-- ------------------------------------------------------------
-- Números do relatório, calculados no banco.
-- security invoker: a RLS garante que cada empresa só vê o que é dela.
-- ------------------------------------------------------------
create or replace function public.helpy_relatorio(dias integer default 30, fuso text default 'America/Sao_Paulo')
returns jsonb
language sql stable security invoker set search_path = public as $$
  with periodo as (
    select greatest(1, least(coalesce(dias, 30), 365)) as n
  ),
  limites as (
    select (date_trunc('day', now() at time zone fuso) - make_interval(days => p.n - 1)) at time zone fuso as desde,
           (date_trunc('day', now() at time zone fuso) - make_interval(days => 2 * p.n - 1)) at time zone fuso as desde_ant,
           p.n
      from periodo p
  ),
  conv as (
    select c.*, (c.created_at at time zone fuso) as local
      from conversations c, limites l
     where c.owner_id = auth.uid() and not c.teste and c.created_at >= l.desde
  ),
  conv_ant as (
    select c.*
      from conversations c, limites l
     where c.owner_id = auth.uid() and not c.teste
       and c.created_at >= l.desde_ant and c.created_at < l.desde
  ),
  dias_serie as (
    select generate_series(
             date_trunc('day', now() at time zone fuso) - make_interval(days => l.n - 1),
             date_trunc('day', now() at time zone fuso),
             interval '1 day')::date as dia
      from limites l
  )
  select jsonb_build_object(
    'dias', (select n from limites),
    'resumo', jsonb_build_object(
      'conversas', (select count(*) from conv),
      'conversas_antes', (select count(*) from conv_ant),
      'resolvidas_sozinho', (select count(*) from conv where escalado_em is null and message_count > 1),
      'com_resposta', (select count(*) from conv where message_count > 1),
      'chamados', (select count(*) from conv where escalado_em is not null),
      'chamados_abertos', (select count(*) from conv where status in ('waiting', 'human')),
      'resposta_equipe_min', (select round(percentile_cont(0.5) within group (
                                 order by extract(epoch from (assumido_em - escalado_em)) / 60)::numeric, 1)
                                from conv where assumido_em is not null and escalado_em is not null
                                 and assumido_em >= escalado_em),
      'nota_media', (select round(avg(nota)::numeric, 2) from conv where nota is not null),
      'notas', (select count(*) from conv where nota is not null),
      'leads', (select count(*) from conv where lead_contato is not null or lead_nome is not null),
      'agendamentos', (select count(*) from agendamentos a, limites l
                        where a.owner_id = auth.uid() and a.origem = 'assistente'
                          and a.created_at >= l.desde),
      'mensagens_media', (select round(avg(message_count)::numeric, 1) from conv)
    ),
    'por_dia', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'dia', d.dia,
               'conversas', coalesce(x.total, 0),
               'chamados', coalesce(x.chamados, 0))
             order by d.dia), '[]'::jsonb)
        from dias_serie d
        left join (
          select local::date as dia, count(*) as total,
                 count(*) filter (where escalado_em is not null) as chamados
            from conv group by 1
        ) x on x.dia = d.dia
    ),
    'por_hora', (
      select coalesce(jsonb_agg(jsonb_build_object('semana', s, 'hora', h, 'conversas', total)), '[]'::jsonb)
        from (
          select extract(dow from local)::int as s, extract(hour from local)::int as h, count(*) as total
            from conv group by 1, 2
        ) z
    ),
    'notas_dist', (
      select coalesce(jsonb_object_agg(nota, total), '{}'::jsonb)
        from (select nota, count(*) as total from conv where nota is not null group by nota) z
    ),
    'encerramento', (
      select coalesce(jsonb_object_agg(coalesce(encerrado_por, 'aberta'), total), '{}'::jsonb)
        from (select encerrado_por, count(*) as total from conv group by encerrado_por) z
    ),
    'por_assistente', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', a.id, 'nome', a.name, 'conversas', z.total, 'chamados', z.chamados,
               'nota', z.nota) order by z.total desc), '[]'::jsonb)
        from (
          select assistant_id, count(*) as total,
                 count(*) filter (where escalado_em is not null) as chamados,
                 round(avg(nota)::numeric, 1) as nota
            from conv group by assistant_id
        ) z join assistants a on a.id = z.assistant_id
    ),
    'lacunas', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', g.id, 'assunto', g.assunto, 'pergunta', g.pergunta,
               'vezes', g.vezes, 'ultima_em', g.ultima_em) order by g.vezes desc, g.ultima_em desc), '[]'::jsonb)
        from (
          select * from assistant_gaps g, limites l
           where g.owner_id = auth.uid() and not g.resolvida and g.ultima_em >= l.desde
           order by g.vezes desc, g.ultima_em desc
           limit 8
        ) g
    ),
    'motivos_chamado', (
      select coalesce(jsonb_agg(jsonb_build_object('motivo', motivo, 'vezes', total) order by total desc), '[]'::jsonb)
        from (
          select lower(trim(motivo)) as motivo, count(*) as total
            from conv where escalado_em is not null and coalesce(trim(motivo), '') <> ''
           group by 1 order by 2 desc limit 6
        ) z
    )
  );
$$;

grant execute on function public.helpy_relatorio(integer, text) to authenticated;
revoke execute on function public.helpy_relatorio(integer, text) from public, anon;

-- ------------------------------------------------------------
-- O que os clientes perguntaram: a primeira mensagem de verdade de
-- cada conversa (pula "oi", "bom dia"…). Só a função de relatórios
-- chama, com o dono já conferido.
-- ------------------------------------------------------------
create or replace function public.helpy_primeiras_perguntas(dono uuid, dias integer)
returns table (conversa uuid, texto text)
language sql stable security definer set search_path = public as $$
  select * from (
    select distinct on (m.conversation_id) m.conversation_id, left(m.content, 240)
      from conversation_messages m
      join conversations c on c.id = m.conversation_id
     where c.owner_id = dono and not c.teste
       and c.created_at >= now() - make_interval(days => greatest(1, least(dias, 365)))
       and m.role = 'user'
       and length(trim(m.content)) > 3
       and lower(trim(m.content)) !~ '^(oi+|ol[aá]|bom dia|boa tarde|boa noite|e a[ií]|opa|tudo bem|hello|hi)[ !.,?]*$'
     order by m.conversation_id, m.created_at
  ) z
  limit 400;
$$;

revoke execute on function public.helpy_primeiras_perguntas(uuid, integer) from public, anon, authenticated;
grant execute on function public.helpy_primeiras_perguntas(uuid, integer) to service_role;
