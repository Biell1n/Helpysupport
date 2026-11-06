-- ============================================================
-- Agenda: intervalo entre atendimentos (limpeza, descanso) e quantos atendem
-- ao mesmo tempo (profissionais, cadeiras, salas).
-- ============================================================
alter table public.agenda_config add column if not exists intervalo_min integer not null default 0 check (intervalo_min between 0 and 120);
alter table public.agenda_config add column if not exists vagas integer not null default 1 check (vagas between 1 and 20);

-- a trava contra horário duplicado passa a contar o intervalo e as vagas:
-- só recusa quando todos os profissionais já estão ocupados naquele horário
create or replace function public.helpy_horario_livre()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_iv interval;
  v_vagas integer;
begin
  if new.origem <> 'assistente' or new.status not in ('confirmado', 'pendente', 'aguardando_pagamento') then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.inicio = old.inicio and new.fim = old.fim then
    return new;
  end if;
  perform pg_advisory_xact_lock(hashtext('agenda:' || new.owner_id::text));
  select make_interval(mins => coalesce(c.intervalo_min, 0)), greatest(coalesce(c.vagas, 1), 1)
    into v_iv, v_vagas
    from public.agenda_config c where c.owner_id = new.owner_id;
  v_iv := coalesce(v_iv, interval '0');
  v_vagas := coalesce(v_vagas, 1);
  if (
    select count(*) from public.agendamentos a
     where a.owner_id = new.owner_id and a.id <> new.id
       and a.inicio < new.fim + v_iv and a.fim + v_iv > new.inicio
       and (a.status in ('confirmado', 'pendente') or (a.status = 'aguardando_pagamento' and a.reserva_ate > now()))
  ) >= v_vagas then
    raise exception 'horario_ocupado' using errcode = 'P0001';
  end if;
  return new;
end $function$;
