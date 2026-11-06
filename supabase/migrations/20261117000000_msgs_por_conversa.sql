-- A empresa pode baixar o teto de mensagens do cliente por conversa (nulo = o do plano).
alter table public.profiles add column if not exists msgs_por_conversa smallint
  check (msgs_por_conversa is null or msgs_por_conversa between 5 and 40);
comment on column public.profiles.msgs_por_conversa is 'Teto de mensagens do cliente por conversa escolhido pela empresa (nulo = o do plano).';
grant update (msgs_por_conversa) on public.profiles to authenticated;
