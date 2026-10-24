-- ============================================================
-- Avisos: a resposta da equipe fica guardada junto do aviso,
-- para a caixa de avisos mostrar o que foi decidido.
-- ============================================================

alter table public.alertas add column if not exists resposta text check (char_length(resposta) <= 2000);
alter table public.alertas add column if not exists respondido_em timestamptz;

-- Pergunta sem resposta também chega como aviso: "visto" tira do topo do
-- painel, mas ela continua na caixa de avisos até ser respondida.
alter table public.assistant_gaps add column if not exists vista_em timestamptz;
