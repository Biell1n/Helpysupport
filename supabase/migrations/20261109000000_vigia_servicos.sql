-- ============================================================
-- Vigia dos serviços fora do Supabase (hoje: o bot do Discord no servidor).
--
-- O bot grava "estou vivo" em helpy_servicos a cada minuto. A cada 5 minutos
-- o banco confere: se ele estava no ar nas últimas 24 h e parou há mais de
-- 10 minutos, a equipe Helpy recebe um aviso no sino (no máximo um por hora).
-- Bot que nunca foi publicado (ou está parado há mais de um dia) não apita.
-- ============================================================

create extension if not exists pg_cron;

create or replace function public.helpy_vigiar_servicos() returns void
language plpgsql security definer set search_path = public as $$
declare
  s record;
  hora text := to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM-DD"T"HH24');
begin
  for s in
    -- a tabela também guarda marcadores (ex.: webhook do Asaas): só os que mandam sinal de vida
    select nome, visto_em from helpy_servicos
     where nome in ('discord-gateway')
       and visto_em < now() - interval '10 minutes'
       and visto_em > now() - interval '24 hours'
  loop
    insert into alertas (owner_id, origem, chave, assunto, detalhe)
    select e.user_id, 'sistema', 'servico:' || s.nome || ':' || hora,
           case s.nome when 'discord-gateway' then 'O bot do Discord caiu' else 'Serviço parado: ' || s.nome end,
           'Sem sinal desde ' || to_char(s.visto_em at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI') ||
           '. No servidor: sudo systemctl status helpy-gateway (e sudo systemctl restart helpy-gateway para religar).'
      from helpy_equipe e
     where not exists (select 1 from alertas a where a.owner_id = e.user_id and a.chave = 'servico:' || s.nome || ':' || hora);
  end loop;
end;
$$;
revoke execute on function public.helpy_vigiar_servicos() from public, anon, authenticated;

select cron.unschedule(jobid) from cron.job where jobname = 'helpy-vigia-servicos';
select cron.schedule('helpy-vigia-servicos', '*/5 * * * *', 'select public.helpy_vigiar_servicos()');
