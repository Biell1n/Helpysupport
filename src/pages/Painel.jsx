import { useEffect, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { ArrowRight, Bot, Check, Plus, Sparkles } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { diasDeTeste, planOf } from '@/lib/plans';
import { numero, quando, STATUS } from '@/lib/format';

const saudacao = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
};

export default function Painel() {
  const { uso } = useOutletContext();
  const { user, profile, nome } = useAuth();
  const plano = planOf(profile);
  const dias = diasDeTeste(profile);

  const [assistentes, setAssistentes] = useState(null);
  const [fila, setFila] = useState([]);
  const [lacunas, setLacunas] = useState([]);
  const [proximos, setProximos] = useState([]);
  const [nota, setNota] = useState(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const [a, f, l, p, n] = await Promise.all([
        supabase.from('assistants').select('id, name, business_type, is_public, public_token').order('created_at'),
        supabase
          .from('conversations')
          .select('id, numero, titulo, motivo, status, lead_nome, last_message_at, prioridade')
          .eq('teste', false)
          .in('status', ['waiting', 'human'])
          .order('last_message_at', { ascending: false })
          .limit(5),
        supabase.from('assistant_gaps').select('id, assunto, pergunta, vezes, assistant_id').eq('resolvida', false).order('vezes', { ascending: false }).limit(5),
        supabase
          .from('agendamentos')
          .select('id, cliente_nome, servico, inicio, origem')
          .eq('status', 'confirmado')
          .gte('inicio', new Date().toISOString())
          .order('inicio')
          .limit(5),
        supabase.from('conversations').select('nota').not('nota', 'is', null).gte('created_at', new Date(Date.now() - 30 * 864e5).toISOString()),
      ]);
      setAssistentes(a.data ?? []);
      setFila(f.data ?? []);
      setLacunas(l.data ?? []);
      setProximos(p.data ?? []);
      const notas = (n.data ?? []).map((x) => Number(x.nota)).filter((x) => x >= 1 && x <= 5);
      setNota(notas.length ? { media: notas.reduce((s, x) => s + x, 0) / notas.length, total: notas.length } : null);
    })();
  }, [user]);

  const resolverLacuna = async (id) => {
    await supabase.from('assistant_gaps').update({ resolvida: true }).eq('id', id);
    setLacunas((p) => p.filter((x) => x.id !== id));
  };

  const primeiroNome = (nome || '').split(' ')[0];

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>
            {saudacao()}
            {primeiroNome ? `, ${primeiroNome}` : ''}.
          </h1>
          <p>
            {fila.length
              ? `${fila.length === 1 ? 'Um chamado espera' : `${fila.length} chamados esperam`} por você.`
              : 'Nenhum chamado esperando. O atendimento está em dia.'}
          </p>
        </div>
        <Link to="/painel/assistentes/novo" className="btn btn-primary">
          <Plus /> Novo assistente
        </Link>
      </header>

      {dias != null && (
        <div className={`alert ${dias <= 0 ? 'alert-erro' : ''}`} style={{ marginBottom: 20 }}>
          <Sparkles />
          <span>
            {dias > 0
              ? `Seu teste grátis termina em ${dias} ${dias === 1 ? 'dia' : 'dias'}. `
              : 'Seu teste grátis terminou: o atendente só está anotando recados. '}
            <Link to="/painel/plano">Escolher um plano</Link>
          </span>
        </div>
      )}

      {assistentes && assistentes.length === 0 ? (
        <div className="empty" style={{ marginBottom: 24 }}>
          <Bot size={32} />
          <h3>Vamos montar o seu primeiro atendente</h3>
          <p>Conte como o seu negócio funciona. Em poucos minutos você tem um link de atendimento para divulgar.</p>
          <Link to="/painel/assistentes/novo" className="btn btn-senha btn-lg">
            Começar agora <ArrowRight />
          </Link>
        </div>
      ) : null}

      <section className="grid-3" style={{ marginBottom: 16 }}>
        <div className="card kpi">
          <span className="eyebrow">Atendimentos no mês</span>
          <span className="kpi-valor">
            {uso?.atendimentos ?? '—'} <small>de {plano.atendimentos}</small>
          </span>
          <div className="meter" data-nivel={(uso?.atendimentos ?? 0) / plano.atendimentos >= 0.85 ? 'alto' : undefined} style={{ marginTop: 8 }}>
            <span style={{ width: `${Math.min(100, ((uso?.atendimentos ?? 0) / plano.atendimentos) * 100)}%` }} />
          </div>
        </div>
        <div className="card kpi">
          <span className="eyebrow">Chamados abertos</span>
          <span className="kpi-valor">
            {uso?.tickets_abertos ?? '—'}
            {plano.ticketsAbertos && <small> de {plano.ticketsAbertos}</small>}
          </span>
          <Link to="/painel/atendimentos" className="faint" style={{ fontSize: 13 }}>Ver atendimentos</Link>
        </div>
        <div className="card kpi">
          <span className="eyebrow">Nota dos clientes · 30 dias</span>
          <span className="kpi-valor">
            {nota ? nota.media.toFixed(1).replace('.', ',') : '—'} <small>{nota ? `${nota.total} avaliações` : 'sem avaliações'}</small>
          </span>
        </div>
      </section>

      <section className="grid-2">
        <div className="card">
          <div className="card-head">
            <h2 className="card-title">Na fila</h2>
            <Link to="/painel/atendimentos" className="btn btn-quiet btn-sm">Abrir atendimentos</Link>
          </div>
          {fila.length === 0 ? (
            <p className="faint">Quando o atendente precisar de alguém da equipe, o chamado aparece aqui.</p>
          ) : (
            <div className="stack stack-sm">
              {fila.map((c) => (
                <Link key={c.id} to={`/painel/atendimentos?id=${c.id}`} className="ticket" style={{ textDecoration: 'none' }}>
                  <div className="stub" style={{ background: 'var(--papel)' }}>
                    <div className="stub-num"><small>Senha</small><b>{numero(c.numero)}</b></div>
                    <div className="stub-body">
                      <div className="ticket-title">{c.titulo || c.motivo || 'Atendimento'}</div>
                      <div className="ticket-meta">
                        <span className={`badge ${STATUS[c.status].classe}`}>{STATUS[c.status].rotulo}</span>
                        <span>{quando(c.last_message_at)}</span>
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="stack">
          <div className="card">
            <div className="card-head">
              <h2 className="card-title">O que perguntaram e ele não sabia</h2>
            </div>
            {lacunas.length === 0 ? (
              <p className="faint">Nenhuma lacuna aberta. Quando um cliente perguntar algo que o atendente não sabe, aparece aqui.</p>
            ) : (
              <ul className="list-plain">
                {lacunas.map((g) => (
                  <li key={g.id} className="row" style={{ padding: '10px 0', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="list-title">{g.assunto}</div>
                      {g.pergunta && <p className="faint" style={{ fontSize: 13 }}>“{g.pergunta}”</p>}
                    </div>
                    <span className="badge badge-plain">{g.vezes}×</span>
                    <Link to={`/painel/assistentes/${g.assistant_id}/editar`} className="btn btn-ghost btn-sm">Ensinar</Link>
                    <button type="button" className="btn btn-quiet btn-sm btn-icon" title="Marcar como resolvida" aria-label="Marcar como resolvida" onClick={() => resolverLacuna(g.id)}>
                      <Check size={16} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="card">
            <div className="card-head">
              <h2 className="card-title">Próximos horários</h2>
              <Link to="/painel/agenda" className="btn btn-quiet btn-sm">Agenda</Link>
            </div>
            {proximos.length === 0 ? (
              <p className="faint">Nada marcado por enquanto.</p>
            ) : (
              <ul className="list-plain">
                {proximos.map((p) => (
                  <li key={p.id} className="row" style={{ padding: '10px 0' }}>
                    <span className="mono num" style={{ minWidth: 92 }}>
                      {new Date(p.inicio).toLocaleString('pt-BR', { weekday: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span style={{ flex: 1 }}>
                      <b>{p.cliente_nome}</b>
                      {p.servico && <span className="faint"> · {p.servico}</span>}
                    </span>
                    {p.origem === 'assistente' && <span className="badge badge-human badge-plain">pelo atendente</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
