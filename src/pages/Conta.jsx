import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/Toasts';

export default function Conta() {
  const { user, profile, reloadProfile, signOut } = useAuth();
  const avisar = useToast();
  const [f, setF] = useState({ full_name: '', company_name: '', phone: '' });
  const [senha, setSenha] = useState('');

  useEffect(() => {
    if (profile) setF({ full_name: profile.full_name ?? '', company_name: profile.company_name ?? '', phone: profile.phone ?? '' });
  }, [profile]);

  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));

  const salvar = async (e) => {
    e.preventDefault();
    const { error } = await supabase.from('profiles').update(f).eq('id', user.id);
    if (error) return avisar('Não deu para salvar', { erro: true, texto: error.message });
    await reloadProfile();
    avisar('Dados salvos');
  };

  const trocarSenha = async (e) => {
    e.preventDefault();
    if (senha.length < 8) return avisar('Senha curta', { erro: true, texto: 'Use pelo menos 8 caracteres.' });
    const { error } = await supabase.auth.updateUser({ password: senha });
    if (error) return avisar('Não deu para trocar a senha', { erro: true, texto: error.message });
    setSenha('');
    avisar('Senha trocada');
  };

  return (
    <div className="page" style={{ maxWidth: 760 }}>
      <header className="page-head">
        <div>
          <h1>Sua conta</h1>
          <p>{user?.email}</p>
        </div>
        <button type="button" className="btn btn-ghost" onClick={signOut}>Sair</button>
      </header>

      <form className="card stack" onSubmit={salvar} style={{ marginBottom: 16 }}>
        <h2 className="card-title">Dados</h2>
        <div className="grid-2">
          <label className="field">
            <span className="label">Seu nome</span>
            <input className="input" value={f.full_name} onChange={set('full_name')} />
            <span className="hint">É o nome que o cliente vê quando você responde um chamado.</span>
          </label>
          <label className="field">
            <span className="label">Empresa</span>
            <input className="input" value={f.company_name} onChange={set('company_name')} />
          </label>
          <label className="field">
            <span className="label">Telefone</span>
            <input className="input" value={f.phone} onChange={set('phone')} />
          </label>
        </div>
        <div><button className="btn btn-primary">Salvar dados</button></div>
      </form>

      <form className="card stack" onSubmit={trocarSenha}>
        <h2 className="card-title">Senha</h2>
        <label className="field" style={{ maxWidth: 360 }}>
          <span className="label">Senha nova</span>
          <input className="input" type="password" autoComplete="new-password" value={senha} onChange={(e) => setSenha(e.target.value)} />
        </label>
        <div><button className="btn btn-ghost" disabled={!senha}>Trocar senha</button></div>
      </form>
    </div>
  );
}
