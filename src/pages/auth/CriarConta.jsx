import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { MailCheck } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import AuthLayout from './AuthLayout';
import GoogleBotao from './GoogleBotao';

export default function CriarConta() {
  const { user } = useAuth();
  const [f, setF] = useState({ nome: '', empresa: '', email: '', senha: '' });
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [confirmar, setConfirmar] = useState(false);

  if (user) return <Navigate to="/painel" replace />;
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));

  const enviar = async (e) => {
    e.preventDefault();
    setErro('');
    if (f.senha.length < 8) return setErro('A senha precisa de pelo menos 8 caracteres.');
    setEnviando(true);
    const { data, error } = await supabase.auth.signUp({
      email: f.email.trim(),
      password: f.senha,
      options: {
        data: { full_name: f.nome.trim(), company_name: f.empresa.trim() },
        emailRedirectTo: `${window.location.origin}/painel`,
      },
    });
    setEnviando(false);
    if (error) return setErro(/already registered/i.test(error.message) ? 'Este e-mail já tem conta. Tente entrar.' : error.message);
    // sem sessão = o projeto pede confirmação de e-mail
    if (!data.session) setConfirmar(true);
  };

  if (confirmar) {
    return (
      <AuthLayout>
        <MailCheck size={36} />
        <h1>Confira seu e-mail</h1>
        <p className="muted">
          Mandamos um link de confirmação para <b>{f.email}</b>. Clique nele e você cai direto no painel.
        </p>
        <Link to="/entrar" className="btn btn-ghost btn-block">Voltar para entrar</Link>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <div>
        <h1>Comece o teste grátis</h1>
        <p className="muted" style={{ marginTop: 6 }}>
          14 dias com tudo liberado. Já tem conta? <Link to="/entrar">Entrar</Link>
        </p>
      </div>
      <GoogleBotao texto="Criar conta com Google" />
      <div className="ou">ou com e-mail</div>
      <form className="stack" onSubmit={enviar}>
        <div className="grid-2">
          <label className="field">
            <span className="label">Seu nome</span>
            <input className="input" autoComplete="name" required value={f.nome} onChange={set('nome')} />
          </label>
          <label className="field">
            <span className="label">Empresa</span>
            <input className="input" autoComplete="organization" value={f.empresa} onChange={set('empresa')} />
          </label>
        </div>
        <label className="field">
          <span className="label">E-mail</span>
          <input className="input" type="email" autoComplete="email" required value={f.email} onChange={set('email')} />
        </label>
        <label className="field">
          <span className="label">Senha</span>
          <input className="input" type="password" autoComplete="new-password" required minLength={8} value={f.senha} onChange={set('senha')} />
          <span className="hint">Pelo menos 8 caracteres.</span>
        </label>
        {erro && <p className="error-text" role="alert">{erro}</p>}
        <button className="btn btn-senha btn-lg btn-block" disabled={enviando}>
          {enviando ? 'Criando…' : 'Criar conta'}
        </button>
        <p className="faint" style={{ fontSize: 12.5 }}>
          Ao criar a conta você concorda com os <Link to="/termos">termos</Link> e a <Link to="/privacidade">política de privacidade</Link>.
        </p>
      </form>
    </AuthLayout>
  );
}
