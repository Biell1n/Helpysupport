import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { MessagesSquare } from 'lucide-react';
import { chamar } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/Toasts';
import { numero } from '@/lib/format';

const SITUACAO = {
  bot: ['Conversando com o assistente', 'badge-bot'],
  waiting: ['Chamado aberto, aguardando a equipe', 'badge-waiting'],
  human: ['A equipe está respondendo', 'badge-human'],
  closed: ['Encerrado', 'badge-closed'],
};

/** Início de quem é cliente: os atendimentos que abriu logado, em qualquer empresa. */
export default function MinhasConversas() {
  const { reloadProfile } = useAuth();
  const avisar = useToast();
  const navigate = useNavigate();
  const [conversas, setConversas] = useState(null);
  const [virando, setVirando] = useState(false);

  useEffect(() => {
    chamar('conta', { action: 'minhas_conversas' })
      .then((d) => setConversas(d.conversas))
      .catch(() => setConversas([]));
  }, []);

  const virarEmpresa = async () => {
    if (!window.confirm('Criar um atendente para a sua empresa? Sua conta passa a ser de empresa, com 14 dias de teste grátis.')) return;
    setVirando(true);
    try {
      await chamar('conta', { action: 'virar_empresa' });
      await reloadProfile();
      navigate('/painel/assistentes/novo');
    } catch (e) {
      avisar('Não deu certo', { erro: true, texto: e.message });
    } finally {
      setVirando(false);
    }
  };

  return (
    <div className="page" style={{ maxWidth: 820 }}>
      <header className="page-head">
        <div>
          <h1>Minhas conversas</h1>
          <p>Os atendimentos que você abriu com a conta conectada. Toque para continuar de onde parou.</p>
        </div>
      </header>

      {conversas === null ? (
        <p className="muted">Carregando…</p>
      ) : conversas.length === 0 ? (
        <div className="card stack" style={{ alignItems: 'flex-start' }}>
          <MessagesSquare />
          <b>Nenhuma conversa ainda</b>
          <p className="muted" style={{ fontSize: 14 }}>Quando você conversar com o atendente de uma empresa estando conectado, a conversa aparece aqui.</p>
        </div>
      ) : (
        <ul className="stack" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {conversas.map((c) => {
            const [rotulo, classe] = SITUACAO[c.status] ?? SITUACAO.bot;
            const conteudo = (
              <>
                <div className="row" style={{ justifyContent: 'space-between', gap: 12 }}>
                  <b>{c.assistente}</b>
                  {c.numero && <span className="badge badge-plain mono">{numero(c.numero)}</span>}
                </div>
                <span style={{ fontSize: 14 }}>{c.titulo || 'Conversa'}</span>
                <div className="row" style={{ justifyContent: 'space-between', gap: 12 }}>
                  <span className={`badge ${classe}`}>{rotulo}</span>
                  <span className="faint" style={{ fontSize: 12.5 }}>{new Date(c.ultima).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</span>
                </div>
              </>
            );
            return (
              <li key={c.id}>
                {c.token ? (
                  <Link className="card stack stack-sm" style={{ textDecoration: 'none', color: 'inherit' }} to={`/c/${c.token}?conversa=${c.id}`}>{conteudo}</Link>
                ) : (
                  <div className="card stack stack-sm" title="O atendimento desta empresa está desligado no momento">{conteudo}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <section className="card stack" style={{ marginTop: 24 }}>
        <b>Tem um negócio?</b>
        <p className="muted" style={{ fontSize: 14 }}>Crie um atendente com IA que responde seus clientes 24 horas, marca horários e chama a sua equipe quando precisa.</p>
        <div><button type="button" className="btn btn-primary" disabled={virando} onClick={virarEmpresa}>Quero criar um atendente</button></div>
      </section>
    </div>
  );
}
