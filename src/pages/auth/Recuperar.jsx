import { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { erroAuth } from '@/lib/erroAuth';
import AuthLayout from './AuthLayout';

export default function Recuperar() {
  const [email, setEmail] = useState('');
  const [enviado, setEnviado] = useState(false);
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  const enviar = async (e) => {
    e.preventDefault();
    setErro('');
    setEnviando(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: `${window.location.origin}/nova-senha`,
    });
    setEnviando(false);
    if (error) return setErro(erroAuth(error.message));
    setEnviado(true);
  };

  return (
    <AuthLayout>
      <h1>Recuperar a senha</h1>
      {enviado ? (
        <>
          <p className="muted">
            Se existir uma conta com <b>{email}</b>, o link para criar uma senha nova já está a caminho. Confira também o spam. O link vale por 1 hora.
          </p>
          <Link to="/entrar" className="btn btn-ghost btn-block">Voltar para entrar</Link>
        </>
      ) : (
        <form className="stack" onSubmit={enviar}>
          <p className="muted">Mandamos um link para você criar uma senha nova.</p>
          <label className="field">
            <span className="label">E-mail</span>
            <input className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          {erro && <p className="error-text" role="alert">{erro}</p>}
          <button className="btn btn-primary btn-lg btn-block" disabled={enviando}>{enviando ? 'Enviando…' : 'Enviar link'}</button>
          <Link to="/entrar" style={{ fontSize: 14 }}>Lembrei a senha</Link>
        </form>
      )}
    </AuthLayout>
  );
}
