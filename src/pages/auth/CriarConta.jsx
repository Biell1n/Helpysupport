import { useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { MailCheck } from 'lucide-react';
import { lembrarAceite, TERMOS_VERSAO } from '@/lib/termos';
import { resolverProva } from '@/lib/prova';
import { erroAuth } from '@/lib/erroAuth';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { destinoSeguro, ehVisitante } from '@/lib/destino';
import AuthLayout from './AuthLayout';
import GoogleBotao from './GoogleBotao';
import ReenviarConfirmacao from './ReenviarConfirmacao';

export default function CriarConta() {
  const { user } = useAuth();
  const [f, setF] = useState({ nome: '', empresa: '', email: '', senha: '' });
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  const [aceite, setAceite] = useState(false);
  // "não sou um robô": prova de trabalho sobre o e-mail, conferida pelo banco no cadastro
  const [robo, setRobo] = useState({ estado: 'nao', prova: null, email: '' });
  const [params] = useSearchParams();
  const destino = destinoSeguro(params.get('de'));
  const deQuery = destino === '/painel' ? '' : `?de=${encodeURIComponent(destino)}`;
  // funcionário só pelo link de convite; quem vem do chat de uma empresa começa como cliente
  const funcionario = params.get('tipo') === 'funcionario' && destino.startsWith('/convite/');
  const [tipo, setTipo] = useState(() => (funcionario || ehVisitante(destino) ? 'cliente' : 'empresa'));
  const visitante = tipo === 'cliente';

  if (user) return <Navigate to={destino} replace />;
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));

  const provar = async (email) => {
    setRobo({ estado: 'verificando', prova: null, email });
    const prova = await resolverProva(email);
    setRobo({ estado: 'ok', prova, email });
    return prova;
  };

  const marcarRobo = (e) => {
    if (!e.target.checked) return setRobo({ estado: 'nao', prova: null, email: '' });
    const email = f.email.trim().toLowerCase();
    if (!email.includes('@')) {
      setErro('Preencha o e-mail antes de marcar “não sou um robô”.');
      return;
    }
    setErro('');
    provar(email);
  };

  const enviar = async (e) => {
    e.preventDefault();
    setErro('');
    if (f.senha.length < 8) return setErro('A senha precisa de pelo menos 8 caracteres.');
    if (!aceite) return setErro('Para criar a conta, aceite os termos de uso e a política de privacidade.');
    if (robo.estado === 'nao') return setErro('Marque a caixinha “não sou um robô”.');
    setEnviando(true);
    const email = f.email.trim().toLowerCase();
    // e-mail mudou depois da caixinha: refaz a prova com o novo
    const prova = robo.prova && robo.email === email ? robo.prova : await provar(email);
    const { data, error } = await supabase.auth.signUp({
      email,
      password: f.senha,
      options: {
        data: {
          full_name: f.nome.trim().slice(0, 120),
          company_name: visitante ? '' : f.empresa.trim().slice(0, 120),
          termos_versao: TERMOS_VERSAO,
          tipo,
          prova_ts: prova.ts,
          prova_nonce: String(prova.nonce),
        },
        emailRedirectTo: `${window.location.origin}${destino}`,
      },
    });
    setEnviando(false);
    if (error) {
      setRobo({ estado: 'nao', prova: null, email: '' });
      return setErro(
        /already registered/i.test(error.message)
          ? 'Este e-mail já tem conta. Tente entrar.'
          : /database error/i.test(error.message)
          ? 'Não conseguimos confirmar o cadastro. Marque “não sou um robô” de novo e tente outra vez.'
          : erroAuth(error.message),
      );
    }
    // sem sessão = o projeto pede confirmação de e-mail
    if (!data.session) setConfirmar(true);
  };

  if (confirmar) {
    return (
      <AuthLayout>
        <MailCheck size={36} />
        <h1>Confira seu e-mail</h1>
        <p className="muted">
          Mandamos um link de confirmação para <b>{f.email}</b>. {visitante ? 'Clique nele e você volta para a conversa.' : 'Clique nele e você cai direto no painel.'}
        </p>
        <ReenviarConfirmacao email={f.email.trim().toLowerCase()} destino={destino} />
        <Link to={`/entrar${deQuery}`} className="btn btn-ghost btn-block">Voltar para entrar</Link>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <div>
        <h1>{funcionario ? 'Crie sua conta de funcionário' : visitante ? 'Crie sua conta' : 'Comece o teste grátis'}</h1>
        <p className="muted" style={{ marginTop: 6 }}>
          {funcionario
            ? 'Depois de confirmar o e-mail, você entra na equipe pelo mesmo link.'
            : visitante
            ? 'Para falar com a equipe das empresas e acompanhar seus chamados.'
            : '14 dias com tudo liberado.'}{' '}
          Já tem conta?{' '}
          <Link to={`/entrar${deQuery}`}>Entrar</Link>
        </p>
      </div>
      {!funcionario && (
        <div className="tipo-conta" role="radiogroup" aria-label="Tipo de conta">
          <button type="button" role="radio" aria-checked={tipo === 'empresa'} onClick={() => setTipo('empresa')}>
            <b>Sou empresa</b>
            <span>Quero criar um atendente com IA</span>
          </button>
          <button type="button" role="radio" aria-checked={tipo === 'cliente'} onClick={() => setTipo('cliente')}>
            <b>Sou cliente</b>
            <span>Quero falar com uma empresa</span>
          </button>
        </div>
      )}
      <GoogleBotao
        texto="Criar conta com Google"
        destino={destino}
        desativado={!aceite}
        antes={() => lembrarAceite(tipo)}
        dica={aceite ? '' : 'Aceite os termos abaixo para continuar com o Google.'}
      />
      <div className="ou">ou com e-mail</div>
      <form className="stack" onSubmit={enviar}>
        <div className={visitante ? 'stack' : 'grid-2'}>
          <label className="field">
            <span className="label">Seu nome</span>
            <input className="input" autoComplete="name" required value={f.nome} onChange={set('nome')} />
          </label>
          {!visitante && (
            <label className="field">
              <span className="label">Empresa</span>
              <input className="input" autoComplete="organization" value={f.empresa} onChange={set('empresa')} />
            </label>
          )}
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
        <label className="check-linha">
          <input type="checkbox" checked={aceite} onChange={(e) => setAceite(e.target.checked)} />
          <span>
            Li e aceito os <Link to="/termos" target="_blank">termos de uso</Link> e a{' '}
            <Link to="/privacidade" target="_blank">política de privacidade (LGPD)</Link>, e autorizo o tratamento dos meus dados como descrito nelas.
          </span>
        </label>
        <label className="check-robo" data-estado={robo.estado}>
          <input type="checkbox" checked={robo.estado !== 'nao'} disabled={robo.estado === 'verificando'} onChange={marcarRobo} />
          <span>{robo.estado === 'verificando' ? 'Verificando…' : 'Não sou um robô'}</span>
          <small>verificação sem imagens</small>
        </label>
        {erro && <p className="error-text" role="alert">{erro}</p>}
        <button className="btn btn-senha btn-lg btn-block" disabled={enviando || !aceite || robo.estado !== 'ok'}>
          {enviando ? 'Criando…' : 'Criar conta'}
        </button>
      </form>
    </AuthLayout>
  );
}
