-- Atendimento reaberto volta para a fila do aprendizado: quando ele for encerrado de novo,
-- o Helpy lê outra vez (o que a equipe respondeu depois de reabrir também é aprendido).
create or replace function public.helpy_reabrir_aprendizado() returns trigger
language plpgsql set search_path = public as $$
begin
  if old.status = 'closed' and new.status <> 'closed' and new.aprendido_em is not null then
    new.aprendido_em := null;
  end if;
  return new;
end;
$$;

drop trigger if exists helpy_reabrir_aprendizado on public.conversations;
create trigger helpy_reabrir_aprendizado before update of status on public.conversations
  for each row execute function public.helpy_reabrir_aprendizado();
