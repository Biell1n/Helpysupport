-- ============================================================
-- Carteira Helpy: a empresa recebe sem criar conta em outro lugar.
--
-- O Helpy abre uma subconta Asaas no nome da empresa (o dinheiro fica
-- guardado pelo Asaas, instituição autorizada pelo Banco Central) e
-- mostra saldo, extrato e saque dentro do painel.
--
--   recebimentos.modo  → "chave" (a empresa colou a chave da conta dela)
--                        ou "carteira" (o Helpy abriu a conta para ela)
--   saques             → histórico de cada saque, com quem pediu
-- ============================================================

alter table public.recebimentos add column if not exists modo text not null default 'chave' check (modo in ('chave', 'carteira'));
alter table public.recebimentos add column if not exists asaas_conta_id text;
alter table public.recebimentos add column if not exists wallet_id text;
alter table public.recebimentos add column if not exists documento text;
alter table public.recebimentos add column if not exists situacao text;

grant select (owner_id, provedor, ambiente, conta_nome, ativo, criado_em, modo, situacao) on public.recebimentos to authenticated;

create table if not exists public.saques (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  valor numeric(12, 2) not null check (valor > 0),
  destino text not null,
  status text not null default 'pedido',
  asaas_id text,
  pedido_por uuid references auth.users (id) on delete set null,
  criado_em timestamptz not null default now()
);
create index if not exists saques_conta on public.saques (owner_id, criado_em desc);

alter table public.saques enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'saques' and policyname = 'saques da conta') then
    create policy "saques da conta" on public.saques for select to authenticated using (owner_id = (select auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'saques' and policyname = 'duas etapas') then
    create policy "duas etapas" on public.saques as restrictive for all to authenticated
      using ((select public.helpy_mfa_ok())) with check ((select public.helpy_mfa_ok()));
  end if;
end $$;
revoke all on public.saques from anon, authenticated;
grant select on public.saques to authenticated;
