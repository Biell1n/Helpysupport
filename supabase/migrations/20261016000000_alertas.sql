-- ============================================================
-- Alertas: o assistente (ou o sistema) avisa a empresa que algo
-- parece errado — dado que não combina com o negócio, fonte de
-- dados fora do ar, informação contraditória.
-- Dono e funcionários veem e marcam como visto; só o servidor cria.
-- ============================================================

create table public.alertas (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  assistant_id uuid references public.assistants (id) on delete cascade,
  conversation_id uuid references public.conversations (id) on delete set null,
  origem text not null default 'assistente' check (origem in ('assistente', 'sistema')),
  assunto text not null check (char_length(assunto) between 1 and 160),
  detalhe text check (char_length(detalhe) <= 1000),
  -- mesma chave no mesmo dia não repete o aviso (ex.: o banco caiu e 30 clientes perguntaram)
  chave text,
  criado_em timestamptz not null default now(),
  visto_em timestamptz
);

create index alertas_conta on public.alertas (owner_id, criado_em desc);
create unique index alertas_um_por_dia on public.alertas (owner_id, chave, ((criado_em at time zone 'UTC')::date)) where chave is not null;

alter table public.alertas enable row level security;

create policy "alertas da conta" on public.alertas
  for select to authenticated
  using (owner_id = (select public.helpy_conta()));

create policy "marcar alerta como visto" on public.alertas
  for update to authenticated
  using (owner_id = (select public.helpy_conta()))
  with check (owner_id = (select public.helpy_conta()));

revoke all on public.alertas from anon;
revoke insert, delete on public.alertas from authenticated;
grant select on public.alertas to authenticated;
grant update (visto_em) on public.alertas to authenticated;

-- quem ativou duas etapas só vê os alertas depois do código, como nas outras tabelas
create policy "duas etapas" on public.alertas as restrictive for all to authenticated
  using ((select public.helpy_mfa_ok())) with check ((select public.helpy_mfa_ok()));
