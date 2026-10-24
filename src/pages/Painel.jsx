import { useEffect, useState } from 'react';
import { Link, useNavigate, useOutletContext } from 'react-router-dom';
import { ArrowRight, Check, Plus, Sparkles } from 'lucide-react';
import AlertasDaConta from '@/components/AlertasDaConta';
import Faisca from '@/components/Faisca';
import ListaViva from '@/components/ListaViva';
import PrimeirosPassos from '@/components/PrimeirosPassos';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { diasDeTeste, planOf } from '@/lib/plans';
import { numero, quando, STATUS } from '@/lib/format';
import { CartaoRascunho, useRascunho } from '@/components/Rascunho';

const saudacao = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
};

/** Conta sem assistente: já começa escrevendo sobre o negócio, e mostra o que vem no fim. */
function Comecar() {
  const navigate = useNavigate();
  const [texto, setTexto] = useState('');
  const ir = (e) => {
    e.preventDefault();
    navigate('/painel/assistentes/novo', { state: { comeco: texto.trim() } });
  };
  return (
    <section className="card comecar">
      <form className="comecar-texto" onSubmit={ir}>
        <h2>Como é o seu negócio?</h2>
        <p className="muted">Escreva do seu jeito, como explicaria para alguém que começou hoje. O Helpy monta o assistente com isso e pergunta o que faltar.</p>
        <textarea
          className="textarea"
          rows={4}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Barbearia no centro de Campinas. Corte R$ 45, barba R$ 30. Abro de terça a sábado, das 9h às 19h, e aceito Pix."
          aria-label="Descreva o seu negócio"
        />
        <div className="row row-wrap" style={{ gap: 12 }}>
          <button type="submit" className="btn btn-primary">
            Montar meu assistente <ArrowRight />
          </button>
          <span className="faint" style={{ fontSize: 13 }}>Leva uns 5 minutos. Dá para mudar tudo depois.</span>
        </div>
      </form>
      <figure className="comecar-previa" aria-label="Exemplo de conversa com o assistente">
        <figcaption>Do outro lado, o seu cliente:</figcaption>
        <p className="comecar-balao comecar-balao-cliente">Vocês abrem sábado?</p>
        <p className="comecar-balao">Abrimos sim, das 9h às 19h. Quer que eu já marque um horário para você?</p>
        <p className="comecar-balao comecar-balao-cliente">Quero, corte às 10h</p>
        <p className="comecar-balao">Marcado: sábado, 10h, corte (R$ 45). Te espero lá!</p>
      </figure>
    </section>
  );
}

export default function Painel() {
  const { uso } = useOutletContext();
  const { user, profile, nome } = useAuth();
  const plano = planOf(profile);
  const dias = diasDeTeste(profile);

  const [assistentes, setAssistentes] = useState(null);
  const rascunho = useRascunho();
  const [fila, setFila] = useState([]);
  const [lacunas, setLacunas] = useState([]);
  const [proximos, setProximos] = useState([]);
  const [nota, setNota] = useState(null);
  const [porDia, setPorDia] = useState(null); // atendimentos dos últimos 14 dias
  const [mesPassado, setMesPassado] = useState(null); // até o mesmo dia do mês passado

  useEffect(() => {
    if (!user) return;
    (async () => {
      const hoje = new Date();
      hoje.setHours(0, 0, 0, 0);
      const desde14 = new Date(hoje.getTime() - 13 * 864e5);
      const iniMesPassado = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
      const mesmoDiaMesPassado = new Date(hoje.getFullYear(), hoje.getMonth() - 1, Math.min(hoje.getDate(), 28) + 1);
      const [a, f, l, p, n, d, mp] = await Promise.all([
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
        supabase.from('conversations').select('created_at').eq('teste', false).gte('created_at', desde14.toISOString()).limit(5000),
        supabase.from('conversations').select('id', { count: 'exact', head: true }).eq('teste', false)
          .gte('created_at', iniMesPassado.toISOString()).lt('created_at', mesmoDiaMesPassado.toISOString()),
      ]);
      const contagem = Array(14).fill(0);
      for (const c of d.data ?? []) {
        const i = Math.floor((new Date(c.created_at).getTime() - desde14.getTime()) / 864e5);
        if (i >= 0 && i < 14) contagem[i]++;
      }
      setPorDia(contagem);
      setMesPassado(mp.count ?? null);
      setAssistentes(a.data ?? []);
      setFila(f.data ?? []);
      setLacunas(l.data ?? []);
      setProximos(p.data ?? []);
      const notas = (n.data ?? []).map((x) => Number(x.nota)).filter((x) => x >= 1 && x <= 5);
      setNota(notas.length ? { media: notas.reduce((s, x) => s + x, 0) / notas.length, total: notas.length } : null);
    })();
  }, [user]);

  // a fila se atualiza sozinha: chamado novo entra no topo com uma mola
  useEffect(() => {
    if (!user) return undefined;
    const t = setInterval(async () => {
      const { data } = await supabase
        .from('conversations')
        .select('id, numero, titulo, motivo, status, lead_nome, last_message_at, prioridade')
        .eq('teste', false)
        .in('status', ['waiting', 'human'])
        .order('last_message_at', { ascending: false })
        .limit(5);
      if (data) setFila(data);
    }, 20000);
    return () => clearInterval(t);
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
        {assistentes?.length > 0 && (
          <Link to="/painel/assistentes/novo" className="btn btn-primary">
            <Plus /> Novo assistente
          </Link>
        )}
      </header>

      <AlertasDaConta />

      {dias != null && (
        <div className={`alert ${dias <= 0 ? 'alert-erro' : ''}`} style={{ marginBottom: 20 }}>
          <Sparkles />
          <span>
            {dias > 0
              ? `Seu teste grátis termina em ${dias} ${dias === 1 ? 'dia' : 'dias'}. `
              : 'Seu teste grátis terminou: o assistente só está anotando recados. '}
            <Link to="/painel/plano">Escolher um plano</Link>
          </span>
        </div>
      )}

      {assistentes?.length > 0 && <PrimeirosPassos assistentes={assistentes} />}

      {/* montagem começada e não publicada: continua de onde parou */}
      <CartaoRascunho rascunho={rascunho} />

      {assistentes && assistentes.length === 0 && rascunho === null ? <Comecar /> : null}

      {/* conta nova: só o começo; números e listas aparecem com o primeiro assistente */}
      {assistentes?.length > 0 && (
      <>
      <section className="card kpi-faixa">
        <div className="kpi">
          <Faisca valores={porDia} className="kpi-faisca" />
          <span className="eyebrow">Atendimentos no mês</span>
          <span className="kpi-valor">
            {uso?.atendimentos ?? '—'} <small>de {plano.atendimentos}</small>
          </span>
          <div className="meter" data-nivel={(uso?.atendimentos ?? 0) >= plano.atendimentos ? 'cheio' : (uso?.atendimentos ?? 0) / plano.atendimentos >= 0.85 ? 'alto' : undefined} style={{ marginTop: 8 }}>
            <span style={{ width: `${Math.min(100, ((uso?.atendimentos ?? 0) / plano.atendimentos) * 100)}%` }} />
          </div>
          {mesPassado > 0 && uso?.atendimentos != null && (() => {
            const v = Math.round(((uso.atendimentos - mesPassado) / mesPassado) * 100);
            return (
              <span className="kpi-variacao">
                <b data-sinal={v < 0 ? 'menos' : 'mais'}>{v > 0 ? '+' : ''}{v}%</b> vs. o mesmo período do mês passado
              </span>
            );
          })()}
        </div>
        <div className="kpi">
          <span className="eyebrow">Chamados abertos</span>
          <span className="kpi-valor">
            {uso?.tickets_abertos ?? '—'}
            {plano.ticketsAbertos && <small> de {plano.ticketsAbertos}</small>}
          </span>
          <Link to="/painel/atendimentos" className="faint" style={{ fontSize: 13 }}>Ver atendimentos</Link>
        </div>
        <div className="kpi">
          <span className="eyebrow">Nota dos clientes · 30 dias</span>
          <span className="kpi-valor">
            {nota ? nota.media.toFixed(1).replace('.', ',') : '—'} <small>{nota ? `${nota.total} ${nota.total === 1 ? 'avaliação' : 'avaliações'}` : 'sem avaliações'}</small>
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
            <p className="faint">Quando o assistente precisar de alguém da equipe, o chamado aparece aqui.</p>
          ) : (
            <ListaViva
              itens={fila}
              render={(c) => (
                <Link to={`/painel/atendimentos?id=${c.id}`} className="ticket" style={{ textDecoration: 'none' }}>
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
              )}
            />
          )}
        </div>

        <div className="stack">
          <div className="card">
            <div className="card-head">
              <h2 className="card-title">O que perguntaram e ele não sabia</h2>
            </div>
            {lacunas.length === 0 ? (
              <p className="faint">Nenhuma lacuna aberta. Quando um cliente perguntar algo que o assistente não sabe, aparece aqui.</p>
            ) : (
              <ul className="list-plain">
                {lacunas.map((g) => (
                  <li key={g.id} className="row" style={{ padding: '10px 0', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="list-title">{g.assunto}</div>
                      {g.pergunta && <p className="faint" style={{ fontSize: 13 }}>“{g.pergunta}”</p>}
                    </div>
                    <span className="badge badge-plain">{g.vezes}×</span>
                    <Link
                      to={`/painel/assistentes/${g.assistant_id}/editar`}
                      state={{ comeco: g.pergunta ? `Clientes perguntam: "${g.pergunta}". A resposta certa é: ` : `Sobre ${g.assunto}, a resposta certa é: ` }}
                      className="btn btn-ghost btn-sm"
                    >
                      Ensinar
                    </Link>
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
                    {p.origem === 'assistente' && <span className="badge badge-human badge-plain">pelo assistente</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>
      </>
      )}
    </div>
  );
}
