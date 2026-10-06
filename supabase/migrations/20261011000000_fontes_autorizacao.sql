-- Quando o dono autorizou a leitura de uma fonte externa (planilha online, API, sistema)
alter table public.tabelas add column if not exists autorizada_em timestamptz;
