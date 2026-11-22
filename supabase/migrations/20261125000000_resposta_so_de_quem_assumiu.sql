-- Conversa assumida por alguém da equipe: só essa pessoa responde (as outras precisam
-- "assumir no lugar" antes). Vale para quem entra pelo painel; o servidor (canais, assistente) não passa por aqui.
create or replace function public.helpy_resposta_de_quem_assumiu()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.role <> 'agent' or auth.uid() is null then
    return new;
  end if;
  if exists (
    select 1 from public.conversations c
     where c.id = new.conversation_id and c.status = 'human'
       and c.assumido_por is not null and c.assumido_por <> auth.uid()
  ) then
    raise exception 'conversa_de_outro' using errcode = 'P0001';
  end if;
  return new;
end $function$;

revoke execute on function public.helpy_resposta_de_quem_assumiu() from public, anon, authenticated;

create trigger resposta_de_quem_assumiu
  before insert on public.conversation_messages
  for each row execute function public.helpy_resposta_de_quem_assumiu();
