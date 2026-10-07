import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { chamar, supabase } from '@/lib/supabase';
import { aplicarTipoPendente, gravarAceitePendente, TERMOS_VERSAO } from '@/lib/termos';

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
    let { data } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
    // volta do Google: grava o aceite dos termos e o tipo escolhidos antes de sair
    const aceitou = data && data.termos_versao !== TERMOS_VERSAO && (await gravarAceitePendente());
    const virou = data && (await aplicarTipoPendente(chamar));
    if (aceitou || virou) ({ data } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle());
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
      // empresa (padrão) · cliente (só conversa) · funcionario (equipe de uma empresa)
      tipo: profile?.tipo ?? 'empresa',
      // de quem são os dados que esta pessoa vê: a empresa, para funcionário
      contaId: profile?.tipo === 'funcionario' && profile?.empresa_id ? profile.empresa_id : user?.id ?? null,
      nome:
        profile?.full_name || user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email?.split('@')[0] || '',
      signOut: () => supabase.auth.signOut(),
    }),
    [session, user, profile, loadProfile, nivel, recarregarNivel],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
