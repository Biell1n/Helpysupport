-- ============================================================
-- Venda sem pagamento no chat: o assistente anota o pedido e a equipe finaliza.
-- "anotado" = registrado pelo assistente, esperando a equipe; "finalizado" = a equipe concluiu.
-- ============================================================
alter table public.pedidos drop constraint if exists pedidos_status_check;
alter table public.pedidos add constraint pedidos_status_check
  check (status = any (array['aguardando', 'pago', 'cancelado', 'estornado', 'anotado', 'finalizado']));

-- contato que o cliente deixou para a equipe finalizar (telefone ou e-mail)
alter table public.pedidos add column if not exists cliente_contato text check (char_length(cliente_contato) <= 120);

create index if not exists pedidos_conversa on public.pedidos (conversation_id) where conversation_id is not null;
