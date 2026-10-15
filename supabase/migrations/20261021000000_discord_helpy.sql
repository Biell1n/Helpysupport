-- Discord com o bot do próprio Helpy: a empresa adiciona o bot ao servidor
-- dela pelo Discord e escolhe qual assistente atende ali. Esta tabela guarda
-- o pedido entre a ida ao Discord e a volta (o "state" do OAuth), para
-- ninguém ligar um servidor à conta de outra pessoa.
create table if not exists public.canal_convites (
  state text primary key check (char_length(state) between 20 and 80),
  owner_id uuid not null references auth.users (id) on delete cascade,
  assistant_id uuid not null references public.assistants (id) on delete cascade,
  criado_em timestamptz not null default now()
);

alter table public.canal_convites enable row level security;
revoke all on public.canal_convites from anon, authenticated;
