-- ============================================================
-- Canais: o mesmo assistente atendendo no WhatsApp, no Instagram e
-- no Discord, além do link do chat.
--
-- Cada canal pertence a um assistente. O token de acesso (WhatsApp,
-- Instagram) ou do bot (Discord) fica no Vault; a tabela guarda só o id
-- do segredo. Só as funções do servidor criam, mudam e leem segredos.
-- ============================================================

create table public.canais (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  assistant_id uuid not null references public.assistants (id) on delete cascade,
  tipo text not null check (tipo in ('whatsapp', 'instagram', 'discord')),
  status text not null default 'pendente' check (status in ('pendente', 'ativo', 'erro', 'pausado')),
  -- o que aparece no painel: número, @perfil, nome do bot
  nome text check (char_length(nome) <= 120),
  -- identificador do lado do serviço: phone_number_id (WhatsApp),
  -- id da conta profissional (Instagram), application_id (Discord)
  externo_id text not null check (char_length(externo_id) between 1 and 80),
  -- dados públicos da conexão (ex.: chave pública do Discord, id da conta de negócios)
  config jsonb not null default '{}'::jsonb,
  segredo uuid,
  -- token que o Helpy gera para a Meta confirmar o endereço do webhook
  verificar_token text not null default encode(extensions.gen_random_bytes(18), 'hex'),
  ultimo_evento_em timestamptz,
  erro text check (char_length(erro) <= 500),
  criado_em timestamptz not null default now(),
  unique (tipo, externo_id)
);

create index canais_conta on public.canais (owner_id);

alter table public.canais enable row level security;

create policy "canais da conta" on public.canais
  for select to authenticated
  using (owner_id = (select public.helpy_conta()));

create policy "duas etapas" on public.canais as restrictive for all to authenticated
  using ((select public.helpy_mfa_ok())) with check ((select public.helpy_mfa_ok()));

revoke all on public.canais from anon;
revoke all on public.canais from authenticated;
grant select (id, owner_id, assistant_id, tipo, status, nome, externo_id, config, verificar_token, ultimo_evento_em, erro, criado_em)
  on public.canais to authenticated;

-- segredo: só o servidor grava e lê ---------------------------------------
create or replace function public.helpy_canal_guardar_segredo(p_canal uuid, p_valor text) returns void
language plpgsql security definer set search_path = public, vault as $$
declare
  atual uuid;
begin
  select segredo into atual from public.canais where id = p_canal;
  if atual is null then
    update public.canais
       set segredo = vault.create_secret(p_valor, 'helpy_canal_' || p_canal::text, 'Token do canal ' || p_canal::text)
     where id = p_canal;
  else
    perform vault.update_secret(atual, p_valor);
  end if;
end $$;

create or replace function public.helpy_canal_segredo(p_canal uuid) returns text
language sql stable security definer set search_path = public, vault as $$
  select s.decrypted_secret
    from public.canais c
    join vault.decrypted_secrets s on s.id = c.segredo
   where c.id = p_canal
$$;

create or replace function public.helpy_canal_apaga_segredo() returns trigger
language plpgsql security definer set search_path = public, vault as $$
begin
  if old.segredo is not null then
    delete from vault.secrets where id = old.segredo;
  end if;
  return old;
end $$;

create trigger canais_apaga_segredo after delete on public.canais
  for each row execute function public.helpy_canal_apaga_segredo();

revoke execute on function public.helpy_canal_guardar_segredo(uuid, text) from public, anon, authenticated;
revoke execute on function public.helpy_canal_segredo(uuid) from public, anon, authenticated;
revoke execute on function public.helpy_canal_apaga_segredo() from public, anon, authenticated;
grant execute on function public.helpy_canal_guardar_segredo(uuid, text) to service_role;
grant execute on function public.helpy_canal_segredo(uuid) to service_role;

-- conversas que chegam por um canal --------------------------------------
alter table public.conversations add column if not exists canal_id uuid references public.canais (id) on delete set null;
alter table public.conversations add column if not exists contato_externo text check (char_length(contato_externo) <= 120);
create index if not exists conversations_canal on public.conversations (canal_id, contato_externo, last_message_at desc)
  where canal_id is not null;
