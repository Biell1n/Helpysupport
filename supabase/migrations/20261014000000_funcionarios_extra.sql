-- Vagas de funcionário compradas além das do plano (R$ 19/mês cada).
-- Só o servidor/o responsável pelo Helpy muda; o navegador não tem permissão.
alter table public.profiles add column if not exists funcionarios_extra integer not null default 0
  check (funcionarios_extra between 0 and 500);
