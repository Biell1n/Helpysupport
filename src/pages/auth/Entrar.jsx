import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { destinoSeguro, ehVisitante } from '@/lib/destino';
import { lembrarAceite } from '@/lib/termos';
import { erroAuth } from '@/lib/erroAuth';
import AuthLayout from './AuthLayout';
import GoogleBotao from './GoogleBotao';
import ReenviarConfirmacao from './ReenviarConfirmacao';

const traduz = erroAuth;

export default function Entrar() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const loc = useLocation();
  const [params] = useSearchParams();
  const destino = destinoSeguro(params.get('de') || loc.state?.de);
  const visitante = ehVisitante(destino);
  const deQuery = destino === '/painel' ? '' : `?de=${encodeURIComponent(destino)}`;
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  if (user) return <Navigate to={destino} replace />;

  const enviar = async (e) => {
    e.preventDefault();
    setErro('');
    setEnviando(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: senha });
    setEnviando(false);
    if (error) return setErro(traduz(error.message));
    navigate(destino, { replace: true });
  };

  return (
    <AuthLayout>
      <div>
        <h1>{visitante ? 'Entre para falar com a equipe' : 'Entrar'}</h1>
        <p className="muted" style={{ marginTop: 6 }}>
          {visitante ? 'Depois de entrar, você volta para a conversa. ' : ''}
          Ainda não tem conta? <Link to={`/criar-conta${deQuery}`}>{visitante ? 'Criar conta' : 'Comece o teste grátis'}</Link>
        </p>
      </div>
      <GoogleBotao destino={destino} antes={() => lembrarAceite(visitante ? 'cliente' : undefined)} />
      <p className="faint" style={{ fontSize: 12.5, marginTop: -6 }}>
        Conta nova pelo Google? Ao continuar, você aceita os <Link to="/termos" target="_blank">termos</Link> e a{' '}
        <Link to="/privacidade" target="_blank">privacidade</Link>.
      </p>
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
        {/confirme seu e-mail/i.test(erro) && <ReenviarConfirmacao email={email.trim().toLowerCase()} destino={destino} />}
        <button className="btn btn-primary btn-lg btn-block" disabled={enviando}>
          {enviando ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </AuthLayout>
  );
}
