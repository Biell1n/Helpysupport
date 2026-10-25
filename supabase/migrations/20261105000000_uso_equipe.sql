-- O contador de chamados abertos do menu vale para a equipe também:
-- o funcionário conta os chamados da empresa (helpy_conta), não os próprios.
create or replace function public.helpy_uso() returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object(
    'atendimentos', (select count(*) from conversations
                      where owner_id = auth.uid() and not teste
                        and created_at >= date_trunc('month', now())),
    'mensagens', (select count(*) from conversation_messages m
                   join conversations c on c.id = m.conversation_id
                   where c.owner_id = auth.uid() and not c.teste and m.role = 'user'
                     and m.created_at >= date_trunc('month', now())),
    'tickets_abertos', (select count(*) from conversations
                         where owner_id = (select public.helpy_conta()) and not teste and status in ('waiting', 'human')),
    'assistentes', (select count(*) from assistants where owner_id = auth.uid()),
    'tabelas', (select count(*) from tabelas where owner_id = auth.uid()),
    'builder_msgs', (select count(*) from usage_events
                      where owner_id = auth.uid() and kind = 'builder'
                        and created_at >= date_trunc('month', now())),
    'custo_usd', (select coalesce(sum(cost_usd), 0) from usage_events
                   where owner_id = auth.uid() and created_at >= date_trunc('month', now()))
  );
$$;
revoke execute on function public.helpy_uso() from public, anon;
grant execute on function public.helpy_uso() to authenticated;

-- O teto do uso extra é escolhido pelo dono, mas tem limite: ninguém acumula
-- uma conta de milhares de reais sem perceber (nem passa por cima da cobrança).
alter table public.profiles drop constraint if exists profiles_extra_limite_teto;
alter table public.profiles add constraint profiles_extra_limite_teto check (extra_limite >= 0 and extra_limite <= 3000);
