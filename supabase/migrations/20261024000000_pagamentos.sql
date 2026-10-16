-- ============================================================
-- Pagamentos (Asaas)
--
-- 1) O Helpy cobrando os planos:
--      assinaturas → a assinatura de cada conta (um plano por vez)
--      faturas     → cada cobrança mensal (Pix, cartão ou boleto)
-- 2) A empresa vendendo pelo assistente (o dinheiro vai direto para ela):
--      recebimentos → a conta Asaas da empresa (a chave fica no Vault)
--      pedidos      → o que o assistente fechou, com o link de pagamento
--
-- Quem grava é o servidor (funções). O painel só lê o que é da conta.
-- ============================================================

create table if not exists public.assinaturas (
  owner_id uuid primary key references auth.users (id) on delete cascade,
  plano text not null check (plano in ('essencial', 'profissional', 'business')),
  status text not null default 'pendente' check (status in ('pendente', 'ativa', 'atrasada', 'cancelada')),
  valor numeric(10, 2) not null,
  asaas_cliente text,
  asaas_assinatura text unique,
  -- a assinatura anterior (troca de plano): só é apagada quando a nova for paga
  asaas_anterior text,
  proximo_vencimento date,
  criada_em timestamptz not null default now(),
  atualizada_em timestamptz not null default now()
);

create table if not exists public.faturas (
  id text primary key, -- id do pagamento no Asaas
  owner_id uuid not null references auth.users (id) on delete cascade,
  valor numeric(10, 2) not null,
  status text not null,
  vencimento date,
  pago_em timestamptz,
  link text,
  forma text,
  descricao text,
  criada_em timestamptz not null default now()
);
create index if not exists faturas_conta on public.faturas (owner_id, vencimento desc);

create table if not exists public.recebimentos (
  owner_id uuid primary key references auth.users (id) on delete cascade,
  provedor text not null default 'asaas' check (provedor in ('asaas')),
  ambiente text not null default 'sandbox' check (ambiente in ('sandbox', 'producao')),
  conta_nome text check (char_length(conta_nome) <= 120),
  segredo uuid,
  webhook_token text not null default encode(extensions.gen_random_bytes(24), 'hex'),
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

create table if not exists public.pedidos (
  id uuid primary key default gen_random_uuid(),
  numero integer not null,
  owner_id uuid not null references auth.users (id) on delete cascade,
  assistant_id uuid references public.assistants (id) on delete set null,
  conversation_id uuid references public.conversations (id) on delete set null,
  itens jsonb not null,
  total numeric(12, 2) not null check (total > 0),
  status text not null default 'aguardando' check (status in ('aguardando', 'pago', 'cancelado')),
  cliente_nome text check (char_length(cliente_nome) <= 120),
  link_url text,
  link_id text,
  pagamento_id text,
  forma text,
  pago_em timestamptz,
  criado_em timestamptz not null default now(),
  unique (owner_id, numero)
);
create index if not exists pedidos_conta on public.pedidos (owner_id, criado_em desc);
create index if not exists pedidos_link on public.pedidos (link_id);

-- número do pedido por conta: 1, 2, 3…
create or replace function public.helpy_pedido_numero() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform pg_advisory_xact_lock(hashtext('pedido:' || new.owner_id::text));
  select coalesce(max(numero), 0) + 1 into new.numero from public.pedidos where owner_id = new.owner_id;
  return new;
end $$;

drop trigger if exists pedidos_numero on public.pedidos;
create trigger pedidos_numero before insert on public.pedidos
  for each row execute function public.helpy_pedido_numero();

-- leitura: só o que é da conta (dono e funcionários); escrita só pelo servidor
alter table public.assinaturas enable row level security;
alter table public.faturas enable row level security;
alter table public.recebimentos enable row level security;
alter table public.pedidos enable row level security;

create policy "assinatura da conta" on public.assinaturas for select to authenticated using (owner_id = (select public.helpy_conta()));
create policy "faturas da conta" on public.faturas for select to authenticated using (owner_id = (select public.helpy_conta()));
create policy "recebimento da conta" on public.recebimentos for select to authenticated using (owner_id = (select public.helpy_conta()));
create policy "pedidos da conta" on public.pedidos for select to authenticated using (owner_id = (select public.helpy_conta()));

create policy "duas etapas" on public.assinaturas as restrictive for all to authenticated
  using ((select public.helpy_mfa_ok())) with check ((select public.helpy_mfa_ok()));
create policy "duas etapas" on public.faturas as restrictive for all to authenticated
  using ((select public.helpy_mfa_ok())) with check ((select public.helpy_mfa_ok()));
create policy "duas etapas" on public.recebimentos as restrictive for all to authenticated
  using ((select public.helpy_mfa_ok())) with check ((select public.helpy_mfa_ok()));
create policy "duas etapas" on public.pedidos as restrictive for all to authenticated
  using ((select public.helpy_mfa_ok())) with check ((select public.helpy_mfa_ok()));

revoke all on public.assinaturas, public.faturas, public.recebimentos, public.pedidos from anon, authenticated;
grant select on public.assinaturas, public.faturas, public.pedidos to authenticated;
grant select (owner_id, provedor, ambiente, conta_nome, ativo, criado_em) on public.recebimentos to authenticated;

-- a chave da conta Asaas da empresa: só o servidor grava e lê -------------
create or replace function public.helpy_recebimento_guardar_segredo(p_conta uuid, p_valor text) returns void
language plpgsql security definer set search_path = public, vault as $$
declare
  atual uuid;
begin
  select segredo into atual from public.recebimentos where owner_id = p_conta;
  if atual is null then
    update public.recebimentos
       set segredo = vault.create_secret(p_valor, 'helpy_recebimento_' || p_conta::text, 'Chave Asaas da conta ' || p_conta::text)
     where owner_id = p_conta;
  else
    perform vault.update_secret(atual, p_valor);
  end if;
end $$;

create or replace function public.helpy_recebimento_segredo(p_conta uuid) returns text
language sql stable security definer set search_path = public, vault as $$
  select s.decrypted_secret
    from public.recebimentos r
    join vault.decrypted_secrets s on s.id = r.segredo
   where r.owner_id = p_conta
$$;

create or replace function public.helpy_recebimento_apaga_segredo() returns trigger
language plpgsql security definer set search_path = public, vault as $$
begin
  if old.segredo is not null then
    delete from vault.secrets where id = old.segredo;
  end if;
  return old;
end $$;

drop trigger if exists recebimentos_apaga_segredo on public.recebimentos;
create trigger recebimentos_apaga_segredo after delete on public.recebimentos
  for each row execute function public.helpy_recebimento_apaga_segredo();

revoke execute on function public.helpy_recebimento_guardar_segredo(uuid, text) from public, anon, authenticated;
revoke execute on function public.helpy_recebimento_segredo(uuid) from public, anon, authenticated;
revoke execute on function public.helpy_recebimento_apaga_segredo() from public, anon, authenticated;
revoke execute on function public.helpy_pedido_numero() from public, anon, authenticated;
grant execute on function public.helpy_recebimento_guardar_segredo(uuid, text) to service_role;
grant execute on function public.helpy_recebimento_segredo(uuid) to service_role;
