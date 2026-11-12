import { useEffect, useState } from 'react';
import { Link, useNavigate, useOutletContext } from 'react-router-dom';
import { ArrowRight, BarChart3, Copy, GraduationCap, Link2, MessageCircle, Plus, Sparkles, UserPlus } from 'lucide-react';
import AlertasDaConta from '@/components/AlertasDaConta';
import Contador from '@/components/Contador';
import { IconeDoCanal } from '@/components/IconesCanais';
import { useToast } from '@/components/Toasts';
import Faisca from '@/components/Faisca';
import ListaViva from '@/components/ListaViva';
import PrimeirosPassos from '@/components/PrimeirosPassos';
import { supabase } from '@/lib/supabase';
import { FUSO_PADRAO } from '@/lib/fuso';
import { useAuth } from '@/contexts/AuthContext';
import { diasDeTeste, planOf, reais } from '@/lib/plans';
import { numero, quando, STATUS } from '@/lib/format';
import { CartaoRascunho, useRascunho } from '@/components/Rascunho';

const saudacao = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
};

/** Anel que enche até a porcentagem (quanto o assistente resolveu sem a equipe). */
function Anel({ pct }) {
  const r = 20;
  const volta = 2 * Math.PI * r;
  return (
    <svg className="anel" viewBox="0 0 48 48" aria-hidden="true">
      <circle cx="24" cy="24" r={r} className="anel-fundo" />
      <circle cx="24" cy="24" r={r} className="anel-valor" strokeDasharray={volta} style={{ '--falta': volta * (1 - pct / 100), '--tudo': volta }} />
    </svg>
  );
}

const CANAL = { whatsapp: 'WhatsApp', instagram: 'Instagram', discord: 'Discord' };
const SITUACAO_CANAL = {
  ativo: ['respondendo', 'ok'],
  pendente: ['aguardando a Meta', 'espera'],
  erro: ['precisa de atenção', 'erro'],
  pausado: ['pausado', 'pausa'],
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
  const [proximos, setProximos] = useState([]);
  const [fuso, setFuso] = useState(FUSO_PADRAO);
  const [nota, setNota] = useState(null);
  const [porDia, setPorDia] = useState(null); // atendimentos dos últimos 14 dias
  const [mesPassado, setMesPassado] = useState(null); // até o mesmo dia do mês passado
  const [sozinho, setSozinho] = useState(null); // conversas do mês que o assistente resolveu sem a equipe
  const [canais, setCanais] = useState([]);
  const [aprendeu, setAprendeu] = useState([]);
  const [vendas, setVendas] = useState(null);
  const avisar = useToast();

  useEffect(() => {
    if (!user) return;
    (async () => {
      const hoje = new Date();
      hoje.setHours(0, 0, 0, 0);
      const desde14 = new Date(hoje.getTime() - 13 * 864e5);
      const iniMesPassado = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
      const mesmoDiaMesPassado = new Date(hoje.getFullYear(), hoje.getMonth() - 1, Math.min(hoje.getDate(), 28) + 1);
      const iniMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString();
      const doMes = () => supabase.from('conversations').select('id', { count: 'exact', head: true }).eq('teste', false).eq('aprendiz', false).gte('created_at', iniMes);
      const [a, f, p, n, d, mp, ag, tot, semEq, cn, ap, pd] = await Promise.all([
        supabase.from('assistants').select('id, name, business_type, is_public, public_token, modo, foto_url').order('created_at'),
        supabase
          .from('conversations')
          .select('id, numero, titulo, motivo, status, lead_nome, last_message_at, prioridade')
          .eq('teste', false)
          .in('status', ['waiting', 'human'])
          .order('last_message_at', { ascending: false })
          .limit(5),
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
        supabase.from('agenda_config').select('fuso').maybeSingle(),
        doMes(),
        doMes().is('escalado_em', null),
        supabase.from('canais').select('id, tipo, status, nome').order('criado_em'),
        supabase.from('aprendizados').select('id, pergunta, criado_em, assistant_id').eq('ativo', true).order('criado_em', { ascending: false }).limit(3),
        supabase.from('pedidos').select('total').in('status', ['pago', 'finalizado']).gte('criado_em', iniMes).limit(2000),
      ]);
      setSozinho(tot.count ? { total: tot.count, sem: semEq.count ?? 0, pct: Math.round(((semEq.count ?? 0) / tot.count) * 100) } : null);
      setCanais(cn.data ?? []);
      setAprendeu(ap.data ?? []);
      setVendas(pd.data?.length ? { n: pd.data.length, total: pd.data.reduce((x, y) => x + Number(y.total || 0), 0) } : null);
      const contagem = Array(14).fill(0);
      for (const c of d.data ?? []) {
        const i = Math.floor((new Date(c.created_at).getTime() - desde14.getTime()) / 864e5);
        if (i >= 0 && i < 14) contagem[i]++;
      }
      setPorDia(contagem);
      setMesPassado(mp.count ?? null);
      setAssistentes(a.data ?? []);
      setFila(f.data ?? []);
      setProximos(p.data ?? []);
      setFuso(ag.data?.fuso || FUSO_PADRAO);
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

  const primeiroNome = (nome || '').split(' ')[0];
  const copiarLink = async (a) => {
    await navigator.clipboard.writeText(`${window.location.origin}/c/${a.public_token}`);
    avisar('Link copiado', { texto: 'Cole na bio, no site ou mande pelo WhatsApp.' });
  };

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

      {dias != null && dias <= 2 && (
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
      {!(uso?.atendimentos > 0) && !(uso?.tickets_abertos > 0) && !nota ? (
        <section className="card painel-calmo">
          <b>Ainda sem atendimentos neste mês.</b>
          <span className="faint">Divulgue o link do assistente (Canais) e os números aparecem aqui.</span>
          <Link to="/painel/canais" className="btn btn-ghost btn-sm">Ver link e QR code</Link>
        </section>
      ) : (
      <section className="card kpi-faixa" data-colunas={sozinho ? 4 : 3}>
        <div className="kpi">
          <Faisca valores={porDia} className="kpi-faisca" />
          <span className="eyebrow">Atendimentos no mês</span>
          <span className="kpi-valor">
            {uso?.atendimentos != null ? <Contador valor={uso.atendimentos} duracao={1100} /> : '—'} <small>de {plano.atendimentos}</small>
          </span>
          <div className="meter" data-nivel={(uso?.atendimentos ?? 0) >= plano.atendimentos ? 'cheio' : (uso?.atendimentos ?? 0) / plano.atendimentos >= 0.85 ? 'alto' : undefined} style={{ marginTop: 8 }}>
            <span style={{ width: `${Math.min(100, ((uso?.atendimentos ?? 0) / plano.atendimentos) * 100)}%` }} />
          </div>
          {uso?.mensagens != null && (
            <span className="kpi-variacao">{uso.mensagens.toLocaleString('pt-BR')} de {plano.mensagens.toLocaleString('pt-BR')} mensagens do plano</span>
          )}
          {mesPassado > 0 && uso?.atendimentos != null && (() => {
            const v = Math.round(((uso.atendimentos - mesPassado) / mesPassado) * 100);
            return (
              <span className="kpi-variacao">
                <b data-sinal={v < 0 ? 'menos' : 'mais'}>{v > 0 ? '+' : ''}{v}%</b> vs. o mesmo período do mês passado
              </span>
            );
          })()}
        </div>
        {sozinho && (
          <div className="kpi kpi-com-anel">
            <Anel pct={sozinho.pct} />
            <span className="eyebrow">Resolvido sem a equipe</span>
            <span className="kpi-valor"><Contador valor={sozinho.pct} duracao={1100} /><small>%</small></span>
            <span className="kpi-variacao">{sozinho.sem} de {sozinho.total} conversas do mês</span>
          </div>
        )}
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
      )}

      <section className="painel-grade">
        <div className="painel-coluna">
        {fila.length > 0 && (
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

        )}
        {proximos.length > 0 && (
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
                  <li key={p.id} className="row row-wrap" style={{ padding: '10px 0', gap: '4px 12px' }}>
                    <span className="num" style={{ minWidth: 92, color: 'var(--tinta-2)' }}>
                      {new Date(p.inicio).toLocaleString('pt-BR', { weekday: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: fuso })}
                    </span>
                    <span style={{ flex: 1, minWidth: 140 }}>
                      <b>{p.cliente_nome}</b>
                      {p.servico && <span className="faint"> · {p.servico}</span>}
                    </span>
                    {p.origem === 'assistente' && <span className="badge badge-human badge-plain">pelo assistente</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
          {fila.length === 0 && proximos.length === 0 && (
            <div className="card painel-calmo">
              <b>Fila vazia.</b>
              <span className="faint">Quando o assistente precisar de alguém da equipe, o chamado aparece aqui na hora.</span>
            </div>
          )}
        </div>

        <div className="painel-coluna">
          <div className="card">
            <div className="card-head">
              <h2 className="card-title">{assistentes.length === 1 ? 'Seu assistente' : 'Seus assistentes'}</h2>
              <Link to="/painel/assistentes" className="btn btn-quiet btn-sm">Ver todos</Link>
            </div>
            <ul className="list-plain painel-assistentes">
              {assistentes.map((x) => (
                <li key={x.id}>
                  <span className="painel-avatar" aria-hidden="true">
                    {x.foto_url ? <img src={x.foto_url} alt="" /> : x.name.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="painel-assistente-nome">
                    <b>{x.name}</b>
                    <span className={`badge ${x.modo === 'aprendiz' ? 'badge-human' : x.is_public ? 'badge-closed' : 'badge-bot'}`}>
                      {x.modo === 'aprendiz' ? 'Só aprendendo' : x.is_public ? 'Atendendo' : 'Link desligado'}
                    </span>
                  </span>
                  <span className="painel-assistente-acoes">
                    <Link to={`/painel/assistentes/${x.id}/testar`} className="btn btn-ghost btn-sm"><MessageCircle /> Testar</Link>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => copiarLink(x)}><Copy /> Link</button>
                  </span>
                </li>
              ))}
            </ul>

            <div className="painel-canais">
              <Link to="/painel/assistentes" className="painel-canal" data-situacao="ok"><Link2 size={15} /> Link do chat <small>sempre ligado</small></Link>
              {canais.map((k) => {
                const I = IconeDoCanal[k.tipo];
                const [rotulo, situacao] = SITUACAO_CANAL[k.status] ?? SITUACAO_CANAL.ativo;
                return (
                  <Link key={k.id} to="/painel/canais" className="painel-canal" data-situacao={situacao}>
                    {I && <I width={15} height={15} />} {CANAL[k.tipo]} <small>{rotulo}</small>
                  </Link>
                );
              })}
              {canais.length === 0 && <Link to="/painel/canais" className="painel-canal" data-situacao="novo"><Plus size={15} /> Conectar WhatsApp, Instagram ou Discord</Link>}
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              <h2 className="card-title">Aprendeu com a equipe</h2>
              {assistentes[0] && <Link to={`/painel/assistentes/${aprendeu[0]?.assistant_id ?? assistentes[0].id}/aprendizado`} className="btn btn-quiet btn-sm">Ver tudo</Link>}
            </div>
            {aprendeu.length ? (
              <ul className="list-plain painel-aprendeu">
                {aprendeu.map((x) => (
                  <li key={x.id}>
                    <GraduationCap size={16} />
                    <span>{x.pergunta}</span>
                    <small className="faint">{quando(x.criado_em)}</small>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="faint" style={{ margin: 0, fontSize: 14 }}>Quando alguém da equipe responde um cliente, o assistente guarda a resposta e passa a usar sozinho. O que ele aprender aparece aqui.</p>
            )}
          </div>

          {vendas && (
            <Link to="/painel/pedidos" className="card painel-vendas">
              <span className="eyebrow">Vendas pelo chat no mês</span>
              <span className="kpi-valor">{reais(vendas.total)}</span>
              <span className="faint">{vendas.n} {vendas.n === 1 ? 'pedido pago ou finalizado' : 'pedidos pagos ou finalizados'}</span>
            </Link>
          )}

          <nav className="painel-atalhos" aria-label="Atalhos">
            <Link to="/painel/relatorios" className="btn btn-ghost btn-sm"><BarChart3 /> Relatórios</Link>
            <Link to="/painel/equipe" className="btn btn-ghost btn-sm"><UserPlus /> Convidar equipe</Link>
            <Link to="/painel/canais" className="btn btn-ghost btn-sm"><Link2 /> Canais</Link>
          </nav>
        </div>
      </section>
      </>
      )}
    </div>
  );
}
