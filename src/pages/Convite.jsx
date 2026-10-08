import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Users } from 'lucide-react';
import { chamar } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import AuthLayout from './auth/AuthLayout';

/** Link que a empresa manda para o funcionário. Conta de funcionário só nasce por aqui. */
export default function Convite() {
  const { token } = useParams();
  const { user, loading, reloadProfile, signOut } = useAuth();
  const navigate = useNavigate();
  const [info, setInfo] = useState(null);
  const [erro, setErro] = useState('');
  const [entrando, setEntrando] = useState(false);
  const de = encodeURIComponent(`/convite/${token}`);

  useEffect(() => {
    chamar('conta', { action: 'convite_ver', token }).then(setInfo).catch((e) => setErro(e.message));
  }, [token]);

  const aceitar = async () => {
    setEntrando(true);
    setErro('');
    try {
      await chamar('conta', { action: 'convite_aceitar', token });
      await reloadProfile();
      navigate('/painel/atendimentos', { replace: true });
    } catch (e) {
      setErro(e.message);
    } finally {
      setEntrando(false);
    }
  };

  return (
    <AuthLayout>
      <Users size={36} />
      {erro && !info ? (
        <>
          <h1>Convite indisponível</h1>
          <p className="muted">{erro}</p>
        </>
      ) : !info || loading ? (
        <p className="muted">Abrindo o convite…</p>
      ) : (
        <>
          <div>
            <h1>Entrar na equipe de {info.empresa}</h1>
            <p className="muted" style={{ marginTop: 6 }}>
              Como funcionário você atende os chamados e vê a agenda da empresa. O convite vale até{' '}
              {new Date(info.expira_em).toLocaleDateString('pt-BR')} e só pode ser usado uma vez.
            </p>
          </div>
          {user ? (
            <div className="stack">
              <p style={{ fontSize: 14 }}>Conectado como <b>{user.email}</b>.</p>
              {erro && <p className="error-text" role="alert">{erro}</p>}
              <button type="button" className="btn btn-primary btn-lg btn-block" disabled={entrando} onClick={aceitar}>
                {entrando ? 'Entrando…' : 'Entrar na equipe'}
              </button>
              <button type="button" className="btn btn-ghost btn-block" onClick={signOut}>Usar outra conta</button>
            </div>
          ) : (
            <div className="stack">
              <Link className="btn btn-primary btn-lg btn-block" to={`/criar-conta?tipo=funcionario&de=${de}`}>Criar minha conta de funcionário</Link>
              <Link className="btn btn-ghost btn-block" to={`/entrar?de=${de}`}>Já tenho conta</Link>
            </div>
          )}
        </>
      )}
    </AuthLayout>
  );
}
