-- Relatórios: quanto cada pessoa da equipe atendeu no período (chamados
-- assumidos, resolvidos, tempo até assumir, respostas enviadas e nota).
-- Quem assumiu pelo painel é identificado pelo usuário; pelo Discord ou
-- pelo app do Instagram, pelo nome que ficou no chamado.
create or replace function public.helpy_relatorio_equipe(dias integer default 30, fuso text default 'America/Sao_Paulo')
returns jsonb
language sql stable security invoker set search_path = public as $$
  with limites as (
    select (date_trunc('day', now() at time zone fuso)
            - make_interval(days => greatest(1, least(coalesce(dias, 30), 365)) - 1)) at time zone fuso as desde
  ),
  pessoas as (
    select coalesce(c.assumido_por::text, 'nome:' || coalesce(c.assumido_nome, 'Equipe')) as chave,
           coalesce(e.nome, c.assumido_nome, 'Equipe') as nome,
           c.assumido_por = auth.uid() as dono,
           c.id, c.status, c.nota, c.escalado_em, c.assumido_em
      from conversations c
      cross join limites l
      left join equipe e on e.owner_id = c.owner_id and e.user_id = c.assumido_por
     where c.owner_id = auth.uid() and not c.teste
       and c.assumido_em is not null and c.assumido_em >= l.desde
  ),
  respostas as (
    select p.chave, count(*) as n
      from pessoas p
      join conversation_messages m on m.conversation_id = p.id and m.role = 'agent'
     group by p.chave
  ),
  por_pessoa as (
    select p.chave,
           max(p.nome) as nome,
           bool_or(coalesce(p.dono, false)) as dono,
           count(*) as chamados,
           count(*) filter (where p.status = 'closed') as resolvidos,
           percentile_cont(0.5) within group (order by extract(epoch from (p.assumido_em - p.escalado_em)) / 60)
             filter (where p.escalado_em is not null and p.assumido_em >= p.escalado_em) as assumir_min,
           round(avg(p.nota) filter (where p.nota is not null), 1) as nota,
           count(p.nota) as notas
      from pessoas p
     group by p.chave
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'chave', pp.chave,
           'nome', pp.nome,
           'dono', pp.dono,
           'chamados', pp.chamados,
           'resolvidos', pp.resolvidos,
           'assumir_min', round(pp.assumir_min::numeric, 1),
           'respostas', coalesce(r.n, 0),
           'nota', pp.nota,
           'notas', pp.notas
         ) order by pp.chamados desc, pp.nome), '[]'::jsonb)
    from por_pessoa pp
    left join respostas r on r.chave = pp.chave;
$$;

grant execute on function public.helpy_relatorio_equipe(integer, text) to authenticated;
revoke execute on function public.helpy_relatorio_equipe(integer, text) from public, anon;
