-- Custos que não são atendimento real deixam de gastar a cota do cliente,
-- a vigia olha a leitura dos tickets do Discord (o bot antigo foi desligado),
-- o histórico das rotinas automáticas para de crescer sem limite,
-- e alguns ajustes de índice e de permissão.

-- 1) tipos de custo: teste (modo Testar do dono) e interno (resumo, anexos, relatórios, suporte, aprendizado)
alter table public.usage_events drop constraint if exists usage_events_kind_check;
alter table public.usage_events add constraint usage_events_kind_check
  check (kind in ('builder', 'atendimento', 'teste', 'interno'));

-- 2) vigia: avisa a equipe do Helpy quando a leitura dos tickets do Discord para
create or replace function public.helpy_vigiar_servicos() returns void
language plpgsql security definer set search_path = public as $$
declare
  s record;
  hora text := to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM-DD"T"HH24');
begin
  for s in
    select nome, visto_em from helpy_servicos
     where nome in ('discord-sondagem')
       and visto_em < now() - interval '10 minutes'
       and visto_em > now() - interval '24 hours'
  loop
    insert into alertas (owner_id, origem, chave, assunto, detalhe)
    select e.user_id, 'sistema', 'servico:' || s.nome || ':' || hora,
           'A leitura dos tickets do Discord parou',
           'Sem sinal desde ' || to_char(s.visto_em at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI') ||
           '. Mensagens escritas nos tickets podem não chegar ao painel. Confira a rotina helpy-discord-sondagem.'
      from helpy_equipe e
     where not exists (select 1 from alertas a where a.owner_id = e.user_id and a.chave = 'servico:' || s.nome || ':' || hora);
  end loop;
end;
$$;
revoke execute on function public.helpy_vigiar_servicos() from public, anon, authenticated;

-- 3) histórico das rotinas automáticas: guarda só os últimos 7 dias
select cron.unschedule(jobid) from cron.job where jobname = 'helpy-limpar-historico';
select cron.schedule('helpy-limpar-historico', '17 6 * * *',
  $$delete from cron.job_run_details where end_time < now() - interval '7 days'$$);

-- 4) índices que faltavam
create index if not exists alertas_conversa on public.alertas (conversation_id);
create index if not exists pedidos_agendamento on public.pedidos (agendamento_id);
create index if not exists agendamentos_conversa on public.agendamentos (conversation_id);
create index if not exists aprendizados_dono on public.aprendizados (owner_id);

-- 5) permissões que sobravam para quem não entrou (o RLS já bloqueava; aqui só arruma)
revoke all on public.suporte_chamados, public.suporte_mensagens, public.helpy_equipe, public.bloqueios from anon;
