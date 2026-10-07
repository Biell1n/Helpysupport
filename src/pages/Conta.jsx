import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { chamar, supabase } from '@/lib/supabase';
import { PainelDuasEtapas } from '@/components/DuasEtapas';
import { erroAuth } from '@/lib/erroAuth';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/Toasts';

export default function Conta() {
  const { user, profile, reloadProfile, signOut, tipo } = useAuth();
  const avisar = useToast();
  const [f, setF] = useState({ full_name: '', company_name: '', phone: '' });
  const [senha, setSenha] = useState('');
  const [atual, setAtual] = useState('');
  // conta criada só pelo Google não tem senha para conferir
  const temSenha = (user?.app_metadata?.providers ?? [user?.app_metadata?.provider]).includes('email');

  useEffect(() => {
    if (profile) setF({ full_name: profile.full_name ?? '', company_name: profile.company_name ?? '', phone: profile.phone ?? '' });
  }, [profile]);

  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));

  const salvar = async (e) => {
    e.preventDefault();
    const limpo = {
      full_name: f.full_name.trim().slice(0, 120),
      company_name: f.company_name.trim().slice(0, 120),
      phone: f.phone.trim().slice(0, 40),
    };
    const { error } = await supabase.from('profiles').update(limpo).eq('id', user.id);
    if (error) return avisar('Não deu para salvar', { erro: true, texto: error.message });
    await reloadProfile();
    avisar('Dados salvos');
  };

  const trocarSenha = async (e) => {
    e.preventDefault();
    if (senha.length < 8) return avisar('Senha curta', { erro: true, texto: 'Use pelo menos 8 caracteres.' });
    if (temSenha) {
      // confere a senha atual num cliente à parte, sem mexer na sessão aberta
      const teste = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY, {
        auth: { persistSession: false, autoRefreshToken: false, storageKey: 'helpy-confere-senha' },
      });
      const { error: errAtual } = await teste.auth.signInWithPassword({ email: user.email, password: atual });
      if (errAtual) return avisar('Senha atual incorreta', { erro: true });
      await teste.auth.signOut({ scope: 'local' });
    }
    const { error } = await supabase.auth.updateUser({ password: senha });
    if (error) return avisar('Não deu para trocar a senha', { erro: true, texto: erroAuth(error.message) });
    setSenha('');
    setAtual('');
    avisar('Senha trocada');
  };

  const [excluir, setExcluir] = useState({ aberto: false, senha: '', texto: '', ocupado: false });
  const excluirConta = async (e) => {
    e.preventDefault();
    setExcluir((x) => ({ ...x, ocupado: true }));
    try {
      await chamar('conta', { action: 'excluir', senha: excluir.senha, confirmacao: excluir.texto });
      await supabase.auth.signOut({ scope: 'local' });
      window.location.assign('/');
    } catch (err) {
      setExcluir((x) => ({ ...x, ocupado: false }));
      avisar('Não deu para excluir', { erro: true, texto: err.message });
    }
  };

  const sairDeTudo = async () => {
    if (!window.confirm('Sair desta conta em todos os aparelhos, inclusive este?')) return;
    await supabase.auth.signOut({ scope: 'global' });
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
            <input className="input" maxLength={120} autoComplete="name" value={f.full_name} onChange={set('full_name')} />
            <span className="hint">É o nome que o cliente vê quando você responde um chamado.</span>
          </label>
          <label className="field">
            <span className="label">Empresa</span>
            <input className="input" maxLength={120} autoComplete="organization" value={f.company_name} onChange={set('company_name')} />
          </label>
          <label className="field">
            <span className="label">Telefone</span>
            <input className="input" type="tel" maxLength={40} autoComplete="tel" value={f.phone} onChange={set('phone')} />
          </label>
        </div>
        <div><button className="btn btn-primary">Salvar dados</button></div>
      </form>

      <form className="card stack" onSubmit={trocarSenha} style={{ marginBottom: 16 }}>
        <h2 className="card-title">{temSenha ? 'Senha' : 'Criar uma senha'}</h2>
        <div className="grid-2">
          {temSenha && (
            <label className="field">
              <span className="label">Senha atual</span>
              <input className="input" type="password" autoComplete="current-password" value={atual} onChange={(e) => setAtual(e.target.value)} />
            </label>
          )}
          <label className="field">
            <span className="label">Senha nova</span>
            <input className="input" type="password" autoComplete="new-password" minLength={8} value={senha} onChange={(e) => setSenha(e.target.value)} />
            <span className="hint">Pelo menos 8 caracteres. Evite senhas que você usa em outros sites.</span>
          </label>
        </div>
        <div><button className="btn btn-ghost" disabled={!senha || (temSenha && !atual)}>Trocar senha</button></div>
      </form>

      <PainelDuasEtapas />

      <section className="card stack">
        <h2 className="card-title">Aparelhos</h2>
        <p className="muted" style={{ fontSize: 14 }}>Esqueceu a conta aberta em outro computador ou acha que alguém entrou? Encerre todas as sessões.</p>
        <div><button type="button" className="btn btn-ghost" onClick={sairDeTudo}>Sair de todos os aparelhos</button></div>
      </section>

      <section className="card stack" style={{ marginTop: 16, borderColor: 'var(--brasa)' }}>
        <h2 className="card-title">Excluir minha conta</h2>
        <p className="muted" style={{ fontSize: 14 }}>
          {tipo === 'empresa'
            ? 'Apaga para sempre a conta, os assistentes, as tabelas, as conversas, a agenda e as chaves de integração. Os funcionários perdem o acesso. Não dá para desfazer.'
            : 'Apaga para sempre a sua conta e os seus dados. Não dá para desfazer.'}
        </p>
        {!excluir.aberto ? (
          <div><button type="button" className="btn btn-danger" onClick={() => setExcluir((x) => ({ ...x, aberto: true }))}>Quero excluir minha conta</button></div>
        ) : (
          <form className="stack" onSubmit={excluirConta}>
            {temSenha ? (
              <label className="field" style={{ maxWidth: 360 }}>
                <span className="label">Digite sua senha para confirmar</span>
                <input className="input" type="password" autoComplete="current-password" required value={excluir.senha} onChange={(e) => setExcluir((x) => ({ ...x, senha: e.target.value }))} />
              </label>
            ) : (
              <label className="field" style={{ maxWidth: 360 }}>
                <span className="label">Digite EXCLUIR para confirmar</span>
                <input className="input" required value={excluir.texto} onChange={(e) => setExcluir((x) => ({ ...x, texto: e.target.value }))} />
              </label>
            )}
            <div className="row row-wrap">
              <button className="btn btn-danger" disabled={excluir.ocupado}>{excluir.ocupado ? 'Excluindo…' : 'Excluir para sempre'}</button>
              <button type="button" className="btn btn-ghost" onClick={() => setExcluir({ aberto: false, senha: '', texto: '', ocupado: false })}>Cancelar</button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
