import { createClient, type SupabaseClient, type User } from 'npm:@supabase/supabase-js@2';
import { UserError } from './cors.ts';

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

export async function requireUser(req: Request): Promise<User> {
  const user = await userFrom(req);
  if (!user) throw new UserError('Sua sessão expirou. Entre de novo.', 401);
  return user;
}

export async function profileOf(userId: string) {
  const { data, error } = await admin
    .from('profiles')
    .select('id, plan, trial_ends_at, creditos_extra, company_name, full_name')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  if (data) return data;
  // conta criada antes do gatilho existir
  const { data: novo, error: e2 } = await admin
    .from('profiles')
    .insert({ id: userId })
    .select('id, plan, trial_ends_at, creditos_extra, company_name, full_name')
    .single();
  if (e2) throw e2;
  return novo;
}
