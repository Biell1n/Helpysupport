-- ============================================================
-- Uso extra: quando a cota do plano acaba, o atendimento continua e o
-- que passar é cobrado à parte, até um limite por mês que o dono escolhe
-- (como o "uso extra" de assinaturas de IA). Sem limite definido ou com
-- o uso extra desligado, continua como antes: recado para a equipe.
-- ============================================================

alter table public.profiles
  add column if not exists extra_ativo boolean not null default false,
  add column if not exists extra_limite numeric(10, 2) not null default 0
    check (extra_limite >= 0 and extra_limite <= 10000);

-- o dono liga, desliga e muda o limite pelo painel
grant update (extra_ativo, extra_limite) on public.profiles to authenticated;

create table if not exists public.uso_extra (
  owner_id uuid not null references auth.users (id) on delete cascade,
  mes date not null,                       -- primeiro dia do mês (UTC)
  atendimentos integer not null default 0, -- atendimentos além do plano
  mensagens integer not null default 0,    -- mensagens além do plano
  valor numeric(10, 2) not null default 0, -- R$ a cobrar na próxima fatura
  atualizado_em timestamptz not null default now(),
  primary key (owner_id, mes)
);

alter table public.uso_extra enable row level security;

create policy "uso extra da conta" on public.uso_extra
  for select to authenticated
  using (owner_id = (select public.helpy_conta()));

create policy "duas etapas" on public.uso_extra as restrictive for all to authenticated
  using ((select public.helpy_mfa_ok())) with check ((select public.helpy_mfa_ok()));

revoke all on public.uso_extra from anon, authenticated;
grant select on public.uso_extra to authenticated;

-- Soma um uso extra só se couber no limite. Atômico: duas mensagens ao
-- mesmo tempo não passam do limite juntas.
create or replace function public.helpy_usar_extra(p_owner uuid, p_tipo text, p_valor numeric, p_limite numeric)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_mes date := date_trunc('month', now() at time zone 'utc')::date;
  v_ok boolean;
begin
  if p_tipo not in ('atendimento', 'mensagem') or p_valor <= 0 then
    return false;
  end if;
  insert into public.uso_extra (owner_id, mes) values (p_owner, v_mes) on conflict do nothing;
  update public.uso_extra
     set valor = valor + p_valor,
         atendimentos = atendimentos + (p_tipo = 'atendimento')::int,
         mensagens = mensagens + (p_tipo = 'mensagem')::int,
         atualizado_em = now()
   where owner_id = p_owner and mes = v_mes and valor + p_valor <= p_limite
  returning true into v_ok;
  return coalesce(v_ok, false);
end $$;

revoke execute on function public.helpy_usar_extra(uuid, text, numeric, numeric) from public, anon, authenticated;
grant execute on function public.helpy_usar_extra(uuid, text, numeric, numeric) to service_role;
