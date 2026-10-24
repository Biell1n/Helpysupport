-- ============================================================
-- Pedido pelo chat: entrega ou retirada, endereço e frete. O frete
-- vem da regra que a empresa definiu (valor fixo, grátis acima de
-- tanto, só retirada); o Asaas não calcula frete.
-- ============================================================

alter table public.pedidos add column if not exists entrega text check (entrega in ('entrega', 'retirada'));
alter table public.pedidos add column if not exists endereco text check (char_length(endereco) <= 300);
alter table public.pedidos add column if not exists frete numeric(12, 2);

-- Carrinho da conversa: o que o cliente está montando para comprar. O
-- assistente atualiza com os preços da tabela; o cliente vê e muda a
-- quantidade na tela.
alter table public.conversations add column if not exists carrinho jsonb not null default '[]';
