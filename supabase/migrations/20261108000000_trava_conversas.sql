-- ============================================================
-- O que o painel (navegador) pode mudar numa conversa.
--
-- A equipe muda status, quem assumiu e as datas do atendimento. O resto
-- (se é teste, avaliação do cliente, de quem é, de onde veio) só o servidor
-- mexe: senão dava para tirar conversa da cota marcando como teste, ou
-- inventar avaliação nos relatórios. O nome de quem responde e de quem
-- assumiu vem da conta, não do que o navegador mandou.
-- ============================================================

-- nome de quem está logado, como aparece para o cliente
create or replace function public.helpy_nome_de(p_user uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(
    nullif(trim((select full_name from profiles where id = p_user)), ''),
    nullif(trim((select nome from equipe where user_id = p_user limit 1)), ''),
    nullif(split_part((select email from auth.users where id = p_user), '@', 1), ''),
    'Equipe'
  );
$$;
revoke execute on function public.helpy_nome_de(uuid) from public, anon, authenticated;

create or replace function public.helpy_trava_conversa() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- só vale para o navegador; o servidor (service role) segue livre
  if coalesce(auth.role(), '') <> 'authenticated' then return new; end if;

  if tg_op = 'INSERT' then
    raise exception 'Conversas são criadas pelo atendimento, não pelo painel.' using errcode = '42501';
  end if;

  new.teste := old.teste;
  new.owner_id := old.owner_id;
  new.assistant_id := old.assistant_id;
  new.numero := old.numero;
  new.visitor_id := old.visitor_id;
  new.cliente_id := old.cliente_id;
  new.cliente_email := old.cliente_email;
  new.ip_hash := old.ip_hash;
  new.canal_id := old.canal_id;
  new.contato_externo := old.contato_externo;
  new.created_at := old.created_at;
  new.nota := old.nota;
  new.feedback_texto := old.feedback_texto;
  new.message_count := old.message_count;

  -- assumir: só em nome de si mesmo, com o nome da própria conta
  if new.assumido_por is distinct from old.assumido_por then
    if new.assumido_por is not null and new.assumido_por <> auth.uid() then
      new.assumido_por := old.assumido_por;
      new.assumido_nome := old.assumido_nome;
    elsif new.assumido_por is not null then
      new.assumido_nome := helpy_nome_de(auth.uid());
    else
      new.assumido_nome := null;
    end if;
  else
    new.assumido_nome := old.assumido_nome;
  end if;
  return new;
end;
$$;

drop trigger if exists helpy_trava_conversa on public.conversations;
create trigger helpy_trava_conversa before insert or update on public.conversations
  for each row execute function public.helpy_trava_conversa();

-- resposta da equipe pelo painel: o nome é o da conta de quem respondeu
create or replace function public.helpy_nome_da_resposta() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(auth.role(), '') = 'authenticated' and new.role = 'agent' then
    new.author_name := helpy_nome_de(auth.uid());
  end if;
  return new;
end;
$$;

drop trigger if exists helpy_nome_da_resposta on public.conversation_messages;
create trigger helpy_nome_da_resposta before insert on public.conversation_messages
  for each row execute function public.helpy_nome_da_resposta();
