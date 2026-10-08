-- ============================================================
-- Helpy — histórico do rascunho (desfazer)
--
-- Cada mudança no rascunho guarda a versão anterior em `historico`,
-- venha ela da IA ou de quem digita no formulário. Digitação seguida
-- (menos de 5 s entre gravações) vira uma versão só.
-- Quem grava `historico` de propósito (o desfazer) não gera versão nova.
-- ============================================================

alter table public.builder_sessions add column if not exists historico jsonb not null default '[]';

create or replace function public.helpy_builder_historico() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  ultima timestamptz;
begin
  if new.historico is distinct from old.historico then
    return new; -- o desfazer cuida do histórico
  end if;
  if new.config is not distinct from old.config and new.meta is not distinct from old.meta then
    return new;
  end if;
  ultima := nullif(old.historico -> 0 ->> 'em', '')::timestamptz;
  if ultima is not null and now() - ultima < interval '5 seconds' then
    return new; -- ainda é a mesma digitação
  end if;
  new.historico := (
    select coalesce(jsonb_agg(v order by i), '[]'::jsonb)
      from jsonb_array_elements(
             jsonb_build_array(jsonb_build_object('em', now(), 'config', old.config, 'meta', old.meta))
             || coalesce(old.historico, '[]'::jsonb)
           ) with ordinality as e(v, i)
     where i <= 30
  );
  return new;
end $$;

drop trigger if exists builder_sessions_historico on public.builder_sessions;
create trigger builder_sessions_historico before update on public.builder_sessions
  for each row execute function public.helpy_builder_historico();

revoke execute on function public.helpy_builder_historico() from public, anon, authenticated;
