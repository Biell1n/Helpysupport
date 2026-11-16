-- Funcionário vê os avisos do dia a dia da empresa, mas não os de cobrança e conta
-- (fatura, uso extra, cota, plano, vagas, saque, suporte com o Helpy): esses são só do dono.
create or replace function public.helpy_aviso_do_dono(p_chave text) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(p_chave, '') ~ '^(fatura|extra|plano|vagas|saque|suporte|cota80|cota100|servico):';
$$;

drop policy if exists "alertas da conta" on public.alertas;
create policy "alertas da conta" on public.alertas
  for select to authenticated
  using (owner_id = (select public.helpy_conta())
         and (owner_id = (select auth.uid()) or not public.helpy_aviso_do_dono(chave)));

drop policy if exists "marcar alerta como visto" on public.alertas;
create policy "marcar alerta como visto" on public.alertas
  for update to authenticated
  using (owner_id = (select public.helpy_conta())
         and (owner_id = (select auth.uid()) or not public.helpy_aviso_do_dono(chave)))
  with check (owner_id = (select public.helpy_conta()));
