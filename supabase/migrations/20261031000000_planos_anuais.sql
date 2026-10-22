-- Planos anuais, ambiente de cada cobrança e o modo de preços de teste.

-- Ciclo da assinatura: mensal ou anual (anual sai mais barato por mês).
alter table public.assinaturas
  add column if not exists ciclo text not null default 'mensal' check (ciclo in ('mensal', 'anual'));

-- Em qual Asaas a assinatura e a fatura nasceram (sandbox ou producao). As
-- antigas, sem valor, são do sandbox: ao virar para produção elas são
-- ignoradas em vez de apontar para clientes que não existem lá.
alter table public.assinaturas add column if not exists ambiente text check (ambiente in ('sandbox', 'producao'));
alter table public.faturas add column if not exists ambiente text check (ambiente in ('sandbox', 'producao'));

-- Ajustes gerais do Helpy, lidos só pelo servidor.
create table if not exists public.helpy_config (
  chave text primary key,
  valor jsonb not null,
  atualizado_em timestamptz not null default now()
);
alter table public.helpy_config enable row level security;
revoke all on public.helpy_config from anon, authenticated;

-- Preços de teste (o mínimo do Asaas) para o próprio dono testar a cobrança
-- de ponta a ponta. Desligado por padrão.
insert into public.helpy_config (chave, valor) values ('precos_teste', 'false') on conflict do nothing;
