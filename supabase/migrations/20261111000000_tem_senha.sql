-- ============================================================
-- A conta tem senha? Quem entrou pelo Google e criou uma senha depois
-- continua com providers = ["google"]: a lista de provedores não serve para
-- saber. Só o próprio usuário (ou o servidor) pode perguntar.
-- ============================================================
create or replace function public.helpy_tem_senha(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(u.encrypted_password, '') <> ''
  from auth.users u
  where u.id = p_user
    and (p_user = (select auth.uid()) or (select auth.role()) = 'service_role');
$$;

revoke execute on function public.helpy_tem_senha(uuid) from public, anon;
grant execute on function public.helpy_tem_senha(uuid) to authenticated, service_role;
