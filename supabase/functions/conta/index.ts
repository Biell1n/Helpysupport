// ============================================================
// conta — o que mexe na conta e na equipe, sempre pelo servidor
//
//   excluir           → apaga a conta e tudo dela (LGPD); pede a senha
//   virar_empresa     → cliente que quer criar o próprio atendente
//   minhas_conversas  → os atendimentos que o cliente abriu logado
//   convite_criar     → dono gera link de convite para funcionário
//   convite_ver       → a página do convite mostra de qual empresa é
//   convite_aceitar   → quem abriu o link entra na equipe
//   convite_cancelar  → dono desfaz um link que ainda não foi usado
//   equipe_remover    → dono tira alguém da equipe
//   agenda_*          → quem atende o chamado (dono ou funcionário) vê
//                       horários livres, marca, remarca e cancela, igual
//                       ao atendente virtual
// ============================================================

import { corsHeaders, json, UserError } from '../_shared/cors.ts';
import { admin, profileOf, requireUser } from '../_shared/db.ts';
import { planOf } from '../_shared/plans.ts';
import { agendamentosDaConversa, alterarAgendamento, descreverAgendamento, horariosLivres, marcar, type AgendaConfig } from '../_shared/agenda.ts';

const CONVITE_RE = /^[A-Za-z0-9_-]{20,64}$/;

function novoToken(): string {
  const b = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Confere a senha sem abrir sessão nova no navegador. */
async function senhaConfere(email: string, senha: string): Promise<boolean> {
  const r = await fetch(`${Deno.env.get('SUPABASE_URL')}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: Deno.env.get('SUPABASE_ANON_KEY')!, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: senha }),
  });
  if (!r.ok) return false;
  // a sessão criada só para conferir é encerrada na hora
  const { access_token } = await r.json();
  if (access_token) {
    await fetch(`${Deno.env.get('SUPABASE_URL')}/auth/v1/logout?scope=local`, {
      method: 'POST',
      headers: { apikey: Deno.env.get('SUPABASE_ANON_KEY')!, Authorization: `Bearer ${access_token}` },
    }).catch(() => {});
  }
  return true;
}

async function vagasDaEquipe(ownerId: string) {
  const profile = await profileOf(ownerId);
  const plan = planOf(profile);
  const [{ count: membros }, { count: pendentes }] = await Promise.all([
    admin.from('equipe').select('user_id', { count: 'exact', head: true }).eq('owner_id', ownerId),
    admin.from('convites').select('token', { count: 'exact', head: true }).eq('owner_id', ownerId)
      .is('usado_em', null).gt('expira_em', new Date().toISOString()),
  ]);
  const extra = Number((profile as { funcionarios_extra?: number }).funcionarios_extra ?? 0);
  return { limite: plan.funcionarios + extra, incluidos: plan.funcionarios, extra, membros: membros ?? 0, pendentes: pendentes ?? 0, plano: plan.nome };
}

async function tipoDe(userId: string): Promise<string> {
  const { data } = await admin.from('profiles').select('tipo').eq('id', userId).maybeSingle();
  return data?.tipo ?? 'empresa';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? '');

    // ---- página do convite: funciona antes de ter conta ----
    if (action === 'convite_ver') {
      const token = String(body.token ?? '');
      if (!CONVITE_RE.test(token)) throw new UserError('Convite inválido.', 404);
      const { data: c } = await admin.from('convites').select('owner_id, expira_em, usado_em').eq('token', token).maybeSingle();
      if (!c) throw new UserError('Este convite não existe ou foi cancelado.', 404);
      if (c.usado_em) throw new UserError('Este convite já foi usado. Peça um novo para a empresa.', 410);
      if (new Date(c.expira_em).getTime() < Date.now()) throw new UserError('Este convite venceu. Peça um novo para a empresa.', 410);
      const { data: dono } = await admin.from('profiles').select('company_name, full_name').eq('id', c.owner_id).maybeSingle();
      return json({ empresa: dono?.company_name || dono?.full_name || 'uma empresa', expira_em: c.expira_em });
    }

    const user = await requireUser(req);

    if (action === 'excluir') {
      const temSenha = (user.app_metadata?.providers ?? [user.app_metadata?.provider]).includes('email');
      if (temSenha) {
        if (!(await senhaConfere(user.email!, String(body.senha ?? '')))) throw new UserError('Senha incorreta.', 403);
      } else if (String(body.confirmacao ?? '').trim().toUpperCase() !== 'EXCLUIR') {
        throw new UserError('Digite EXCLUIR para confirmar.');
      }
      // quem era da equipe volta a ser conta comum
      const { data: membros } = await admin.from('equipe').select('user_id').eq('owner_id', user.id);
      for (const m of membros ?? []) {
        await admin.from('profiles').update({ tipo: 'cliente', empresa_id: null }).eq('id', m.user_id);
      }
      // apaga o usuário; o banco apaga em cascata assistentes, tabelas, conversas, agenda e o cofre das chaves
      const { error } = await admin.auth.admin.deleteUser(user.id);
      if (error) throw error;
      return json({ ok: true });
    }

    // ---- agenda pelo chamado: dono ou funcionário da empresa dona da conversa ----
    if (action.startsWith('agenda_')) {
      const { data: p } = await admin.from('profiles').select('tipo, empresa_id').eq('id', user.id).maybeSingle();
      let conta = user.id;
      if (p?.tipo === 'funcionario') {
        const { data: eq } = await admin.from('equipe').select('owner_id').eq('user_id', user.id).maybeSingle();
        if (!eq) throw new UserError('Você não está mais na equipe desta empresa.', 403);
        conta = eq.owner_id;
      } else if (p?.tipo === 'cliente') {
        throw new UserError('Só a empresa pode mexer na agenda.', 403);
      }
      const { data: cfg } = await admin.from('agenda_config').select('*').eq('owner_id', conta).maybeSingle();
      if (!cfg?.ativa) throw new UserError('A agenda está desligada. Ligue em Agenda → Horários.');
      const agenda = cfg as AgendaConfig;

      const conversa = String(body.conversation_id ?? '');
      const { data: c } = await admin.from('conversations').select('id, assistant_id, owner_id').eq('id', conversa).maybeSingle();
      if (!c || c.owner_id !== conta) throw new UserError('Conversa não encontrada.', 404);
      const { data: a } = await admin.from('assistants').select('config').eq('id', c.assistant_id).maybeSingle();
      const campo = (k: string) => String((a?.config as { fields?: Record<string, { value?: string }> })?.fields?.[k]?.value ?? '');
      const registrar = /^sim/i.test(campo('agenda_registrar'));

      if (action === 'agenda_ver') {
        const marcados = await agendamentosDaConversa(admin, conversa);
        return json({
          servicos: agenda.servicos ?? [],
          duracao_min: agenda.duracao_min,
          marcados: marcados.map((m) => ({ ...m, texto: descreverAgendamento(m, agenda.fuso).replace(/ \(id [^)]+\)$/, '') })),
        });
      }
      if (action === 'agenda_horarios') {
        const sv = (agenda.servicos ?? []).find((x) => x.nome === body.servico);
        return json(await horariosLivres(admin, agenda, String(body.dia ?? ''), sv?.duracao_min));
      }

      // a mensagem que o cliente vê na conversa, assinada por quem marcou
      const avisar = async (texto: string) => {
        const { data: eu } = await admin.from('profiles').select('full_name').eq('id', user.id).maybeSingle();
        await admin.from('conversation_messages').insert({
          conversation_id: conversa, role: 'agent', content: texto, author_name: eu?.full_name || user.email?.split('@')[0] || 'Equipe',
        });
        await admin.from('conversations').update({ last_message_at: new Date().toISOString() }).eq('id', conversa);
      };

      if (action === 'agenda_marcar') {
        const r = await marcar(admin, agenda, {
          dia: String(body.dia ?? ''),
          hora: String(body.hora ?? ''),
          nome: String(body.nome ?? ''),
          contato: String(body.contato ?? ''),
          servico: body.servico ? String(body.servico) : undefined,
          observacao: body.observacao ? String(body.observacao) : undefined,
          registrar,
          adicional: true, // a equipe pode marcar mais de um horário na mesma conversa
          origem: 'manual',
          assistant_id: c.assistant_id,
          conversation_id: conversa,
        });
        if ('erro' in r && r.erro) throw new UserError(r.erro);
        await avisar(`Agendado: ${(r as { quando: string }).quando}${body.servico ? ` · ${body.servico}` : ''}. Qualquer coisa, é só falar por aqui.`);
        return json(r);
      }
      if (action === 'agenda_alterar') {
        const r = await alterarAgendamento(admin, agenda, conversa, {
          id: String(body.id ?? ''),
          dia: body.dia ? String(body.dia) : undefined,
          hora: body.hora ? String(body.hora) : undefined,
          cancelar: body.cancelar === true,
          registrar,
        });
        if ('erro' in r && r.erro) throw new UserError(r.erro);
        await avisar(body.cancelar === true
          ? 'Seu horário foi cancelado. Se quiser marcar outro, é só falar por aqui.'
          : `Remarcado: ${String((r as { agora?: string }).agora ?? '').replace(/ · (confirmado|pendente).*$/, '')}.`);
        return json(r);
      }
      throw new UserError(`Ação desconhecida: ${action}`);
    }

    if (action === 'virar_empresa') {
      const tipo = await tipoDe(user.id);
      if (tipo === 'empresa') return json({ ok: true });
      if (tipo === 'funcionario') throw new UserError('Você está na equipe de uma empresa. Saia da equipe antes de criar a sua.');
      await admin.from('profiles').update({
        tipo: 'empresa',
        plan: 'trial',
        trial_ends_at: new Date(Date.now() + 14 * 864e5).toISOString(),
        company_name: String(body.empresa ?? '').trim().slice(0, 120) || null,
      }).eq('id', user.id);
      return json({ ok: true });
    }

    if (action === 'virar_cliente') {
      // só para conta recém-criada pelo Google por quem escolheu "Sou cliente"
      const { data: p } = await admin.from('profiles').select('tipo, created_at').eq('id', user.id).maybeSingle();
      if (p?.tipo !== 'empresa' || Date.now() - new Date(p.created_at).getTime() > 15 * 60_000) return json({ ok: false });
      const { count } = await admin.from('assistants').select('id', { count: 'exact', head: true }).eq('owner_id', user.id);
      if ((count ?? 0) > 0) return json({ ok: false });
      await admin.from('profiles').update({ tipo: 'cliente', company_name: null }).eq('id', user.id);
      return json({ ok: true });
    }

    if (action === 'minhas_conversas') {
      const { data } = await admin
        .from('conversations')
        .select('id, numero, status, titulo, last_message_at, escalado_em, assistants(name, public_token, is_public)')
        .eq('cliente_id', user.id)
        .order('last_message_at', { ascending: false })
        .limit(50);
      return json({
        conversas: (data ?? []).map((c) => {
          const a = c.assistants as unknown as { name: string; public_token: string; is_public: boolean } | null;
          return {
            id: c.id, numero: c.numero, status: c.status, titulo: c.titulo, chamado: !!c.escalado_em,
            ultima: c.last_message_at, assistente: a?.name ?? 'Atendimento', token: a?.is_public ? a.public_token : null,
          };
        }),
      });
    }

    if (action === 'convite_aceitar') {
      const token = String(body.token ?? '');
      if (!CONVITE_RE.test(token)) throw new UserError('Convite inválido.', 404);
      const { data: c } = await admin.from('convites').select('owner_id, papel, expira_em, usado_em').eq('token', token).maybeSingle();
      if (!c || c.usado_em || new Date(c.expira_em).getTime() < Date.now()) throw new UserError('Este convite não vale mais. Peça um novo para a empresa.', 410);
      if (c.owner_id === user.id) throw new UserError('Este é o seu próprio convite. Mande o link para o funcionário.');
      const tipo = await tipoDe(user.id);
      if (tipo === 'funcionario') throw new UserError('Esta conta já está na equipe de uma empresa.');
      if (tipo === 'empresa') {
        const { count } = await admin.from('assistants').select('id', { count: 'exact', head: true }).eq('owner_id', user.id);
        if ((count ?? 0) > 0) throw new UserError('Esta conta já tem assistentes de uma empresa. Entre com outra conta para ser funcionário.');
      }
      const vagas = await vagasDaEquipe(c.owner_id);
      if (vagas.membros >= vagas.limite) throw new UserError('A equipe desta empresa está cheia no plano atual. Avise o responsável.', 409);
      // marca o convite primeiro: dois cliques no mesmo link não viram duas vagas
      const { data: marcado } = await admin.from('convites').update({ usado_por: user.id, usado_em: new Date().toISOString() })
        .eq('token', token).is('usado_em', null).select('token').maybeSingle();
      if (!marcado) throw new UserError('Este convite acabou de ser usado.', 410);
      const p = await profileOf(user.id);
      const { error } = await admin.from('equipe').insert({
        owner_id: c.owner_id, user_id: user.id, papel: c.papel, email: user.email, nome: p.full_name ?? user.user_metadata?.full_name ?? null,
      });
      if (error) throw error;
      await admin.from('profiles').update({ tipo: 'funcionario', empresa_id: c.owner_id }).eq('id', user.id);
      return json({ ok: true });
    }

    // ---- daqui para baixo, só o dono da empresa ----
    if ((await tipoDe(user.id)) !== 'empresa') throw new UserError('Só o responsável pela empresa pode fazer isso.', 403);

    if (action === 'equipe') {
      const [{ data: membros }, { data: convites }, vagas] = await Promise.all([
        admin.from('equipe').select('user_id, nome, email, papel, criado_em').eq('owner_id', user.id).order('criado_em'),
        admin.from('convites').select('token, criado_em, expira_em').eq('owner_id', user.id).is('usado_em', null)
          .gt('expira_em', new Date().toISOString()).order('criado_em', { ascending: false }),
        vagasDaEquipe(user.id),
      ]);
      return json({ membros: membros ?? [], convites: convites ?? [], vagas });
    }

    if (action === 'convite_criar') {
      const vagas = await vagasDaEquipe(user.id);
      if (vagas.membros + vagas.pendentes >= vagas.limite) {
        throw new UserError(`Sua equipe tem ${vagas.limite} vaga${vagas.limite > 1 ? 's' : ''}. Cancele um convite, contrate uma vaga extra (R$ 19/mês) ou mude de plano.`, 409);
      }
      const token = novoToken();
      const { error } = await admin.from('convites').insert({ token, owner_id: user.id });
      if (error) throw error;
      return json({ token });
    }

    if (action === 'convite_cancelar') {
      await admin.from('convites').delete().eq('token', String(body.token ?? '')).eq('owner_id', user.id).is('usado_em', null);
      return json({ ok: true });
    }

    if (action === 'equipe_remover') {
      const alvo = String(body.user_id ?? '');
      const { data: removido } = await admin.from('equipe').delete().eq('owner_id', user.id).eq('user_id', alvo).select('user_id').maybeSingle();
      if (!removido) throw new UserError('Essa pessoa não está na sua equipe.', 404);
      await admin.from('profiles').update({ tipo: 'cliente', empresa_id: null }).eq('id', alvo);
      // a sessão dela deixa de enxergar os dados da empresa na hora (o banco consulta a equipe a cada pedido)
      return json({ ok: true });
    }

    throw new UserError(`Ação desconhecida: ${action}`);
  } catch (err) {
    if (err instanceof UserError) return json({ error: err.message }, err.status);
    console.error('[conta]', err);
    return json({ error: 'Algo deu errado do nosso lado. Tente de novo em instantes.' }, 500);
  }
});
