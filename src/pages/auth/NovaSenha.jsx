import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { erroAuth } from '@/lib/erroAuth';
import { VerificarCodigo } from '@/components/DuasEtapas';
import AuthLayout from './AuthLayout';

/**
 * O link do e-mail traz a sessão de recuperação; aqui só se troca a senha.
 * Quem tem verificação em duas etapas digita o código antes (o Supabase exige).
 */
export default function NovaSenha() {
  const { user, loading, precisaCodigo } = useAuth();
  const navigate = useNavigate();
  const [senha, setSenha] = useState('');
  const [repete, setRepete] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  if (user && precisaCodigo) return <VerificarCodigo />;

  const enviar = async (e) => {
    e.preventDefault();
    setErro('');
    if (senha.length < 8) return setErro('A senha precisa de pelo menos 8 caracteres.');
    if (senha !== repete) return setErro('As duas senhas não são iguais.');
    setEnviando(true);
    const { error } = await supabase.auth.updateUser({ password: senha });
    setEnviando(false);
    if (error) return setErro(erroAuth(error.message));
    navigate('/painel', { replace: true });
  };

  return (
    <AuthLayout>
      <h1>Nova senha</h1>
      {loading ? (
        <p className="muted">Conferindo o link…</p>
      ) : !user ? (
        <>
          <p className="muted">Este link expirou ou já foi usado.</p>
          <Link to="/recuperar-senha" className="btn btn-primary btn-block">Pedir outro link</Link>
        </>
      ) : (
        <form className="stack" onSubmit={enviar}>
          <p className="muted">Conta: <b>{user.email}</b></p>
          <label className="field">
            <span className="label">Senha nova</span>
            <input className="input" type="password" autoComplete="new-password" minLength={8} required value={senha} onChange={(e) => setSenha(e.target.value)} />
            <span className="hint">Pelo menos 8 caracteres. Evite senhas que você usa em outros sites.</span>
          </label>
          <label className="field">
            <span className="label">Repita a senha nova</span>
            <input className="input" type="password" autoComplete="new-password" required value={repete} onChange={(e) => setRepete(e.target.value)} />
          </label>
          {erro && <p className="error-text" role="alert">{erro}</p>}
          <button className="btn btn-primary btn-lg btn-block" disabled={enviando}>{enviando ? 'Salvando…' : 'Salvar senha'}</button>
        </form>
      )}
    </AuthLayout>
  );
}
