-- ============================================================
-- Helpy — endurecimento de segurança
--
-- 1. Visitante sem login (anon) não escreve em nada: o chat público
--    passa pela função public-chat, que usa a chave de serviço.
-- 2. Chave de API de sistema (TOTVS, SAP…) sai do texto puro e vai
--    para o Supabase Vault (criptografada). A tabela guarda só o id.
-- 3. Storage herdado do Horizons: fechado. Só os vídeos da landing
--    antiga continuam com leitura pública.
-- 4. IP do visitante (só o hash) para limitar abuso no chat público.
-- ============================================================

-- 1. anon -------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'agenda_config', 'agendamentos', 'assistant_gaps', 'assistants', 'assistente_tabelas',
    'builder_sessions', 'conversation_messages', 'conversations', 'profiles',
    'relatorio_assuntos', 'tabela_colunas', 'tabela_linhas', 'tabelas', 'usage_events'
  ] loop
    execute format('revoke all on public.%I from anon', t);
    -- ninguém logado precisa de TRUNCATE/TRIGGER/REFERENCES
    execute format('revoke truncate, trigger, references on public.%I from authenticated', t);
  end loop;
end $$;

alter table legado.helpy_teste_fk enable row level security;
alter table legado.helpy_teste_sem_fk enable row level security;

-- 2. segredo da API no Vault ----------------------------------------
alter table public.tabelas add column if not exists api_segredo uuid;

create or replace function public.helpy_tabelas_segredo() returns trigger
language plpgsql security definer set search_path = public, vault as $$
declare
  valor text;
begin
  -- o id do segredo só é mexido aqui dentro, nunca pelo navegador
  if tg_op = 'INSERT' then
    new.api_segredo := null;
  else
    new.api_segredo := old.api_segredo;
  end if;

  valor := nullif(btrim(coalesce(new.api_config ->> 'header_valor', '')), '');
  if valor is not null then
    if new.api_segredo is null then
      new.api_segredo := vault.create_secret(valor, 'helpy_api_' || new.id::text, 'Cabeçalho da API da tabela ' || new.id::text);
    else
      perform vault.update_secret(new.api_segredo, valor);
    end if;
  end if;
  if new.api_config is not null and new.api_config ? 'header_valor' then
    new.api_config := (new.api_config - 'header_valor')
      || jsonb_build_object('header_guardado', new.api_segredo is not null);
  end if;
  return new;
end $$;

drop trigger if exists tabelas_segredo on public.tabelas;
create trigger tabelas_segredo before insert or update on public.tabelas
  for each row execute function public.helpy_tabelas_segredo();

create or replace function public.helpy_tabelas_segredo_apaga() returns trigger
language plpgsql security definer set search_path = public, vault as $$
begin
  if old.api_segredo is not null then
    delete from vault.secrets where id = old.api_segredo;
  end if;
  return old;
end $$;

drop trigger if exists tabelas_segredo_apaga on public.tabelas;
create trigger tabelas_segredo_apaga after delete on public.tabelas
  for each row execute function public.helpy_tabelas_segredo_apaga();

-- só as funções do servidor (service_role) leem o valor
create or replace function public.helpy_segredo_api(p_tabela uuid) returns text
language sql stable security definer set search_path = public, vault as $$
  select s.decrypted_secret
    from public.tabelas t
    join vault.decrypted_secrets s on s.id = t.api_segredo
   where t.id = p_tabela
$$;

revoke execute on function public.helpy_tabelas_segredo() from public, anon, authenticated;
revoke execute on function public.helpy_tabelas_segredo_apaga() from public, anon, authenticated;
revoke execute on function public.helpy_segredo_api(uuid) from public, anon, authenticated;
grant execute on function public.helpy_segredo_api(uuid) to service_role;

-- o que já estava salvo em texto puro passa pelo gatilho e vai para o Vault
update public.tabelas set api_config = api_config where api_config ? 'header_valor';

-- 3. storage herdado ---------------------------------------------------
update storage.buckets set public = false
 where id in ('profile-photos', 'assistant-photos', 'assistant-knowledge');

alter policy "Public 1uja572_0" on storage.objects using (false);
alter policy "Public Access Profile Photos" on storage.objects using (false);
alter policy "Public Access Assistant Photos" on storage.objects using (false);
alter policy "Public read access for knowledge documents" on storage.objects using (false);
alter policy "Users can upload profile photos" on storage.objects with check (false);
alter policy "Users can upload assistant photos" on storage.objects with check (false);
alter policy "Authenticated users can upload knowledge documents" on storage.objects with check (false);
alter policy "Users can update profile photos" on storage.objects using (false);
alter policy "Users can update their own knowledge documents" on storage.objects using (false);
alter policy "Users can delete profile photos" on storage.objects using (false);
alter policy "Users can delete their own knowledge documents" on storage.objects using (false);

-- 4. limite por IP no chat público ------------------------------------
alter table public.conversations add column if not exists ip_hash text;
create index if not exists conversations_ip_hash_idx on public.conversations (ip_hash, created_at) where ip_hash is not null;
