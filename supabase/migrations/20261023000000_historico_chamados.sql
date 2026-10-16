-- ============================================================
-- Histórico do chamado: cada passo fica registrado sozinho, venha de
-- onde vier (painel, quadro, Discord ou o próprio assistente):
--   aberto      → o assistente passou para a equipe (com o motivo)
--   assumido    → alguém da equipe entrou
--   devolvido   → voltou para o assistente
--   encerrado   → por quem (equipe, cliente, assistente)
--   reaberto    → voltou depois de encerrado
-- Só a empresa vê; o cliente não.
-- ============================================================

create table if not exists public.conversa_eventos (
  id bigint generated always as identity primary key,
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  tipo text not null check (tipo in ('aberto', 'assumido', 'devolvido', 'encerrado', 'reaberto')),
  quem text check (char_length(quem) <= 120),
  detalhe text check (char_length(detalhe) <= 300),
  criado_em timestamptz not null default now()
);

create index if not exists conversa_eventos_conversa on public.conversa_eventos (conversation_id, criado_em);

alter table public.conversa_eventos enable row level security;

create policy "eventos da conta" on public.conversa_eventos
  for select to authenticated
  using (owner_id = (select public.helpy_conta()));

create policy "duas etapas" on public.conversa_eventos as restrictive for all to authenticated
  using ((select public.helpy_mfa_ok())) with check ((select public.helpy_mfa_ok()));

revoke all on public.conversa_eventos from anon, authenticated;
grant select on public.conversa_eventos to authenticated;

-- quem mudou: a pessoa logada no painel; sem login (assistente, Discord), o
-- nome que veio na própria conversa
create or replace function public.helpy_conversa_evento() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  logado text;
  tipo text;
  quem text;
  detalhe text;
begin
  if new.status is not distinct from old.status
     and not (new.status = 'human' and new.assumido_nome is distinct from old.assumido_nome) then
    return new;
  end if;

  if auth.uid() is not null then
    select coalesce(nullif(trim(full_name), ''), 'Alguém da equipe') into logado from public.profiles where id = auth.uid();
  end if;

  if old.status = 'closed' and new.status <> 'closed' then
    tipo := 'reaberto';
    quem := coalesce(logado, 'Cliente (voltou a escrever)');
  elsif new.status = 'waiting' and old.status = 'bot' then
    tipo := 'aberto';
    quem := coalesce(logado, 'Assistente');
    detalhe := nullif(coalesce(new.motivo, new.titulo), '');
  elsif new.status = 'human' then
    tipo := 'assumido';
    quem := coalesce(new.assumido_nome, logado);
  elsif new.status = 'bot' then
    tipo := 'devolvido';
    quem := coalesce(logado, old.assumido_nome);
  elsif new.status = 'closed' then
    tipo := 'encerrado';
    quem := case
      when new.encerrado_por = 'cliente' then 'Cliente'
      when new.encerrado_por = 'assistente' then 'Assistente'
      else coalesce(logado, old.assumido_nome, 'Equipe')
    end;
  else
    return new;
  end if;

  insert into public.conversa_eventos (conversation_id, owner_id, tipo, quem, detalhe)
  values (new.id, new.owner_id, tipo, left(quem, 120), left(detalhe, 300));
  return new;
end $$;

drop trigger if exists conversations_evento on public.conversations;
create trigger conversations_evento after update of status, assumido_nome on public.conversations
  for each row execute function public.helpy_conversa_evento();
