-- Números do WhatsApp esperando a análise da Meta: a cada 30 minutos o Helpy confere
-- e ativa sozinho os que foram aprovados (o dono não precisa clicar em "Testar conexão").
create extension if not exists pg_net;

select cron.unschedule(jobid) from cron.job where jobname = 'helpy-meta-pendentes';
select cron.schedule(
  'helpy-meta-pendentes',
  '*/30 * * * *',
  $$select net.http_post(
      url := 'https://cdscurcwcyzeagincjdv.supabase.co/functions/v1/public-chat?pendentes=1',
      body := '{}'::jsonb,
      headers := '{"Content-Type": "application/json"}'::jsonb
    )$$
);
