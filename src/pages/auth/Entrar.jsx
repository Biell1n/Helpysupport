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
import Captcha, { useCaptcha } from '@/components/Captcha';

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
  const cap = useCaptcha();

  if (user) return <Navigate to={destino} replace />;

  const enviar = async (e) => {
    e.preventDefault();
    setErro('');
    if (cap.falta) return setErro('Confirme a verificação "não sou um robô".');
    setEnviando(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: senha, options: cap.extra });
    setEnviando(false);
    cap.nova();
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
        <Captcha {...cap.props} />
        {params.get('link') && (
          <div className="alert" role="status">
            <span>
              O link do e-mail {params.get('link') === 'expirado' ? 'expirou' : 'não vale mais'} (ele vale por 1 hora e só funciona uma vez).
              Se era para trocar a senha, peça outro em <Link to="/recuperar-senha">Esqueci a senha</Link>. Se era para confirmar o e-mail, digite o e-mail acima e use “Reenviar e-mail de confirmação”.
            </span>
          </div>
        )}
        {erro && <p className="error-text" role="alert">{erro}</p>}
        {(/confirme seu e-mail/i.test(erro) || params.get('link')) && <ReenviarConfirmacao email={email.trim().toLowerCase()} destino={destino} />}
        <button className="btn btn-primary btn-lg btn-block" disabled={enviando}>
          {enviando ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </AuthLayout>
  );
}
