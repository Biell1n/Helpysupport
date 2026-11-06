-- pedido anotado: marca se as peças já saíram do estoque, para finalizar/reabrir não baixar duas vezes
alter table public.pedidos add column if not exists estoque_baixado boolean not null default false;
