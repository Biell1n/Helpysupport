import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import AuthLayout from './AuthLayout';
import GoogleBotao from './GoogleBotao';

const traduz = (m = '') =>
  /invalid login/i.test(m)
    ? 'E-mail ou senha incorretos.'
    : /email not confirmed/i.test(m)
    ? 'Confirme seu e-mail pelo link que enviamos antes de entrar.'
    : m;

export default function Entrar() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const loc = useLocation();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  if (user) return <Navigate to={loc.state?.de || '/painel'} replace />;

  const enviar = async (e) => {
    e.preventDefault();
    setErro('');
    setEnviando(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: senha });
    setEnviando(false);
    if (error) return setErro(traduz(error.message));
    navigate(loc.state?.de || '/painel', { replace: true });
  };

  return (
    <AuthLayout>
      <div>
        <h1>Entrar</h1>
        <p className="muted" style={{ marginTop: 6 }}>
          Ainda não tem conta? <Link to="/criar-conta">Comece o teste grátis</Link>
        </p>
      </div>
      <GoogleBotao />
      <div className="ou">ou com e-mail</div>
      <form className="stack" onSubmit={enviar}>
        <label className="field">
          <span className="label">E-mail</span>
          <input className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="field">
          <span className="row" style={{ justifyContent: 'space-between' }}>
            <span className="label">Senha</span>
            <Link to="/recuperar-senha" style={{ fontSize: 13 }}>Esqueci a senha</Link>
          </span>
          <input className="input" type="password" autoComplete="current-password" required value={senha} onChange={(e) => setSenha(e.target.value)} />
        </label>
        {erro && <p className="error-text" role="alert">{erro}</p>}
        <button className="btn btn-primary btn-lg btn-block" disabled={enviando}>
          {enviando ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </AuthLayout>
  );
}
