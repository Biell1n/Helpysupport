-- ============================================================
-- Venda no chat por assistente e horário pago na hora de marcar
--
--   agendamentos: novo status "aguardando_pagamento" (o horário fica
--                 guardado até reserva_ate) e o pedido que paga o horário
--   pedidos:      tipo (venda ou agendamento), o horário que ele paga e
--                 o status "estornado" (valor devolvido ao cliente)
-- ============================================================

alter table public.agendamentos drop constraint if exists agendamentos_status_check;
alter table public.agendamentos add constraint agendamentos_status_check
  check (status in ('aguardando_pagamento', 'pendente', 'confirmado', 'cancelado', 'concluido', 'faltou'));
alter table public.agendamentos add column if not exists reserva_ate timestamptz;
alter table public.agendamentos add column if not exists pedido_id uuid references public.pedidos (id) on delete set null;

alter table public.pedidos add column if not exists tipo text not null default 'venda' check (tipo in ('venda', 'agendamento'));
alter table public.pedidos add column if not exists agendamento_id uuid references public.agendamentos (id) on delete set null;
alter table public.pedidos drop constraint if exists pedidos_status_check;
alter table public.pedidos add constraint pedidos_status_check
  check (status in ('aguardando', 'pago', 'cancelado', 'estornado'));
