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
    // link do e-mail vencido ou já usado: o Supabase volta com o erro no endereço
    const erroDoLink = new URLSearchParams(window.location.hash.slice(1)).get('error_code')
      || new URLSearchParams(window.location.search).get('error_code');
    if (erroDoLink && window.location.pathname !== '/entrar') {
      window.location.replace(`/entrar?link=${erroDoLink === 'otp_expired' ? 'expirado' : 'invalido'}`);
      return undefined;
    }
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((evt, s) => {
      setSession(s ?? null);
      // link de "esqueci a senha": vai para a tela de senha nova, mesmo que o e-mail tenha mandado para outra página
      if (evt === 'PASSWORD_RECOVERY' && window.location.pathname !== '/nova-senha') window.location.replace('/nova-senha');
    });
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

  // a sessão renova sozinha ao voltar para a aba: o perfil só recarrega se a pessoa mudar
  const userId = user?.id ?? null;
  const loadProfile = useCallback(async () => {
    if (!userId) {
      setProfile(null);
      return;
    }
    let { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
    // voltando para a aba a rede pode ainda estar acordando: mantém o perfil que já tinha
    if (error) {
      setProfile((p) => p ?? { id: userId, plan: 'trial' });
      return;
    }
    // volta do Google: grava o aceite dos termos e o tipo escolhidos antes de sair
    const aceitou = data && data.termos_versao !== TERMOS_VERSAO && (await gravarAceitePendente());
    const virou = data && (await aplicarTipoPendente(chamar));
    if (aceitou || virou) ({ data } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle());
    setProfile(data ?? { id: userId, plan: 'trial' });
  }, [userId]);

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
