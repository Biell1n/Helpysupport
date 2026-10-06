-- ============================================================
-- Helpy — aceite dos termos, cadastro protegido e agenda automática
--
-- 1. Aceite dos termos guardado no perfil (versão e quando).
-- 2. Cadastro por e-mail só passa com o aceite e a prova "não sou um
--    robô" (prova de trabalho conferida aqui, no banco).
-- 3. Agenda: serviços com duração e valor, registro automático dos
--    agendamentos numa tabela de Dados, status "pendente" para quem
--    prefere confirmar antes, e tabelas em que o assistente escreve.
-- ============================================================

-- 1. termos ---------------------------------------------------------------
alter table public.profiles add column if not exists termos_versao text;
alter table public.profiles add column if not exists termos_aceitos_em timestamptz;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, company_name, termos_versao, termos_aceitos_em)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    new.raw_user_meta_data->>'company_name',
    new.raw_user_meta_data->>'termos_versao',
    case when new.raw_user_meta_data ? 'termos_versao' then now() end
  )
  on conflict (id) do nothing;
  return new;
end $$;

create or replace function public.helpy_aceitar_termos(p_versao text) returns void
language sql security definer set search_path = public as $$
  update public.profiles
     set termos_versao = left(p_versao, 20), termos_aceitos_em = now()
   where id = auth.uid()
$$;
revoke execute on function public.helpy_aceitar_termos(text) from public, anon;
grant execute on function public.helpy_aceitar_termos(text) to authenticated;

-- 2. cadastro protegido -----------------------------------------------------
create or replace function public.helpy_cadastro_guardiao() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  ts bigint;
  h bytea;
  zeros int := 0;
  i int;
  b int;
begin
  -- Google e convites do painel não passam pelo formulário
  if coalesce(new.raw_app_meta_data->>'provider', 'email') <> 'email' or new.invited_at is not null then
    return new;
  end if;
  if coalesce(meta->>'termos_versao', '') = '' then
    raise exception 'helpy_cadastro: aceite dos termos ausente';
  end if;
  begin
    ts := (meta->>'prova_ts')::bigint;
  exception when others then
    raise exception 'helpy_cadastro: prova ausente';
  end;
  if ts is null or abs(extract(epoch from now()) * 1000 - ts) > 86400000 then
    raise exception 'helpy_cadastro: prova vencida';
  end if;
  h := sha256(convert_to(lower(new.email) || ':' || ts::text || ':' || coalesce(meta->>'prova_nonce', ''), 'UTF8'));
  for i in 0..3 loop
    b := get_byte(h, i);
    if b = 0 then
      zeros := zeros + 8;
    else
      while b < 128 loop
        zeros := zeros + 1;
        b := b * 2;
      end loop;
      exit;
    end if;
  end loop;
  if zeros < 17 then
    raise exception 'helpy_cadastro: prova inválida';
  end if;
  -- a prova não precisa ficar guardada
  new.raw_user_meta_data := meta - 'prova_ts' - 'prova_nonce';
  return new;
end $$;
revoke execute on function public.helpy_cadastro_guardiao() from public, anon, authenticated;

drop trigger if exists helpy_cadastro_guardiao on auth.users;
create trigger helpy_cadastro_guardiao before insert on auth.users
  for each row execute function public.helpy_cadastro_guardiao();

-- 3. agenda -------------------------------------------------------------------
-- o que dá para marcar: [{ "nome": "Corte", "duracao_min": 40, "valor": 45 }]
alter table public.agenda_config add column if not exists servicos jsonb not null default '[]';
alter table public.agenda_config add column if not exists registrar_em_dados boolean not null default false;
alter table public.agenda_config add column if not exists registro_tabela_id uuid references public.tabelas(id) on delete set null;

alter table public.agendamentos add column if not exists valor numeric(12, 2);
alter table public.agendamentos drop constraint if exists agendamentos_status_check;
alter table public.agendamentos add constraint agendamentos_status_check
  check (status in ('pendente', 'confirmado', 'cancelado', 'concluido', 'faltou'));

-- tabela em que o assistente pode acrescentar linhas (pedidos, agendamentos…)
alter table public.tabelas add column if not exists assistente_escreve boolean not null default false;
