-- Taxa do Helpy sobre as vendas fechadas pelo assistente.
--
-- O link de pagamento do Asaas não divide o valor entre contas, então a taxa
-- é somada no mês (junto do uso extra) e vira a mesma fatura no começo do mês
-- seguinte. Venda devolvida antes da fatura sai da conta.

alter table public.pedidos add column if not exists taxa numeric(10, 2) not null default 0;
alter table public.uso_extra add column if not exists taxa_vendas numeric(10, 2) not null default 0;

-- Soma (ou tira, com valor negativo) a taxa no mês aberto. Se o mês atual já
-- foi faturado (assinatura cancelada), vai para o mês seguinte.
create or replace function public.helpy_somar_taxa(p_owner uuid, p_valor numeric)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_mes date := date_trunc('month', now() at time zone 'utc')::date;
begin
  if p_valor is null or p_valor = 0 then
    return;
  end if;
  insert into public.uso_extra (owner_id, mes) values (p_owner, v_mes) on conflict do nothing;
  if not exists (select 1 from public.uso_extra where owner_id = p_owner and mes = v_mes and status = 'aberto') then
    v_mes := (v_mes + interval '1 month')::date;
    insert into public.uso_extra (owner_id, mes) values (p_owner, v_mes) on conflict do nothing;
  end if;
  update public.uso_extra
     set taxa_vendas = greatest(0, taxa_vendas + p_valor), atualizado_em = now()
   where owner_id = p_owner and mes = v_mes and status = 'aberto';
end $$;

revoke execute on function public.helpy_somar_taxa(uuid, numeric) from public, anon, authenticated;
grant execute on function public.helpy_somar_taxa(uuid, numeric) to service_role;

-- A Carteira Helpy (subconta) só existe quando a conta do Helpy no Asaas é de
-- CNPJ: o Asaas não deixa conta de CPF abrir subcontas. Até lá, a empresa liga
-- a própria conta do Asaas.
insert into public.helpy_config (chave, valor) values ('carteira_disponivel', 'false') on conflict do nothing;
