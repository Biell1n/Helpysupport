-- Duas conversas ao mesmo tempo não podem pegar o mesmo horário nem a mesma
-- última unidade do estoque.

-- Agenda: o horário marcado pelo assistente é conferido de novo no banco, com
-- uma trava por empresa (o painel pode sobrepor horários de propósito, o
-- assistente não).
create or replace function public.helpy_horario_livre()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.origem <> 'assistente' or new.status not in ('confirmado', 'pendente', 'aguardando_pagamento') then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.inicio = old.inicio and new.fim = old.fim then
    return new;
  end if;
  perform pg_advisory_xact_lock(hashtext('agenda:' || new.owner_id::text));
  if exists (
    select 1 from public.agendamentos a
     where a.owner_id = new.owner_id and a.id <> new.id
       and a.inicio < new.fim and a.fim > new.inicio
       and (a.status in ('confirmado', 'pendente') or (a.status = 'aguardando_pagamento' and a.reserva_ate > now()))
  ) then
    raise exception 'horario_ocupado' using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke execute on function public.helpy_horario_livre() from public, anon, authenticated;
drop trigger if exists agendamentos_horario_livre on public.agendamentos;
create trigger agendamentos_horario_livre before insert or update of inicio, fim on public.agendamentos
  for each row execute function public.helpy_horario_livre();

-- Estoque: a baixa é feita numa conta só no banco (ler e gravar separado
-- perdia uma das vendas quando dois pagamentos caíam juntos). Devolve quanto
-- havia antes, para avisar a equipe se vendeu mais do que tinha.
create or replace function public.helpy_baixar_estoque(p_linha uuid, p_chave text, p_qtd numeric)
returns numeric
language plpgsql security definer set search_path = public as $$
declare
  antes numeric;
begin
  select replace(trim(dados ->> p_chave), ',', '.')::numeric into antes
    from public.tabela_linhas
   where id = p_linha and trim(dados ->> p_chave) ~ '^-?[0-9]+([.,][0-9]+)?$'
   for update;
  if antes is null then
    return null;
  end if;
  update public.tabela_linhas
     set dados = jsonb_set(dados, array[p_chave], to_jsonb(greatest(0, antes - p_qtd)::text))
   where id = p_linha;
  return antes;
end $$;
revoke execute on function public.helpy_baixar_estoque(uuid, text, numeric) from public, anon, authenticated;
grant execute on function public.helpy_baixar_estoque(uuid, text, numeric) to service_role;
