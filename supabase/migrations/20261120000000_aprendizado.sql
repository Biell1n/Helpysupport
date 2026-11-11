-- ============================================================
-- O assistente aprende com a equipe.
--
-- 1. Aprendizados: quando um atendimento que a equipe respondeu termina, o Helpy
--    tira dele o que serve para os próximos clientes (regra, política, procedimento)
--    e o assistente passa a responder isso sozinho. O dono vê, corrige e apaga.
-- 2. Modo aprendiz: o assistente fica só observando. A equipe atende tudo e ele
--    aprende; quando o dono quiser, ativa.
-- ============================================================

alter table public.assistants add column if not exists modo text not null default 'ativo'
  check (modo in ('ativo', 'aprendiz'));

-- conversa atendida com o assistente em modo aprendiz (as mensagens dela não gastam a cota de IA)
alter table public.conversations add column if not exists aprendiz boolean not null default false;
-- quando o Helpy já leu este atendimento para aprender (uma vez só)
alter table public.conversations add column if not exists aprendido_em timestamptz;
create index if not exists conversations_para_aprender on public.conversations (fechado_em)
  where status = 'closed' and aprendido_em is null;

create table if not exists public.aprendizados (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  assistant_id uuid not null references public.assistants (id) on delete cascade,
  conversation_id uuid references public.conversations (id) on delete set null,
  pergunta text not null check (char_length(pergunta) between 3 and 300),
  resposta text not null check (char_length(resposta) between 2 and 1200),
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);
create index if not exists aprendizados_do_assistente on public.aprendizados (assistant_id, criado_em);

alter table public.aprendizados enable row level security;
revoke all on public.aprendizados from anon, authenticated;
grant select, delete on public.aprendizados to authenticated;
grant update (pergunta, resposta, ativo) on public.aprendizados to authenticated;

drop policy if exists "aprendizados da conta" on public.aprendizados;
create policy "aprendizados da conta" on public.aprendizados for select to authenticated
  using (owner_id = (select public.helpy_conta()));
drop policy if exists "dono corrige o aprendizado" on public.aprendizados;
create policy "dono corrige o aprendizado" on public.aprendizados for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
drop policy if exists "dono apaga o aprendizado" on public.aprendizados;
create policy "dono apaga o aprendizado" on public.aprendizados for delete to authenticated
  using (owner_id = (select auth.uid()));
drop policy if exists "duas etapas" on public.aprendizados;
create policy "duas etapas" on public.aprendizados as restrictive for all to authenticated
  using ((select public.helpy_mfa_ok())) with check ((select public.helpy_mfa_ok()));

-- ------------------------------------------------------------
-- Cota: mensagem de conversa em modo aprendiz não conta (a IA não respondeu nada)
-- ------------------------------------------------------------
create or replace function public.helpy_contar_mensagem() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  c record;
begin
  if new.role <> 'user' then return null; end if;
  select owner_id, teste, aprendiz into c from conversations where id = new.conversation_id;
  if found and not c.teste and not c.aprendiz then perform helpy_somar_uso(c.owner_id, new.created_at, 0, 1); end if;
  return null;
end;
$$;

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
        where c.owner_id = p_owner and not c.teste and not c.aprendiz and m.role = 'user' and m.created_at >= date_trunc('month', now())),
      (select ceil(coalesce(sum(cost_usd), 0) / 0.0015)::bigint from usage_events
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
        where c.owner_id = auth.uid() and not c.teste and not c.aprendiz and m.role = 'user' and m.created_at >= date_trunc('month', now())),
      (select ceil(coalesce(sum(cost_usd), 0) / 0.0015)::bigint from usage_events
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
