import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined); // undefined = ainda carregando
  const [profile, setProfile] = useState(null);
  // duas etapas: "aal1" = só senha; se a conta tem app autenticador, falta o código
  const [nivel, setNivel] = useState(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, s) => setSession(s ?? null));
    return () => sub.subscription.unsubscribe();
  }, []);

  const user = session?.user ?? null;

  const recarregarNivel = useCallback(async () => {
    if (!session) return setNivel(null);
    try {
      const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      setNivel(data ?? {});
    } catch {
      setNivel({}); // sem resposta não trava a tela; o banco e as funções ainda exigem o código
    }
  }, [session]);

  useEffect(() => {
    recarregarNivel();
  }, [recarregarNivel]);

  const loadProfile = useCallback(async () => {
    if (!user) {
      setProfile(null);
      return;
    }
    const { data } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
    setProfile(data ?? { id: user.id, plan: 'trial' });
  }, [user]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const value = useMemo(
    () => ({
      loading: session === undefined || (session && nivel === null),
      precisaCodigo: nivel?.currentLevel === 'aal1' && nivel?.nextLevel === 'aal2',
      recarregarNivel,
      session,
      user,
      profile,
      reloadProfile: loadProfile,
      nome:
        profile?.full_name || user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email?.split('@')[0] || '',
      signOut: () => supabase.auth.signOut(),
    }),
    [session, user, profile, loadProfile, nivel, recarregarNivel],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
