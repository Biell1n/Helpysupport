import { useCallback, useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/Toasts';
import AuthLayout from '@/pages/auth/AuthLayout';

const soDigitos = (v) => v.replace(/\D/g, '').slice(0, 6);

/** O Supabase manda o QR como SVG cru na URL; codificado, abre em qualquer navegador. */
const qrSeguro = (qr = '') => {
  const i = qr.indexOf(',');
  return qr.startsWith('data:image/svg+xml') && !qr.includes(';base64,')
    ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(qr.slice(i + 1))}`
    : qr;
};

/** Chave em blocos de 4, mais fácil de digitar no app. */
const emBlocos = (s = '') => s.replace(/(.{4})/g, '$1 ').trim();

const traduz = (m = '') =>
  /invalid totp|invalid code|expired/i.test(m) ? 'Código errado ou vencido. Confira o app e tente de novo.' : m;

function CampoCodigo({ valor, onChange, autoFocus }) {
  return (
    <input
      className="input mono"
      style={{ fontSize: 22, letterSpacing: '0.3em', textAlign: 'center', maxWidth: 220 }}
      inputMode="numeric"
      autoComplete="one-time-code"
      placeholder="000000"
      aria-label="Código de 6 dígitos"
      autoFocus={autoFocus}
      value={valor}
      onChange={(e) => onChange(soDigitos(e.target.value))}
    />
  );
}

/** Tela depois da senha (ou do Google) para quem ativou duas etapas. */
export function VerificarCodigo() {
  const { signOut, recarregarNivel } = useAuth();
  const [codigo, setCodigo] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  const verificar = async (e) => {
    e.preventDefault();
    setErro('');
    setEnviando(true);
    try {
      const { data: f, error: e1 } = await supabase.auth.mfa.listFactors();
      if (e1) throw e1;
      const fator = f.totp.find((x) => x.status === 'verified');
      if (!fator) throw new Error('Nenhum app autenticador ligado a esta conta.');
      const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: fator.id, code: codigo });
      if (error) throw error;
      await recarregarNivel();
    } catch (err) {
      setErro(traduz(err.message));
      setCodigo('');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <AuthLayout>
      <ShieldCheck size={36} />
      <div>
        <h1>Verificação em duas etapas</h1>
        <p className="muted" style={{ marginTop: 6 }}>Abra o app autenticador (Google Authenticator, Authy…) e digite o código do Helpy.</p>
      </div>
      <form className="stack" onSubmit={verificar}>
        <CampoCodigo valor={codigo} onChange={setCodigo} autoFocus />
        {erro && <p className="error-text" role="alert">{erro}</p>}
        <button className="btn btn-primary btn-lg btn-block" disabled={codigo.length !== 6 || enviando}>
          {enviando ? 'Conferindo…' : 'Confirmar'}
        </button>
        <button type="button" className="btn btn-ghost btn-block" onClick={signOut}>Sair e entrar com outra conta</button>
      </form>
    </AuthLayout>
  );
}

/** Cartão da página Conta: ativar e desativar o app autenticador. */
export function PainelDuasEtapas() {
  const avisar = useToast();
  const { recarregarNivel } = useAuth();
  const [ativo, setAtivo] = useState(null); // null = carregando
  const [novo, setNovo] = useState(null); // { id, qr, segredo }
  const [codigo, setCodigo] = useState('');
  const [ocupado, setOcupado] = useState(false);

  const carregar = useCallback(async () => {
    const { data } = await supabase.auth.mfa.listFactors();
    setAtivo(data?.totp?.find((x) => x.status === 'verified') ?? false);
    return data;
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const comecar = async () => {
    setOcupado(true);
    try {
      // tentativa anterior que ficou pela metade atrapalha o cadastro
      const { data } = await supabase.auth.mfa.listFactors();
      for (const f of data?.all ?? []) {
        if (f.status !== 'verified') await supabase.auth.mfa.unenroll({ factorId: f.id });
      }
      const { data: d, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: `Helpy ${new Date().toISOString().slice(0, 16)}` });
      if (error) throw error;
      setNovo({ id: d.id, qr: qrSeguro(d.totp.qr_code), segredo: d.totp.secret });
      setCodigo('');
    } catch (e) {
      avisar('Não deu para começar', { erro: true, texto: e.message });
    } finally {
      setOcupado(false);
    }
  };

  const confirmar = async (e) => {
    e.preventDefault();
    setOcupado(true);
    try {
      const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: novo.id, code: codigo });
      if (error) throw error;
      setNovo(null);
      await carregar();
      await recarregarNivel();
      avisar('Verificação em duas etapas ativada');
    } catch (err) {
      avisar('Código não confere', { erro: true, texto: traduz(err.message) });
      setCodigo('');
    } finally {
      setOcupado(false);
    }
  };

  const desativar = async () => {
    if (!window.confirm('Desativar a verificação em duas etapas? A conta fica protegida só pela senha.')) return;
    setOcupado(true);
    const { error } = await supabase.auth.mfa.unenroll({ factorId: ativo.id });
    setOcupado(false);
    if (error) return avisar('Não deu para desativar', { erro: true, texto: error.message });
    await carregar();
    await recarregarNivel();
    avisar('Verificação em duas etapas desativada');
  };

  return (
    <section className="card stack" style={{ marginBottom: 16 }}>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h2 className="card-title">Verificação em duas etapas</h2>
          <p className="muted" style={{ fontSize: 14, marginTop: 4 }}>
            Além da senha, pede um código do app autenticador do seu celular. Mesmo que alguém descubra a senha, não entra.
          </p>
        </div>
        {ativo && <span className="badge badge-human">Ativa</span>}
      </div>

      {ativo === false && !novo && (
        <div><button type="button" className="btn btn-primary" disabled={ocupado} onClick={comecar}>Ativar</button></div>
      )}

      {novo && (
        <form className="stack" onSubmit={confirmar}>
          <ol className="stack" style={{ paddingLeft: 18, fontSize: 14, gap: 6 }}>
            <li>Instale um app autenticador (Google Authenticator, Microsoft Authenticator, Authy).</li>
            <li>No app, escaneie o código abaixo. Sem câmera? Digite a chave.</li>
            <li>Digite o código de 6 dígitos que aparecer.</li>
          </ol>
          <div className="row row-wrap" style={{ gap: 20, alignItems: 'center' }}>
            <img src={novo.qr} alt="QR code para o app autenticador" width={168} height={168} style={{ background: '#fff', borderRadius: 12, padding: 8 }} />
            <div className="stack" style={{ gap: 8 }}>
              <span className="label">Chave</span>
              <code className="mono" style={{ fontSize: 13, maxWidth: 260, lineHeight: 1.6 }}>{emBlocos(novo.segredo)}</code>
              <CampoCodigo valor={codigo} onChange={setCodigo} />
            </div>
          </div>
          <div className="row row-wrap">
            <button className="btn btn-primary" disabled={codigo.length !== 6 || ocupado}>Confirmar e ativar</button>
            <button type="button" className="btn btn-ghost" onClick={() => setNovo(null)}>Cancelar</button>
          </div>
        </form>
      )}

      {ativo && (
        <div><button type="button" className="btn btn-ghost" disabled={ocupado} onClick={desativar}>Desativar</button></div>
      )}
    </section>
  );
}
