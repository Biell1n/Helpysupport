-- ============================================================
-- Trava de custo: a cota de mensagens também conta pelo que a IA custou.
-- Cada US$ 0,002 gasto no atendimento vale uma mensagem. Conta comum (≈ US$ 0,0012
-- por mensagem) nem percebe; conta com respostas muito caras chega ao limite antes,
-- e nenhum plano dá prejuízo.
-- ============================================================
create index if not exists usage_events_dono_mes on public.usage_events (owner_id, created_at);

create or replace function public.helpy_uso_mes(p_owner uuid)
returns table(atendimentos bigint, mensagens bigint)
language sql
stable security definer
set search_path to 'public'
as $function$
  select
    greatest(
      coalesce((select u.atendimentos from uso_mensal u where u.owner_id = p_owner and u.mes = date_trunc('month', now())::date), 0),
      (select count(*) from conversations where owner_id = p_owner and not teste and created_at >= date_trunc('month', now()))
    ),
    greatest(
      coalesce((select u.mensagens from uso_mensal u where u.owner_id = p_owner and u.mes = date_trunc('month', now())::date), 0),
      (select count(*) from conversation_messages m join conversations c on c.id = m.conversation_id
        where c.owner_id = p_owner and not c.teste and m.role = 'user' and m.created_at >= date_trunc('month', now())),
      (select ceil(coalesce(sum(cost_usd), 0) / 0.002)::bigint from usage_events
        where owner_id = p_owner and kind = 'atendimento' and created_at >= date_trunc('month', now()))
    );
$function$;

create or replace function public.helpy_uso()
returns jsonb
language sql
stable
set search_path to 'public'
as $function$
  select jsonb_build_object(
    'atendimentos', greatest(
      coalesce((select u.atendimentos from uso_mensal u where u.owner_id = auth.uid() and u.mes = date_trunc('month', now())::date), 0),
      (select count(*) from conversations where owner_id = auth.uid() and not teste and created_at >= date_trunc('month', now()))),
    'mensagens', greatest(
      coalesce((select u.mensagens from uso_mensal u where u.owner_id = auth.uid() and u.mes = date_trunc('month', now())::date), 0),
      (select count(*) from conversation_messages m join conversations c on c.id = m.conversation_id
        where c.owner_id = auth.uid() and not c.teste and m.role = 'user' and m.created_at >= date_trunc('month', now())),
      (select ceil(coalesce(sum(cost_usd), 0) / 0.002)::bigint from usage_events
        where owner_id = auth.uid() and kind = 'atendimento' and created_at >= date_trunc('month', now()))),
    'tickets_abertos', (select count(*) from conversations
                         where owner_id = (select public.helpy_conta()) and not teste and status in ('waiting', 'human')),
    'assistentes', (select count(*) from assistants where owner_id = auth.uid()),
    'tabelas', (select count(*) from tabelas where owner_id = auth.uid()),
    'builder_msgs', (select greatest(count(*), ceil(coalesce(sum(cost_usd), 0) / 0.03)::bigint) from usage_events
                      where owner_id = auth.uid() and kind = 'builder'
                        and created_at >= date_trunc('month', now())),
    'custo_usd', (select coalesce(sum(cost_usd), 0) from usage_events
                   where owner_id = auth.uid() and created_at >= date_trunc('month', now()))
  );
$function$;
