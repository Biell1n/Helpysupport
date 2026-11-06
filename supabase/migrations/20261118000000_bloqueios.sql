-- ============================================================
-- Bloqueios: timeout (com prazo) ou banimento (sem prazo) de quem gasta o
-- atendimento à toa. Quem bloqueia: o assistente (só timeout, ele escolhe o
-- tempo) ou a equipe. Vale para a pessoa, não só para a conversa: pega o
-- navegador, a conta, o contato do WhatsApp/Instagram e, por um dia, a rede.
-- ============================================================
create table if not exists public.bloqueios (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete set null,
  visitor_id text,
  ip_hash text,
  cliente_id uuid,
  ate timestamptz, -- nulo = banido
  motivo text,
  por text not null default 'equipe' check (por in ('assistente', 'equipe')),
  por_nome text,
  criado_em timestamptz not null default now(),
  removido_em timestamptz
);
create index if not exists bloqueios_visitante on public.bloqueios (owner_id, visitor_id) where removido_em is null;
create index if not exists bloqueios_cliente on public.bloqueios (owner_id, cliente_id) where removido_em is null;
create index if not exists bloqueios_ip on public.bloqueios (owner_id, ip_hash) where removido_em is null;
create index if not exists bloqueios_conversa on public.bloqueios (conversation_id);

alter table public.bloqueios enable row level security;
drop policy if exists "bloqueios da conta" on public.bloqueios;
create policy "bloqueios da conta" on public.bloqueios for all to authenticated
  using (owner_id = (select public.helpy_conta())) with check (owner_id = (select public.helpy_conta()));
drop policy if exists "duas etapas" on public.bloqueios;
create policy "duas etapas" on public.bloqueios as restrictive for all to authenticated
  using ((select public.helpy_mfa_ok())) with check ((select public.helpy_mfa_ok()));
grant select, insert, update on public.bloqueios to authenticated;

-- a lista de atendimentos mostra o ticket bloqueado sem outra consulta
alter table public.conversations add column if not exists bloqueado_ate timestamptz;
alter table public.conversations add column if not exists banido boolean not null default false;
grant update (bloqueado_ate, banido) on public.conversations to authenticated;
