-- O mês das cotas, do uso extra e da taxa de vendas vira à meia-noite de Brasília
-- (antes virava em UTC, às 21h do último dia no horário de Brasília).

create or replace function public.helpy_mes(p_quando timestamptz)
returns date language sql stable set search_path = '' as $$
  select date_trunc('month', p_quando at time zone 'America/Sao_Paulo')::date;
$$;

create or replace function public.helpy_inicio_mes()
returns timestamptz language sql stable set search_path = '' as $$
  select (date_trunc('month', now() at time zone 'America/Sao_Paulo')) at time zone 'America/Sao_Paulo';
$$;

create or replace function public.helpy_somar_uso(p_owner uuid, p_quando timestamp with time zone, p_atend integer, p_msgs integer)
 returns void
 language sql
 security definer
 set search_path to 'public'
as $function$
  insert into uso_mensal (owner_id, mes, atendimentos, mensagens)
  values (p_owner, public.helpy_mes(p_quando), greatest(p_atend, 0), greatest(p_msgs, 0))
  on conflict (owner_id, mes) do update
    set atendimentos = greatest(uso_mensal.atendimentos + p_atend, 0),
        mensagens = greatest(uso_mensal.mensagens + p_msgs, 0);
$function$;

create or replace function public.helpy_contar_conversa()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  n integer;
  ini timestamptz;
begin
  if tg_op = 'INSERT' then
    if not new.teste then perform helpy_somar_uso(new.owner_id, new.created_at, 1, 0); end if;
  elsif old.teste is distinct from new.teste then
    ini := public.helpy_mes(new.created_at)::timestamp at time zone 'America/Sao_Paulo';
    select count(*) into n from conversation_messages
     where conversation_id = new.id and role = 'user'
       and created_at >= ini
       and created_at < ini + interval '1 month';
    if new.teste then perform helpy_somar_uso(new.owner_id, new.created_at, -1, -n);
    else perform helpy_somar_uso(new.owner_id, new.created_at, 1, n); end if;
  end if;
  return null;
end;
$function$;

create or replace function public.helpy_uso_mes(p_owner uuid)
 returns table(atendimentos bigint, mensagens bigint)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select
    greatest(
      coalesce((select u.atendimentos from uso_mensal u where u.owner_id = p_owner and u.mes = public.helpy_mes(now())), 0),
      (select count(*) from conversations where owner_id = p_owner and not teste and created_at >= public.helpy_inicio_mes())
    ),
    greatest(
      coalesce((select u.mensagens from uso_mensal u where u.owner_id = p_owner and u.mes = public.helpy_mes(now())), 0),
      (select count(*) from conversation_messages m join conversations c on c.id = m.conversation_id
        where c.owner_id = p_owner and not c.teste and not c.aprendiz and m.role = 'user' and m.created_at >= public.helpy_inicio_mes()),
      (select ceil(coalesce(sum(cost_usd), 0) / 0.0015)::bigint from usage_events
        where owner_id = p_owner and kind = 'atendimento' and created_at >= public.helpy_inicio_mes())
    );
$function$;

create or replace function public.helpy_uso()
 returns jsonb
 language sql
 stable
 set search_path to 'public'
as $function$
  select jsonb_build_object(
    'atendimentos', greatest(
      coalesce((select u.atendimentos from uso_mensal u where u.owner_id = auth.uid() and u.mes = public.helpy_mes(now())), 0),
      (select count(*) from conversations where owner_id = auth.uid() and not teste and created_at >= public.helpy_inicio_mes())),
    'mensagens', greatest(
      coalesce((select u.mensagens from uso_mensal u where u.owner_id = auth.uid() and u.mes = public.helpy_mes(now())), 0),
      (select count(*) from conversation_messages m join conversations c on c.id = m.conversation_id
        where c.owner_id = auth.uid() and not c.teste and not c.aprendiz and m.role = 'user' and m.created_at >= public.helpy_inicio_mes()),
      (select ceil(coalesce(sum(cost_usd), 0) / 0.0015)::bigint from usage_events
        where owner_id = auth.uid() and kind = 'atendimento' and created_at >= public.helpy_inicio_mes())),
    'tickets_abertos', (select count(*) from conversations
                         where owner_id = (select public.helpy_conta()) and not teste and status in ('waiting', 'human')),
    'assistentes', (select count(*) from assistants where owner_id = auth.uid()),
    'tabelas', (select count(*) from tabelas where owner_id = auth.uid()),
    'builder_msgs', (select greatest(count(*), ceil(coalesce(sum(cost_usd), 0) / 0.03)::bigint) from usage_events
                      where owner_id = auth.uid() and kind = 'builder'
                        and created_at >= public.helpy_inicio_mes()),
    'custo_usd', (select coalesce(sum(cost_usd), 0) from usage_events
                   where owner_id = auth.uid() and created_at >= public.helpy_inicio_mes())
  );
$function$;

create or replace function public.helpy_usar_extra(p_owner uuid, p_tipo text, p_valor numeric, p_limite numeric)
 returns boolean
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_mes date := public.helpy_mes(now());
  v_ok boolean;
begin
  if p_tipo not in ('atendimento', 'mensagem') or p_valor <= 0 then
    return false;
  end if;
  if exists (select 1 from public.uso_extra where owner_id = p_owner and status = 'atrasado')
     or exists (select 1 from public.assinaturas where owner_id = p_owner and status = 'cancelada') then
    return false;
  end if;
  insert into public.uso_extra (owner_id, mes) values (p_owner, v_mes) on conflict do nothing;
  update public.uso_extra
     set valor = valor + p_valor,
         atendimentos = atendimentos + (p_tipo = 'atendimento')::int,
         mensagens = mensagens + (p_tipo = 'mensagem')::int,
         atualizado_em = now()
   where owner_id = p_owner and mes = v_mes and status = 'aberto' and valor + p_valor <= p_limite
  returning true into v_ok;
  return coalesce(v_ok, false);
end $function$;

create or replace function public.helpy_somar_taxa(p_owner uuid, p_valor numeric)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_mes date := public.helpy_mes(now());
begin
  if p_valor is null or p_valor = 0 then
    return;
  end if;
  insert into public.uso_extra (owner_id, mes) values (p_owner, v_mes) on conflict do nothing;
  if not exists (select 1 from public.uso_extra where owner_id = p_owner and mes = v_mes and status = 'aberto') then
    v_mes := (v_mes + interval '1 month')::date;
    insert into public.uso_extra (owner_id, mes) values (p_owner, v_mes) on conflict do nothing;
  end if;
  update public.uso_extra
     set taxa_vendas = greatest(0, taxa_vendas + p_valor), atualizado_em = now()
   where owner_id = p_owner and mes = v_mes and status = 'aberto';
end $function$;
