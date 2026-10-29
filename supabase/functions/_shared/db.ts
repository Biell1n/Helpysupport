import { createClient, type SupabaseClient, type User } from 'npm:@supabase/supabase-js@2';
import { UserError } from './cors.ts';
import { PLANS, type PlanId } from './plans.ts';

/** Cliente com a service role: ignora RLS. Só use depois de checar o dono. */
export const admin: SupabaseClient = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } },
);

/** Usuário logado que fez a chamada, ou null. */
export async function userFrom(req: Request): Promise<User | null> {
  const auth = req.headers.get('Authorization') ?? '';
  const jwt = auth.replace(/^Bearer\s+/i, '');
  if (!jwt || jwt === Deno.env.get('SUPABASE_ANON_KEY')) return null;
  const { data, error } = await admin.auth.getUser(jwt);
  if (error) return null;
  return data.user ?? null;
}

/** Nível da sessão no token ("aal1" = só senha, "aal2" = passou pelo código de duas etapas). */
function nivelDoToken(req: Request): string {
  try {
    const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    const meio = jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return String(JSON.parse(atob(meio)).aal ?? '');
  } catch {
    return '';
  }
}

/** Dono da conta logado. Quem ativou duas etapas só passa depois do código. */
export async function requireUser(req: Request): Promise<User> {
  const user = await userFrom(req);
  if (!user) throw new UserError('Sua sessão expirou. Entre de novo.', 401);
  const temFator = (user.factors ?? []).some((f) => f.status === 'verified');
  if (temFator && nivelDoToken(req) !== 'aal2') {
    throw new UserError('Confirme o código de verificação em duas etapas para continuar.', 401);
  }
  return user;
}

// dias de tolerância para uma fatura atrasada antes de o plano voltar ao básico
const TOLERANCIA_ATRASO_DIAS = 5;

/**
 * Assinatura cancelada (depois do período pago) ou atrasada (passada a tolerância):
 * o plano volta ao teste encerrado. Feito aqui porque é por onde o servidor lê o plano.
 */
async function planoEmDia<T extends { id: string; plan: string | null }>(p: T): Promise<T> {
  if (!p.plan || p.plan === 'trial') return p;
  const { data: ass } = await admin.from('assinaturas').select('status, proximo_vencimento').eq('owner_id', p.id).maybeSingle();
  // só a assinatura em dia segura o plano; atrasada ou com troca pendente ganha uns dias de folga
  if (!ass?.proximo_vencimento || ass.status === 'ativa') return p;
  const limite = new Date(`${ass.proximo_vencimento}T23:59:59-03:00`);
  if (ass.status !== 'cancelada') limite.setDate(limite.getDate() + TOLERANCIA_ATRASO_DIAS);
  if (Date.now() <= limite.getTime()) return p;
  const agora = new Date().toISOString();
  await admin.from('profiles').update({ plan: 'trial', trial_ends_at: agora, funcionarios_extra: 0 }).eq('id', p.id);
  await aparaEquipe(p.id);
  return { ...p, plan: 'trial', trial_ends_at: agora };
}

/**
 * A equipe cabe no que a conta paga: quando o plano cai ou vagas extras não são
 * pagas, os convites abertos somem e quem entrou por último sai da equipe (volta
 * a ser conta comum) até caber no limite.
 */
export async function aparaEquipe(ownerId: string) {
  const { data: p } = await admin.from('profiles').select('plan, funcionarios_extra').eq('id', ownerId).maybeSingle();
  if (!p) return;
  const plano = PLANS[(p.plan ?? 'trial') as PlanId] ?? PLANS.trial;
  const limite = plano.funcionarios + (plano.id === 'trial' ? 0 : Number(p.funcionarios_extra ?? 0));
  const { data: membros } = await admin.from('equipe').select('user_id').eq('owner_id', ownerId).order('criado_em', { ascending: true });
  const sobra = (membros ?? []).slice(limite).map((m) => m.user_id as string);
  if (sobra.length) {
    await admin.from('equipe').delete().eq('owner_id', ownerId).in('user_id', sobra);
    await admin.from('profiles').update({ tipo: 'cliente', empresa_id: null }).in('id', sobra);
    await admin.from('alertas').insert({
      owner_id: ownerId, origem: 'sistema', chave: `equipe:aparada:${new Date().toISOString().slice(0, 10)}`,
      assunto: 'Equipe acima do limite do plano',
      detalhe: `${sobra.length} ${sobra.length === 1 ? 'pessoa saiu' : 'pessoas saíram'} da equipe porque o plano ou as vagas extras deixaram de cobrir. Para trazer de volta, aumente as vagas em Equipe.`,
    });
  }
  // convites ainda não usados que já não cabem
  if ((membros ?? []).length >= limite) {
    await admin.from('convites').update({ expira_em: new Date().toISOString() }).eq('owner_id', ownerId).is('usado_em', null);
  }
}

// Chaves liga/desliga de helpy_config (guardadas por 30 s em cada servidor)
const configLida = new Map<string, { valor: boolean; em: number }>();
export async function configLigada(chave: 'precos_teste' | 'carteira_disponivel'): Promise<boolean> {
  const lida = configLida.get(chave);
  if (lida && Date.now() - lida.em < 30_000) return lida.valor;
  const { data } = await admin.from('helpy_config').select('valor').eq('chave', chave).maybeSingle();
  configLida.set(chave, { valor: data?.valor === true, em: Date.now() });
  return data?.valor === true;
}

/** Preços de teste ligados? (helpy_config.precos_teste) */
export const precosDeTeste = () => configLigada('precos_teste');

export async function profileOf(userId: string) {
  const [perfil, precos_teste] = await Promise.all([lerPerfil(userId), precosDeTeste()]);
  return { ...perfil, precos_teste };
}

async function lerPerfil(userId: string) {
  const { data, error } = await admin
    .from('profiles')
    .select('id, plan, trial_ends_at, creditos_extra, funcionarios_extra, company_name, full_name, extra_ativo, extra_limite')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  if (data) return await planoEmDia(data);
  // conta criada antes do gatilho existir
  const { data: novo, error: e2 } = await admin
    .from('profiles')
    .insert({ id: userId })
    .select('id, plan, trial_ends_at, creditos_extra, funcionarios_extra, company_name, full_name, extra_ativo, extra_limite')
    .single();
  if (e2) throw e2;
  return novo;
}
