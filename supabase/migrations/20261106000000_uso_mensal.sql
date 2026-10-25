-- Cota do mês que não volta a zero apagando assistente.
-- As conversas apagam em cascata com o assistente; este contador fica. A cota
-- usa o maior entre a contagem ao vivo e o contador (o que já existia antes do
-- contador continua valendo pela contagem ao vivo).
create table if not exists public.uso_mensal (
  owner_id uuid not null references auth.users (id) on delete cascade,
  mes date not null,
  atendimentos integer not null default 0,
  mensagens integer not null default 0,
  primary key (owner_id, mes)
);
alter table public.uso_mensal enable row level security;
revoke all on public.uso_mensal from anon, authenticated;
grant select on public.uso_mensal to authenticated;
drop policy if exists "uso do mês próprio" on public.uso_mensal;
create policy "uso do mês próprio" on public.uso_mensal for select to authenticated using (owner_id = (select auth.uid()));

create or replace function public.helpy_somar_uso(p_owner uuid, p_quando timestamptz, p_atend integer, p_msgs integer)
returns void language sql security definer set search_path = public as $$
  insert into uso_mensal (owner_id, mes, atendimentos, mensagens)
  values (p_owner, date_trunc('month', p_quando)::date, greatest(p_atend, 0), greatest(p_msgs, 0))
  on conflict (owner_id, mes) do update
    set atendimentos = greatest(uso_mensal.atendimentos + p_atend, 0),
        mensagens = greatest(uso_mensal.mensagens + p_msgs, 0);
$$;

create or replace function public.helpy_contar_conversa() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  n integer;
begin
  if tg_op = 'INSERT' then
    if not new.teste then perform helpy_somar_uso(new.owner_id, new.created_at, 1, 0); end if;
  elsif old.teste is distinct from new.teste then
    -- conversa marcada (ou desmarcada) como teste: sai (ou volta) da cota, com as mensagens dela
    select count(*) into n from conversation_messages
     where conversation_id = new.id and role = 'user'
       and created_at >= date_trunc('month', new.created_at)
       and created_at < date_trunc('month', new.created_at) + interval '1 month';
    if new.teste then perform helpy_somar_uso(new.owner_id, new.created_at, -1, -n);
    else perform helpy_somar_uso(new.owner_id, new.created_at, 1, n); end if;
  end if;
  return null;
end;
$$;

drop trigger if exists helpy_contar_conversa on public.conversations;
create trigger helpy_contar_conversa after insert or update of teste on public.conversations
  for each row execute function public.helpy_contar_conversa();

create or replace function public.helpy_contar_mensagem() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  c record;
begin
  if new.role <> 'user' then return null; end if;
  select owner_id, teste into c from conversations where id = new.conversation_id;
  if found and not c.teste then perform helpy_somar_uso(c.owner_id, new.created_at, 0, 1); end if;
  return null;
end;
$$;

drop trigger if exists helpy_contar_mensagem on public.conversation_messages;
create trigger helpy_contar_mensagem after insert on public.conversation_messages
  for each row execute function public.helpy_contar_mensagem();

-- uso do mês de uma conta (para as cotas no servidor)
create or replace function public.helpy_uso_mes(p_owner uuid)
returns table (atendimentos bigint, mensagens bigint)
language sql stable security definer set search_path = public as $$
  select
    greatest(
      coalesce((select u.atendimentos from uso_mensal u where u.owner_id = p_owner and u.mes = date_trunc('month', now())::date), 0),
      (select count(*) from conversations where owner_id = p_owner and not teste and created_at >= date_trunc('month', now()))
    ),
    greatest(
      coalesce((select u.mensagens from uso_mensal u where u.owner_id = p_owner and u.mes = date_trunc('month', now())::date), 0),
      (select count(*) from conversation_messages m join conversations c on c.id = m.conversation_id
        where c.owner_id = p_owner and not c.teste and m.role = 'user' and m.created_at >= date_trunc('month', now()))
    );
$$;
revoke execute on function public.helpy_uso_mes(uuid) from public, anon, authenticated;
revoke execute on function public.helpy_somar_uso(uuid, timestamptz, integer, integer) from public, anon, authenticated;

-- começa o contador deste mês com o que já existe
insert into public.uso_mensal (owner_id, mes, atendimentos, mensagens)
select c.owner_id, date_trunc('month', now())::date,
       count(distinct c.id),
       count(m.id) filter (where m.role = 'user')
  from public.conversations c
  left join public.conversation_messages m on m.conversation_id = c.id and m.created_at >= date_trunc('month', now())
 where not c.teste and c.created_at >= date_trunc('month', now())
 group by c.owner_id
on conflict (owner_id, mes) do nothing;

-- o menu do painel também lê pelo contador
create or replace function public.helpy_uso() returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object(
    'atendimentos', greatest(
      coalesce((select u.atendimentos from uso_mensal u where u.owner_id = auth.uid() and u.mes = date_trunc('month', now())::date), 0),
      (select count(*) from conversations where owner_id = auth.uid() and not teste and created_at >= date_trunc('month', now()))),
    'mensagens', greatest(
      coalesce((select u.mensagens from uso_mensal u where u.owner_id = auth.uid() and u.mes = date_trunc('month', now())::date), 0),
      (select count(*) from conversation_messages m join conversations c on c.id = m.conversation_id
        where c.owner_id = auth.uid() and not c.teste and m.role = 'user' and m.created_at >= date_trunc('month', now()))),
    'tickets_abertos', (select count(*) from conversations
                         where owner_id = (select public.helpy_conta()) and not teste and status in ('waiting', 'human')),
    'assistentes', (select count(*) from assistants where owner_id = auth.uid()),
    'tabelas', (select count(*) from tabelas where owner_id = auth.uid()),
    'builder_msgs', (select count(*) from usage_events
                      where owner_id = auth.uid() and kind = 'builder'
                        and created_at >= date_trunc('month', now())),
    'custo_usd', (select coalesce(sum(cost_usd), 0) from usage_events
                   where owner_id = auth.uid() and created_at >= date_trunc('month', now()))
  );
$$;
revoke execute on function public.helpy_uso() from public, anon;
grant execute on function public.helpy_uso() to authenticated;
