-- ============================================================
-- Suporte do Helpy para as empresas: chamado aberto para a equipe Helpy.
--
-- Tudo passa pela função "suporte" (service role): as tabelas ficam com
-- RLS ligada e sem política, então ninguém lê nem escreve direto do navegador.
-- ============================================================

-- quem é da equipe Helpy (atende a fila do suporte)
create table if not exists public.helpy_equipe (
  user_id uuid primary key references auth.users (id) on delete cascade,
  nome text not null,
  criado_em timestamptz not null default now()
);
alter table public.helpy_equipe enable row level security;

create sequence if not exists public.suporte_numero_seq start 1001;

create table if not exists public.suporte_chamados (
  id uuid primary key default gen_random_uuid(),
  numero integer not null unique default nextval('public.suporte_numero_seq'),
  -- quem abriu e de qual empresa (para o funcionário, a empresa é a do dono)
  autor_id uuid not null references auth.users (id) on delete cascade,
  empresa_id uuid not null references auth.users (id) on delete cascade,
  categoria text not null,
  assunto text not null check (char_length(assunto) between 3 and 140),
  -- ia: o assistente do suporte respondeu e espera a pessoa dizer se resolveu
  -- fila: espera a equipe Helpy · aguardando_voce: a equipe respondeu
  status text not null default 'ia' check (status in ('ia', 'fila', 'aguardando_voce', 'resolvido')),
  prioridade text not null default 'normal' check (prioridade in ('normal', 'alta')),
  assistant_id uuid references public.assistants (id) on delete set null,
  -- retrato da conta no momento em que abriu (plano, canais, avisos)
  diagnostico jsonb not null default '[]'::jsonb,
  plano text,
  nota smallint check (nota between 1 and 5),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  resolvido_em timestamptz
);
alter table public.suporte_chamados enable row level security;
create index if not exists suporte_chamados_empresa on public.suporte_chamados (empresa_id, atualizado_em desc);
create index if not exists suporte_chamados_fila on public.suporte_chamados (status, prioridade, atualizado_em);

create table if not exists public.suporte_mensagens (
  id bigint generated always as identity primary key,
  chamado_id uuid not null references public.suporte_chamados (id) on delete cascade,
  -- cliente: quem abriu (ou alguém da empresa) · ia: assistente do suporte
  -- equipe: pessoa da equipe Helpy · sistema: mudança de status
  autor text not null check (autor in ('cliente', 'ia', 'equipe', 'sistema')),
  autor_id uuid references auth.users (id) on delete set null,
  autor_nome text,
  texto text not null check (char_length(texto) between 1 and 5000),
  criado_em timestamptz not null default now()
);
alter table public.suporte_mensagens enable row level security;
create index if not exists suporte_mensagens_chamado on public.suporte_mensagens (chamado_id, criado_em);

-- o dono do Helpy entra na equipe do suporte
insert into public.helpy_equipe (user_id, nome)
select id, 'Carlos' from auth.users where email in ('bemagass521@gmail.com', 'carlosgabriel0216@gmail.com')
on conflict (user_id) do nothing;
