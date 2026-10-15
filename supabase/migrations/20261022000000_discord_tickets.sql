-- ============================================================
-- Tickets do Discord: cada atendimento aberto pelo botão "Abrir
-- atendimento" vira um tópico privado no servidor da empresa, ligado a
-- uma conversa em Atendimentos.
--
-- discord_tickets  → qual tópico é de qual canal e de quem abriu
--                    (quem não abriu e escreve ali é da equipe)
-- helpy_servicos   → o último sinal de vida do servidor que fica ligado
--                    no Discord (as mensagens livres dos tickets)
--
-- Só as funções do servidor leem e gravam as duas.
-- ============================================================

create table if not exists public.discord_tickets (
  thread_id text primary key check (thread_id ~ '^[0-9]{5,30}$'),
  canal_id uuid not null references public.canais (id) on delete cascade,
  cliente_id text not null check (cliente_id ~ '^[0-9]{5,30}$'),
  cliente_nome text check (char_length(cliente_nome) <= 120),
  -- o último status da conversa que já foi avisado no tópico (evita repetir aviso)
  status_avisado text,
  criado_em timestamptz not null default now(),
  fechado_em timestamptz
);

create index if not exists discord_tickets_cliente on public.discord_tickets (canal_id, cliente_id, criado_em desc);

alter table public.discord_tickets enable row level security;
revoke all on public.discord_tickets from anon, authenticated;

create table if not exists public.helpy_servicos (
  nome text primary key check (char_length(nome) <= 40),
  visto_em timestamptz not null default now(),
  info jsonb not null default '{}'::jsonb
);

alter table public.helpy_servicos enable row level security;
revoke all on public.helpy_servicos from anon, authenticated;
