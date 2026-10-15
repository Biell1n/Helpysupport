-- Mensagens já recebidas pelos canais. O WhatsApp e o Instagram reenviam
-- o mesmo evento quando a resposta demora; com isto cada mensagem é
-- atendida uma vez só. Só o servidor usa (sem acesso pelo navegador), e
-- ele mesmo apaga de vez em quando o que tem mais de 3 dias.
create table if not exists public.canal_eventos (
  id text primary key check (char_length(id) <= 200),
  criado_em timestamptz not null default now()
);

alter table public.canal_eventos enable row level security;
revoke all on public.canal_eventos from anon, authenticated;

create index if not exists canal_eventos_criado on public.canal_eventos (criado_em);
