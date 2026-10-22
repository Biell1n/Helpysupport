-- Revisão de segurança: o que o navegador pode fazer direto no banco.

-- Conversas: o painel só muda estado, atribuição e leitura. Criar, apagar ou mexer
-- em teste, datas, canal ou dono é só do servidor (senão dava para zerar a cota do
-- mês ou plantar uma conversa no WhatsApp de outra empresa).
revoke insert, update, delete on public.conversations from authenticated;
grant update (status, assumido_por, assumido_nome, assumido_em, escalado_em, fechado_em, encerrado_por, lido_em, prioridade, titulo)
  on public.conversations to authenticated;

-- Assistentes nascem só pelo servidor, que confere o limite do plano.
revoke insert on public.assistants from authenticated;

-- Tabelas de dados: o limite do plano vale também para quem insere direto.
create or replace function public.helpy_limite_tabelas()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  limite int;
  total int;
begin
  select case coalesce(p.plan, 'trial') when 'business' then 50 when 'profissional' then 10 else 3 end
    into limite from public.profiles p where p.id = new.owner_id;
  select count(*) into total from public.tabelas where owner_id = new.owner_id;
  if total >= coalesce(limite, 3) then
    raise exception 'O seu plano permite % tabelas de dados. Mude de plano para criar mais.', coalesce(limite, 3) using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke execute on function public.helpy_limite_tabelas() from public, anon, authenticated;
drop trigger if exists tabelas_limite on public.tabelas;
create trigger tabelas_limite before insert on public.tabelas for each row execute function public.helpy_limite_tabelas();

-- Uma tabela só pode ser ligada a um assistente do mesmo dono.
create or replace function public.helpy_tabela_mesmo_dono()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from public.assistants a join public.tabelas t on t.owner_id = a.owner_id
     where a.id = new.assistant_id and t.id = new.tabela_id
  ) then
    raise exception 'Tabela e assistente precisam ser da mesma conta.' using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke execute on function public.helpy_tabela_mesmo_dono() from public, anon, authenticated;
drop trigger if exists assistente_tabelas_mesmo_dono on public.assistente_tabelas;
create trigger assistente_tabelas_mesmo_dono before insert or update on public.assistente_tabelas
  for each row execute function public.helpy_tabela_mesmo_dono();

-- Cobrança do Helpy (assinatura, faturas, uso extra): só o dono vê, não a equipe.
alter policy "assinatura da conta" on public.assinaturas using (owner_id = (select auth.uid()));
alter policy "faturas da conta" on public.faturas using (owner_id = (select auth.uid()));
alter policy "uso extra da conta" on public.uso_extra using (owner_id = (select auth.uid()));

-- Lacunas: o assistente precisa ser da mesma conta.
alter policy "lacunas próprias" on public.assistant_gaps
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid() and exists (select 1 from public.assistants a where a.id = assistant_id and a.owner_id = auth.uid()));

-- Alertas: o painel só marca como visto.
revoke update on public.alertas from authenticated;
grant update (visto_em) on public.alertas to authenticated;

-- Sobras de permissão.
revoke truncate, trigger, references on public.equipe, public.convites, public.alertas from authenticated;
revoke execute on function public.helpy_conversa_evento() from public, anon, authenticated;
revoke execute on function public.helpy_uso() from public, anon;

-- Crédito avulso: gasta um de cada vez, sem dois atendimentos usarem o mesmo.
create or replace function public.helpy_gastar_credito(p_dono uuid)
returns boolean
language sql security definer set search_path = public as $$
  with gasto as (
    update public.profiles set creditos_extra = creditos_extra - 1
     where id = p_dono and creditos_extra > 0
    returning 1
  )
  select exists (select 1 from gasto);
$$;
revoke execute on function public.helpy_gastar_credito(uuid) from public, anon, authenticated;
grant execute on function public.helpy_gastar_credito(uuid) to service_role;
