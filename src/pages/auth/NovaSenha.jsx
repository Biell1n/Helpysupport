import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import AuthLayout from './AuthLayout';

/** O link do e-mail traz a sessão de recuperação; aqui só se troca a senha. */
export default function NovaSenha() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');

  const enviar = async (e) => {
    e.preventDefault();
    if (senha.length < 8) return setErro('A senha precisa de pelo menos 8 caracteres.');
    const { error } = await supabase.auth.updateUser({ password: senha });
    if (error) return setErro(error.message);
    navigate('/painel', { replace: true });
  };

  return (
    <AuthLayout>
      <h1>Nova senha</h1>
      {!loading && !user ? (
        <p className="muted">Este link expirou ou já foi usado. Peça outro em “Esqueci a senha”.</p>
      ) : (
        <form className="stack" onSubmit={enviar}>
          <label className="field">
            <span className="label">Senha nova</span>
            <input className="input" type="password" autoComplete="new-password" required value={senha} onChange={(e) => setSenha(e.target.value)} />
          </label>
          {erro && <p className="error-text" role="alert">{erro}</p>}
          <button className="btn btn-primary btn-lg btn-block">Salvar senha</button>
        </form>
      )}
    </AuthLayout>
  );
}
