import { useCallback, useEffect, useState } from 'react';
import { Copy, Link2, Trash2, UserMinus } from 'lucide-react';
import { chamar } from '@/lib/supabase';
import { useToast } from '@/components/Toasts';

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
          {cheia ? ' · para chamar mais gente, mude de plano.' : ''}
        </p>
      )}

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
