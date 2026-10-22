-- Login sem perfil (perfil apagado à mão no banco, por exemplo) não pode
-- travar o painel no aviso dos termos: aceitar cria o perfil que falta, com
-- os padrões de uma conta nova (teste grátis).
create or replace function public.helpy_aceitar_termos(p_versao text)
returns void
language sql security definer set search_path = public as $$
  insert into public.profiles (id, full_name, termos_versao, termos_aceitos_em)
  select u.id, nullif(coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name'), ''), left(p_versao, 20), now()
    from auth.users u
   where u.id = auth.uid()
  on conflict (id) do update
    set termos_versao = excluded.termos_versao, termos_aceitos_em = excluded.termos_aceitos_em;
$$;
revoke execute on function public.helpy_aceitar_termos(text) from public, anon;
grant execute on function public.helpy_aceitar_termos(text) to authenticated;
