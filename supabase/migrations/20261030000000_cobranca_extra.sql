-- Cobrança do uso extra e das vagas de equipe.
--
-- O uso extra de cada mês vira uma fatura separada no começo do mês seguinte
-- (ou na hora, se a assinatura for cancelada). Contas isentas (as de teste
-- da casa) registram o uso, mas nunca recebem fatura.

alter table public.uso_extra
  add column if not exists status text not null default 'aberto'
    check (status in ('aberto', 'cobrando', 'cobrado', 'pago', 'atrasado', 'isento', 'perdoado')),
  add column if not exists fatura_id text,
  add column if not exists cobrado_em timestamptz;
create index if not exists uso_extra_fatura on public.uso_extra (fatura_id) where fatura_id is not null;

-- Só o servidor marca uma conta como isenta (o painel não tem permissão nessa coluna).
alter table public.profiles add column if not exists cobranca_isenta boolean not null default false;

-- O uso extra só soma no mês ainda aberto, com a assinatura de pé e sem fatura
-- de uso extra atrasada.
create or replace function public.helpy_usar_extra(p_owner uuid, p_tipo text, p_valor numeric, p_limite numeric)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_mes date := date_trunc('month', now() at time zone 'utc')::date;
  v_ok boolean;
begin
  if p_tipo not in ('atendimento', 'mensagem') or p_valor <= 0 then
    return false;
  end if;
  if exists (select 1 from public.uso_extra where owner_id = p_owner and status = 'atrasado')
     or exists (select 1 from public.assinaturas where owner_id = p_owner and status = 'cancelada') then
    return false;
  end if;
  insert into public.uso_extra (owner_id, mes) values (p_owner, v_mes) on conflict do nothing;
  update public.uso_extra
     set valor = valor + p_valor,
         atendimentos = atendimentos + (p_tipo = 'atendimento')::int,
         mensagens = mensagens + (p_tipo = 'mensagem')::int,
         atualizado_em = now()
   where owner_id = p_owner and mes = v_mes and status = 'aberto' and valor + p_valor <= p_limite
  returning true into v_ok;
  return coalesce(v_ok, false);
end $$;

revoke execute on function public.helpy_usar_extra(uuid, text, numeric, numeric) from public, anon, authenticated;
grant execute on function public.helpy_usar_extra(uuid, text, numeric, numeric) to service_role;
