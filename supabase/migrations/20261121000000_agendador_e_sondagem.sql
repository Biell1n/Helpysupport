-- ============================================================
-- Agendador com senha e leitura dos tickets do Discord sem servidor.
--
-- 1. As rodadas automáticas (aprender com os atendimentos, conferir a Meta, ler o Discord)
--    passam a exigir uma senha que só o banco conhece (fica no cofre): de fora ninguém dispara.
-- 2. Discord: o Helpy lê as mensagens dos tickets abertos sozinho, de poucos em poucos
--    segundos, no lugar do programa que precisava ficar ligado num servidor.
-- 3. Aperto de permissões: papéis do site não precisam de TRUNCATE, REFERENCES nem TRIGGER.
-- ============================================================

-- senha do agendador (criada uma vez; não aparece em lugar nenhum fora do cofre)
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'helpy_agendador') then
    perform vault.create_secret(
      replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
      'helpy_agendador',
      'Senha que o agendador do banco manda para as rodadas automáticas do Helpy'
    );
  end if;
end $$;

create or replace function public.helpy_agendador_ok(p_senha text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from vault.decrypted_secrets s
     where s.name = 'helpy_agendador' and s.decrypted_secret = p_senha
  );
$$;
revoke execute on function public.helpy_agendador_ok(text) from public, anon, authenticated;
grant execute on function public.helpy_agendador_ok(text) to service_role;

-- chama uma rodada da função, com a senha
create or replace function public.helpy_chamar_rodada(p_rota text) returns bigint
language sql security definer set search_path = '' as $$
  select net.http_post(
    url := 'https://cdscurcwcyzeagincjdv.supabase.co/functions/v1/public-chat?' || p_rota,
    body := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Helpy-Agendador', (select s.decrypted_secret from vault.decrypted_secrets s where s.name = 'helpy_agendador')
    )
  );
$$;
revoke execute on function public.helpy_chamar_rodada(text) from public, anon, authenticated;

-- ------------------------------------------------------------
-- Discord: até onde cada ticket já foi lido
-- ------------------------------------------------------------
alter table public.discord_tickets add column if not exists lido_ate text;
alter table public.discord_tickets add column if not exists ativo_em timestamptz;
-- tickets que já existiam: a leitura começa de agora (não responde de novo o que é antigo)
update public.discord_tickets
   set lido_ate = ((((extract(epoch from now()) * 1000)::bigint - 1420070400000) << 22))::text
 where lido_ate is null;

insert into public.helpy_servicos (nome, visto_em, info)
values ('discord-sondagem', now(), '{}'::jsonb)
on conflict (nome) do nothing;

-- ------------------------------------------------------------
-- Agenda das rodadas (só chamam a função quando há o que fazer)
-- ------------------------------------------------------------
select cron.unschedule(jobid) from cron.job where jobname in ('helpy-discord-sondagem', 'helpy-aprender', 'helpy-meta-pendentes');

-- tickets do Discord: todo minuto enquanto houver ticket aberto com conversa na última semana
-- (os mais antigos, de 10 em 10 minutos)
select cron.schedule('helpy-discord-sondagem', '* * * * *', $$
  select public.helpy_chamar_rodada('discord=sondar')
   where exists (
     select 1 from public.discord_tickets t
      where t.fechado_em is null
        and (coalesce(t.ativo_em, t.criado_em) > now() - interval '7 days' or extract(minute from now())::int % 10 = 0)
   )
$$);

-- atendimentos da equipe que terminaram: o assistente aprende com eles
select cron.schedule('helpy-aprender', '*/5 * * * *', $$
  select public.helpy_chamar_rodada('aprender=1')
   where exists (
     select 1 from public.conversations c
      where c.status = 'closed' and c.aprendido_em is null and not c.teste
        and c.fechado_em < now() - interval '3 minutes' and c.fechado_em > now() - interval '7 days'
   )
$$);

-- números do WhatsApp esperando a Meta
select cron.schedule('helpy-meta-pendentes', '*/30 * * * *', $$
  select public.helpy_chamar_rodada('pendentes=1')
   where exists (select 1 from public.canais c where c.tipo = 'whatsapp' and c.status = 'pendente')
$$);

-- ------------------------------------------------------------
-- Permissões que o site nunca usa
-- ------------------------------------------------------------
revoke truncate, references, trigger on all tables in schema public from anon, authenticated;
