-- ============================================================
-- Helpy — tipos de conta e equipe
--
-- empresa     → cria assistentes, tem plano (o padrão)
-- cliente     → só conversa com empresas e acompanha os próprios chamados
-- funcionario → entrou por convite de uma empresa; vê os chamados e a
--               agenda dela, sem mexer em plano nem em assistentes
-- ============================================================

alter table public.profiles add column if not exists tipo text not null default 'empresa'
  check (tipo in ('empresa', 'cliente', 'funcionario'));
alter table public.profiles add column if not exists empresa_id uuid references auth.users(id) on delete set null;

-- o cadastro diz se é empresa ou cliente; funcionário só nasce pelo convite (servidor)
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  tipo text := case when new.raw_user_meta_data->>'tipo' = 'cliente' then 'cliente' else 'empresa' end;
begin
  insert into public.profiles (id, full_name, company_name, termos_versao, termos_aceitos_em, tipo)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    case when tipo = 'empresa' then new.raw_user_meta_data->>'company_name' end,
    new.raw_user_meta_data->>'termos_versao',
    case when new.raw_user_meta_data ? 'termos_versao' then now() end,
    tipo
  )
  on conflict (id) do nothing;
  return new;
end $$;

-- equipe ------------------------------------------------------------------
create table if not exists public.equipe (
  owner_id uuid not null references auth.users(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  nome text,
  email text,
  papel text not null default 'atendente' check (papel in ('atendente')),
  criado_em timestamptz not null default now(),
  primary key (owner_id, user_id)
);
create unique index if not exists equipe_um_por_pessoa on public.equipe (user_id);
alter table public.equipe enable row level security;

create table if not exists public.convites (
  token text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  papel text not null default 'atendente',
  criado_em timestamptz not null default now(),
  expira_em timestamptz not null default now() + interval '7 days',
  usado_por uuid references auth.users(id) on delete set null,
  usado_em timestamptz
);
alter table public.convites enable row level security;

-- a conta de quem está logado: a da empresa, para funcionário; a própria, para os outros
create or replace function public.helpy_conta() returns uuid
language sql stable security definer set search_path = '' as $$
  select coalesce((select e.owner_id from public.equipe e where e.user_id = auth.uid()), auth.uid())
$$;
revoke execute on function public.helpy_conta() from public, anon;
grant execute on function public.helpy_conta() to authenticated;

-- o dono vê a própria equipe e os convites; mudanças passam pela função "conta"
create policy "equipe da empresa" on public.equipe for select to authenticated
  using (owner_id = auth.uid() or user_id = auth.uid());
create policy "convites da empresa" on public.convites for select to authenticated
  using (owner_id = auth.uid());
revoke insert, update, delete on public.equipe, public.convites from authenticated, anon;
revoke all on public.equipe, public.convites from anon;

-- funcionário trabalha nos chamados e na agenda da empresa
alter policy "conversas próprias" on public.conversations
  using (owner_id = (select public.helpy_conta())) with check (owner_id = (select public.helpy_conta()));
alter policy "mensagens das conversas próprias" on public.conversation_messages
  using (exists (select 1 from public.conversations c where c.id = conversation_messages.conversation_id and c.owner_id = (select public.helpy_conta())));
alter policy "equipe responde" on public.conversation_messages
  with check (role = 'agent' and exists (select 1 from public.conversations c where c.id = conversation_messages.conversation_id and c.owner_id = (select public.helpy_conta())));
alter policy "agendamentos próprios" on public.agendamentos
  using (owner_id = (select public.helpy_conta())) with check (owner_id = (select public.helpy_conta()));
create policy "equipe vê a agenda" on public.agenda_config for select to authenticated
  using (owner_id = (select public.helpy_conta()));
create policy "equipe vê os assistentes" on public.assistants for select to authenticated
  using (owner_id = (select public.helpy_conta()));

-- a regra de duas etapas vale para as tabelas novas também
create policy "duas etapas" on public.equipe as restrictive for all to authenticated
  using ((select public.helpy_mfa_ok())) with check ((select public.helpy_mfa_ok()));
create policy "duas etapas" on public.convites as restrictive for all to authenticated
  using ((select public.helpy_mfa_ok())) with check ((select public.helpy_mfa_ok()));

create index if not exists conversations_cliente_idx on public.conversations (cliente_id) where cliente_id is not null;
