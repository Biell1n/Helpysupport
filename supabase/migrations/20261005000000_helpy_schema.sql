-- ============================================================
-- Helpy — esquema completo do banco
--
-- Pensado para um projeto Supabase novo. Rode inteiro no SQL Editor
-- ou com `supabase db push`. Tudo que é do dono da conta fica protegido
-- por RLS (owner_id = auth.uid()); o que o cliente final faz passa pela
-- edge function public-chat, que usa a service role.
-- ============================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- Utilitário: updated_at automático
-- ------------------------------------------------------------
create or replace function public.helpy_touch() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ------------------------------------------------------------
-- Perfis e plano
-- ------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  company_name text,
  phone text,
  plan text not null default 'trial'
    check (plan in ('trial', 'essencial', 'profissional', 'business')),
  trial_ends_at timestamptz default (now() + interval '14 days'),
  plan_renews_at timestamptz,
  -- atendimentos comprados em pacote, gastos depois da cota do mês
  creditos_extra integer not null default 0,
  -- contador para numerar os chamados de cada empresa (Nº 0001, 0002…)
  ticket_seq integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.helpy_touch();

-- cria o perfil assim que a conta nasce
create or replace function public.helpy_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, company_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    new.raw_user_meta_data->>'company_name'
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.helpy_new_user();

-- o usuário não pode trocar o próprio plano pelo cliente
create or replace function public.helpy_protect_plan() returns trigger
language plpgsql as $$
begin
  if auth.role() = 'authenticated' then
    new.plan := old.plan;
    new.trial_ends_at := old.trial_ends_at;
    new.plan_renews_at := old.plan_renews_at;
    new.creditos_extra := old.creditos_extra;
    new.ticket_seq := old.ticket_seq;
  end if;
  return new;
end $$;

drop trigger if exists profiles_protect on public.profiles;
create trigger profiles_protect before update on public.profiles
  for each row execute function public.helpy_protect_plan();

-- ------------------------------------------------------------
-- Assistentes
-- ------------------------------------------------------------
create table if not exists public.assistants (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  business_type text,
  business_model text,
  schema jsonb not null default '{"sections": []}',
  config jsonb not null default '{}',
  -- memória do builder: modelo de negócio, catálogo, campos criados
  meta jsonb not null default '{}',
  public_token text unique,
  is_public boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists assistants_owner on public.assistants(owner_id);

drop trigger if exists assistants_touch on public.assistants;
create trigger assistants_touch before update on public.assistants
  for each row execute function public.helpy_touch();

-- Rascunho do builder: o que o chat e o formulário vão montando
create table if not exists public.builder_sessions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  assistant_id uuid references public.assistants(id) on delete cascade,
  business_type text,
  schema jsonb not null default '{"sections": []}',
  config jsonb not null default '{}',
  meta jsonb not null default '{}',
  messages jsonb not null default '[]',
  status text not null default 'active' check (status in ('active', 'done')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists builder_sessions_owner on public.builder_sessions(owner_id, status);

drop trigger if exists builder_sessions_touch on public.builder_sessions;
create trigger builder_sessions_touch before update on public.builder_sessions
  for each row execute function public.helpy_touch();

-- ------------------------------------------------------------
-- Conversas e chamados
--
-- status:
--   bot     → o assistente está atendendo
--   waiting → virou chamado, aguardando alguém da equipe
--   human   → uma pessoa assumiu
--   closed  → encerrado
-- ------------------------------------------------------------
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  assistant_id uuid not null references public.assistants(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  numero integer,
  visitor_id text not null,
  teste boolean not null default false,
  status text not null default 'bot' check (status in ('bot', 'waiting', 'human', 'closed')),
  titulo text,
  motivo text,
  resumo text,
  prioridade text not null default 'normal' check (prioridade in ('baixa', 'normal', 'alta')),
  lead_nome text,
  lead_contato text,
  lead_interesse text,
  assumido_por uuid references auth.users(id) on delete set null,
  assumido_nome text,
  assumido_em timestamptz,
  escalado_em timestamptz,
  lido_em timestamptz,
  fechado_em timestamptz,
  encerrado_por text check (encerrado_por in ('cliente', 'equipe', 'assistente')),
  nota smallint check (nota between 1 and 5),
  feedback_texto text,
  message_count integer not null default 0,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists conversations_owner on public.conversations(owner_id, status, last_message_at desc);
create index if not exists conversations_owner_month on public.conversations(owner_id, created_at);
create index if not exists conversations_visitor on public.conversations(assistant_id, visitor_id);

create or replace function public.helpy_conversation_numero() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.numero is null and not new.teste then
    update public.profiles set ticket_seq = ticket_seq + 1
      where id = new.owner_id
      returning ticket_seq into new.numero;
  end if;
  return new;
end $$;

drop trigger if exists conversations_numero on public.conversations;
create trigger conversations_numero before insert on public.conversations
  for each row execute function public.helpy_conversation_numero();

create table if not exists public.conversation_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'agent', 'system')),
  content text not null,
  author_name text,
  created_at timestamptz not null default now()
);
create index if not exists conversation_messages_conv on public.conversation_messages(conversation_id, created_at);

create or replace function public.helpy_message_stats() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.conversations
     set message_count = message_count + 1,
         last_message_at = new.created_at
   where id = new.conversation_id;
  return new;
end $$;

drop trigger if exists conversation_messages_stats on public.conversation_messages;
create trigger conversation_messages_stats after insert on public.conversation_messages
  for each row execute function public.helpy_message_stats();

-- ------------------------------------------------------------
-- Dados: planilhas que o assistente consulta
-- ------------------------------------------------------------
create table if not exists public.tabelas (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  nome text not null,
  proposito text default '',
  criada_em timestamptz not null default now(),
  alterada_em timestamptz not null default now()
);
create index if not exists tabelas_owner on public.tabelas(owner_id);

create table if not exists public.tabela_colunas (
  id uuid primary key default gen_random_uuid(),
  tabela_id uuid not null references public.tabelas(id) on delete cascade,
  chave text not null,
  rotulo text not null,
  tipo text not null default 'texto'
    check (tipo in ('texto', 'texto_longo', 'numero', 'moeda', 'data', 'selecao', 'booleano')),
  ordem integer not null default 0,
  obrigatoria boolean not null default false,
  identifica boolean not null default false,
  chave_primaria boolean not null default false,
  unica boolean not null default false,
  padrao text,
  opcoes jsonb,
  ref_tabela_id uuid references public.tabelas(id) on delete set null,
  ref_coluna_chave text,
  unique (tabela_id, chave)
);

create table if not exists public.tabela_linhas (
  id uuid primary key default gen_random_uuid(),
  tabela_id uuid not null references public.tabelas(id) on delete cascade,
  dados jsonb not null default '{}',
  criada_em timestamptz not null default now()
);
create index if not exists tabela_linhas_tabela on public.tabela_linhas(tabela_id, criada_em);

create or replace function public.helpy_tabela_alterada() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.tabelas set alterada_em = now()
   where id = coalesce(new.tabela_id, old.tabela_id);
  return null;
end $$;

drop trigger if exists tabela_linhas_alterada on public.tabela_linhas;
create trigger tabela_linhas_alterada after insert or update or delete on public.tabela_linhas
  for each row execute function public.helpy_tabela_alterada();

-- quais tabelas cada assistente consulta
create table if not exists public.assistente_tabelas (
  assistant_id uuid not null references public.assistants(id) on delete cascade,
  tabela_id uuid not null references public.tabelas(id) on delete cascade,
  primary key (assistant_id, tabela_id)
);

-- ------------------------------------------------------------
-- Lacunas: o que perguntaram e o assistente não soube responder.
-- É o dado mais útil para o dono melhorar o assistente.
-- ------------------------------------------------------------
create table if not exists public.assistant_gaps (
  id uuid primary key default gen_random_uuid(),
  assistant_id uuid not null references public.assistants(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  assunto text not null,
  pergunta text,
  vezes integer not null default 1,
  resolvida boolean not null default false,
  criada_em timestamptz not null default now(),
  ultima_em timestamptz not null default now(),
  unique (assistant_id, assunto)
);

-- ------------------------------------------------------------
-- Agenda
-- ------------------------------------------------------------
create table if not exists public.agenda_config (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  ativa boolean not null default false,
  fuso text not null default 'America/Sao_Paulo',
  duracao_min integer not null default 30 check (duracao_min between 5 and 480),
  antecedencia_horas integer not null default 2 check (antecedencia_horas >= 0),
  -- dia da semana (0 = domingo) → lista de faixas ["09:00","12:00"]
  horarios jsonb not null default '{
    "1": [["09:00","18:00"]], "2": [["09:00","18:00"]], "3": [["09:00","18:00"]],
    "4": [["09:00","18:00"]], "5": [["09:00","18:00"]], "6": [["09:00","13:00"]], "0": []
  }',
  updated_at timestamptz not null default now()
);

drop trigger if exists agenda_config_touch on public.agenda_config;
create trigger agenda_config_touch before update on public.agenda_config
  for each row execute function public.helpy_touch();

create table if not exists public.agendamentos (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  assistant_id uuid references public.assistants(id) on delete set null,
  conversation_id uuid references public.conversations(id) on delete set null,
  cliente_nome text not null,
  cliente_contato text,
  servico text,
  observacao text,
  inicio timestamptz not null,
  fim timestamptz not null,
  status text not null default 'confirmado' check (status in ('confirmado', 'cancelado', 'concluido', 'faltou')),
  origem text not null default 'manual' check (origem in ('manual', 'assistente')),
  created_at timestamptz not null default now(),
  check (fim > inicio)
);
create index if not exists agendamentos_owner_inicio on public.agendamentos(owner_id, inicio);

-- ------------------------------------------------------------
-- Uso de IA (para medir custo real por cliente)
-- ------------------------------------------------------------
create table if not exists public.usage_events (
  id bigint generated always as identity primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  assistant_id uuid references public.assistants(id) on delete set null,
  kind text not null check (kind in ('builder', 'atendimento')),
  model text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cache_read_tokens integer not null default 0,
  cache_write_tokens integer not null default 0,
  cost_usd numeric(12, 6) not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists usage_events_owner on public.usage_events(owner_id, created_at);

-- ------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.assistants enable row level security;
alter table public.builder_sessions enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_messages enable row level security;
alter table public.tabelas enable row level security;
alter table public.tabela_colunas enable row level security;
alter table public.tabela_linhas enable row level security;
alter table public.assistente_tabelas enable row level security;
alter table public.assistant_gaps enable row level security;
alter table public.agenda_config enable row level security;
alter table public.agendamentos enable row level security;
alter table public.usage_events enable row level security;

drop policy if exists "perfil próprio" on public.profiles;
create policy "perfil próprio" on public.profiles
  for all using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "assistentes próprios" on public.assistants;
create policy "assistentes próprios" on public.assistants
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists "sessões próprias" on public.builder_sessions;
create policy "sessões próprias" on public.builder_sessions
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists "conversas próprias" on public.conversations;
create policy "conversas próprias" on public.conversations
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists "mensagens das conversas próprias" on public.conversation_messages;
create policy "mensagens das conversas próprias" on public.conversation_messages
  for select using (exists (
    select 1 from public.conversations c
     where c.id = conversation_id and c.owner_id = auth.uid()));

-- pela tela, a equipe só escreve como atendente
drop policy if exists "equipe responde" on public.conversation_messages;
create policy "equipe responde" on public.conversation_messages
  for insert with check (
    role = 'agent' and exists (
      select 1 from public.conversations c
       where c.id = conversation_id and c.owner_id = auth.uid()));

drop policy if exists "tabelas próprias" on public.tabelas;
create policy "tabelas próprias" on public.tabelas
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists "colunas das tabelas próprias" on public.tabela_colunas;
create policy "colunas das tabelas próprias" on public.tabela_colunas
  for all using (exists (select 1 from public.tabelas t where t.id = tabela_id and t.owner_id = auth.uid()))
  with check (exists (select 1 from public.tabelas t where t.id = tabela_id and t.owner_id = auth.uid()));

drop policy if exists "linhas das tabelas próprias" on public.tabela_linhas;
create policy "linhas das tabelas próprias" on public.tabela_linhas
  for all using (exists (select 1 from public.tabelas t where t.id = tabela_id and t.owner_id = auth.uid()))
  with check (exists (select 1 from public.tabelas t where t.id = tabela_id and t.owner_id = auth.uid()));

drop policy if exists "vínculos próprios" on public.assistente_tabelas;
create policy "vínculos próprios" on public.assistente_tabelas
  for all using (exists (select 1 from public.assistants a where a.id = assistant_id and a.owner_id = auth.uid()))
  with check (
    exists (select 1 from public.assistants a where a.id = assistant_id and a.owner_id = auth.uid())
    and exists (select 1 from public.tabelas t where t.id = tabela_id and t.owner_id = auth.uid()));

drop policy if exists "lacunas próprias" on public.assistant_gaps;
create policy "lacunas próprias" on public.assistant_gaps
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists "agenda própria" on public.agenda_config;
create policy "agenda própria" on public.agenda_config
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists "agendamentos próprios" on public.agendamentos;
create policy "agendamentos próprios" on public.agendamentos
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists "uso próprio" on public.usage_events;
create policy "uso próprio" on public.usage_events
  for select using (owner_id = auth.uid());

-- ------------------------------------------------------------
-- Uso do mês, para o painel e para a página de plano
-- ------------------------------------------------------------
create or replace function public.helpy_uso() returns jsonb
language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'atendimentos', (select count(*) from conversations
                      where owner_id = auth.uid() and not teste
                        and created_at >= date_trunc('month', now())),
    'tickets_abertos', (select count(*) from conversations
                         where owner_id = auth.uid() and status in ('waiting', 'human')),
    'assistentes', (select count(*) from assistants where owner_id = auth.uid()),
    'tabelas', (select count(*) from tabelas where owner_id = auth.uid()),
    'builder_msgs', (select count(*) from usage_events
                      where owner_id = auth.uid() and kind = 'builder'
                        and created_at >= date_trunc('month', now())),
    'custo_usd', (select coalesce(sum(cost_usd), 0) from usage_events
                   where owner_id = auth.uid() and created_at >= date_trunc('month', now()))
  );
$$;
