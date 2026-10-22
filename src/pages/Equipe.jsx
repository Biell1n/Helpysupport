import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Copy, Link2, Minus, Plus, Trash2, UserMinus } from 'lucide-react';
import { chamar } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/Toasts';
import { reais } from '@/lib/plans';
import { usePrecos } from '@/lib/precos';

/** Vagas além das do plano: entram na mensalidade a partir da próxima fatura. */
function VagasExtras({ vagas, onMudou }) {
  const avisar = useToast();
  const { profile, reloadProfile } = useAuth();
  const { vaga } = usePrecos();
  const [quero, setQuero] = useState(vagas.extra);
  const [salvando, setSalvando] = useState(false);
  useEffect(() => setQuero(vagas.extra), [vagas.extra]);
  const minimo = Math.max(0, vagas.membros + vagas.pendentes - vagas.incluidos);

  if (profile?.plan === 'trial') {
    return (
      <section className="card stack" style={{ marginBottom: 16 }}>
        <h2 className="card-title">Vagas extras</h2>
        <p className="muted" style={{ margin: 0, fontSize: 14 }}>
          Nos planos pagos dá para pôr mais gente na equipe por {reais(vaga)}/mês cada. <Link to="/painel/plano">Ver planos</Link>
        </p>
      </section>
    );
  }

  const salvar = async () => {
    setSalvando(true);
    try {
      const r = await chamar('pagamentos', { action: 'vagas', quantidade: quero });
      await reloadProfile?.();
      await onMudou();
      avisar(quero > vagas.extra ? 'Vagas adicionadas' : 'Vagas atualizadas', {
        texto: r.isenta
          ? 'Conta de teste: sem cobrança.'
          : r.ciclo === 'anual'
            ? `A anuidade passa a ser ${reais(r.valor)} na renovação.${r.agora ? ` Os meses que faltam até lá (${reais(r.agora)}) vêm numa fatura agora, em Plano.` : ''}`
            : `A mensalidade passa a ser ${reais(r.valor)} a partir da próxima fatura.`,
      });
    } catch (e) {
      avisar('Não deu para mudar as vagas', { erro: true, texto: e.message });
    } finally {
      setSalvando(false);
    }
  };

  return (
    <section className="card stack" style={{ marginBottom: 16 }}>
      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 className="card-title" style={{ margin: 0 }}>Vagas extras</h2>
          <p className="muted" style={{ margin: '4px 0 0', fontSize: 14 }}>
            {vagas.incluidos} no plano. Cada vaga a mais custa {reais(vaga)}/mês e entra na mensalidade.
          </p>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <button type="button" className="btn btn-ghost btn-sm" aria-label="Uma vaga a menos" disabled={salvando || quero <= minimo} onClick={() => setQuero((q) => q - 1)}>
            <Minus size={16} />
          </button>
          <b className="num" style={{ minWidth: 28, textAlign: 'center' }}>{quero}</b>
          <button type="button" className="btn btn-ghost btn-sm" aria-label="Uma vaga a mais" disabled={salvando || quero >= 50} onClick={() => setQuero((q) => q + 1)}>
            <Plus size={16} />
          </button>
        </div>
      </div>
      {quero !== vagas.extra && (
        <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <span className="faint" style={{ fontSize: 14 }}>
            {quero ? `${quero} ${quero === 1 ? 'vaga extra' : 'vagas extras'}: ${reais(quero * vaga)}/mês` : 'Sem vagas extras'}
          </span>
          <button type="button" className="btn btn-primary btn-sm" disabled={salvando} onClick={salvar}>
            {salvando ? 'Salvando…' : 'Confirmar'}
          </button>
        </div>
      )}
    </section>
  );
}

/** Funcionários da empresa: entram só por link de convite, um por pessoa. */
export default function Equipe() {
  const avisar = useToast();
  const [d, setD] = useState(null);
  const [ocupado, setOcupado] = useState(false);

  const carregar = useCallback(() => chamar('conta', { action: 'equipe' }).then(setD).catch((e) => avisar('Não deu para carregar', { erro: true, texto: e.message })), [avisar]);
  useEffect(() => {
    carregar();
  }, [carregar]);

  const link = (token) => `${window.location.origin}/convite/${token}`;

  const copiar = async (token) => {
    try {
      await navigator.clipboard.writeText(link(token));
      avisar('Link copiado', { texto: 'Mande para o funcionário. Vale por 7 dias e para uma pessoa só.' });
    } catch {
      window.prompt('Copie o link:', link(token));
    }
  };

  const acao = async (action, extra, ok) => {
    setOcupado(true);
    try {
      const r = await chamar('conta', { action, ...extra });
      await carregar();
      if (ok) ok(r);
    } catch (e) {
      avisar('Não deu certo', { erro: true, texto: e.message });
    } finally {
      setOcupado(false);
    }
  };

  const vagas = d?.vagas;
  const cheia = vagas && vagas.membros + vagas.pendentes >= vagas.limite;

  return (
    <div className="page" style={{ maxWidth: 820 }}>
      <header className="page-head">
        <div>
          <h1>Equipe</h1>
          <p>Funcionários atendem os chamados e veem a agenda. Não mexem em assistentes, dados nem plano.</p>
        </div>
        <button type="button" className="btn btn-primary" disabled={!d || cheia || ocupado} onClick={() => acao('convite_criar', {}, (r) => copiar(r.token))}>
          <Link2 size={16} /> Gerar link de convite
        </button>
      </header>

      {vagas && (
        <p className="muted" style={{ marginBottom: 16, fontSize: 14 }}>
          {vagas.membros} de {vagas.limite} funcionário{vagas.limite > 1 ? 's' : ''} no plano {vagas.plano}
          {vagas.pendentes ? ` · ${vagas.pendentes} convite${vagas.pendentes > 1 ? 's' : ''} aguardando` : ''}
          {vagas.extra ? ` (${vagas.extra} extra${vagas.extra > 1 ? 's' : ''})` : ''}
        </p>
      )}
      {cheia && (
        <div className="alert" style={{ marginBottom: 16 }}>
          <span>Equipe cheia. Para convidar mais alguém, adicione uma vaga extra aqui embaixo.</span>
        </div>
      )}
      {vagas && <VagasExtras vagas={vagas} onMudou={carregar} />}

      <section className="card stack" style={{ marginBottom: 16 }}>
        <h2 className="card-title">Pessoas</h2>
        {!d ? (
          <p className="muted">Carregando…</p>
        ) : d.membros.length === 0 ? (
          <p className="muted" style={{ fontSize: 14 }}>Ninguém ainda. Gere um link e mande para o funcionário: ele cria a conta por ele.</p>
        ) : (
          d.membros.map((m) => (
            <div key={m.user_id} className="row" style={{ justifyContent: 'space-between', gap: 12 }}>
              <div>
                <b>{m.nome || m.email}</b>
                <div className="faint" style={{ fontSize: 13 }}>{m.email} · desde {new Date(m.criado_em).toLocaleDateString('pt-BR')}</div>
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={ocupado}
                onClick={() => window.confirm(`Tirar ${m.nome || m.email} da equipe? Ele perde o acesso na hora.`) && acao('equipe_remover', { user_id: m.user_id })}
              >
                <UserMinus size={15} /> Remover
              </button>
            </div>
          ))
        )}
      </section>

      {d?.convites?.length > 0 && (
        <section className="card stack">
          <h2 className="card-title">Convites aguardando</h2>
          {d.convites.map((c) => (
            <div key={c.token} className="row" style={{ justifyContent: 'space-between', gap: 12 }}>
              <span className="faint" style={{ fontSize: 13 }}>Vale até {new Date(c.expira_em).toLocaleDateString('pt-BR')}</span>
              <div className="row" style={{ gap: 8 }}>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => copiar(c.token)}><Copy size={15} /> Copiar link</button>
                <button type="button" className="btn btn-ghost btn-sm" disabled={ocupado} onClick={() => acao('convite_cancelar', { token: c.token })}>
                  <Trash2 size={15} /> Cancelar
                </button>
              </div>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
