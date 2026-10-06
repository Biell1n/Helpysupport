-- ============================================================
-- Helpy — contas mais seguras e chamado só com login
--
-- 1. Perfil: o navegador só edita nome, empresa e telefone. Plano,
--    créditos e teste ficam com o servidor (antes dava para apagar o
--    perfil e criar outro com o plano que quisesse).
-- 2. Verificação em duas etapas: quem ativou só lê e grava os
--    próprios dados depois de digitar o código (sessão aal2).
-- 3. Chamado: guarda quem abriu (o visitante precisa estar logado).
-- ============================================================

-- 1. perfil -------------------------------------------------------------
revoke insert, delete, update on public.profiles from authenticated;
grant update (full_name, company_name, phone) on public.profiles to authenticated;

alter table public.profiles drop constraint if exists profiles_tamanhos;
alter table public.profiles add constraint profiles_tamanhos check (
  char_length(coalesce(full_name, '')) <= 120
  and char_length(coalesce(company_name, '')) <= 120
  and char_length(coalesce(phone, '')) <= 40
) not valid;

-- 2. duas etapas --------------------------------------------------------
create or replace function public.helpy_mfa_ok() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
      or not exists (
        select 1 from auth.mfa_factors f
         where f.user_id = auth.uid() and f.status = 'verified'
      )
$$;
revoke execute on function public.helpy_mfa_ok() from public, anon;
grant execute on function public.helpy_mfa_ok() to authenticated;

do $$
declare t text;
begin
  foreach t in array array[
    'profiles', 'assistants', 'builder_sessions', 'conversations', 'conversation_messages',
    'tabelas', 'tabela_colunas', 'tabela_linhas', 'assistente_tabelas', 'assistant_gaps',
    'agenda_config', 'agendamentos', 'usage_events', 'relatorio_assuntos'
  ] loop
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = 'duas etapas') then
      execute format(
        'create policy "duas etapas" on public.%I as restrictive for all to authenticated
           using ((select public.helpy_mfa_ok())) with check ((select public.helpy_mfa_ok()))', t);
    end if;
  end loop;
end $$;

-- 3. chamado com login --------------------------------------------------
alter table public.conversations add column if not exists cliente_id uuid references auth.users(id) on delete set null;
alter table public.conversations add column if not exists cliente_email text;
create index if not exists conversations_recentes_idx on public.conversations (assistant_id, created_at) where not teste;
