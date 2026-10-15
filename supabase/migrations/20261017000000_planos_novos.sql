-- ============================================================
-- Planos novos: teste grátis de 7 dias e total de mensagens no mês.
-- (Quem já está testando continua com a data que tinha.)
-- ============================================================

alter table public.profiles alter column trial_ends_at set default (now() + interval '7 days');

-- o painel mostra também as mensagens de clientes do mês, que agora têm limite por plano
create or replace function public.helpy_uso() returns jsonb
language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'atendimentos', (select count(*) from conversations
                      where owner_id = auth.uid() and not teste
                        and created_at >= date_trunc('month', now())),
    'mensagens', (select count(*) from conversation_messages m
                   join conversations c on c.id = m.conversation_id
                   where c.owner_id = auth.uid() and not c.teste and m.role = 'user'
                     and m.created_at >= date_trunc('month', now())),
    'tickets_abertos', (select count(*) from conversations
                         where owner_id = auth.uid() and not teste and status in ('waiting', 'human')),
    'assistentes', (select count(*) from assistants where owner_id = auth.uid()),
    'tabelas', (select count(*) from tabelas where owner_id = auth.uid()),
    'builder_msgs', (select count(*) from usage_events
                      where owner_id = auth.uid() and kind = 'builder'
                        and created_at >= date_trunc('month', now())),
    'custo_usd', (select coalesce(sum(cost_usd), 0) from usage_events
                   where owner_id = auth.uid() and created_at >= date_trunc('month', now()))
  );
$$;
