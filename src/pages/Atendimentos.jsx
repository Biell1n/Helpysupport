import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowUp, Ban, CheckCircle2, ClipboardList, Clock3, Headset, Columns3, Hand, RotateCcw, Search, ShoppingCart } from 'lucide-react';
import QuadroChamados from './QuadroChamados';
import { chamar, supabase } from '@/lib/supabase';
import { canalDe, NOME_DO_CANAL, SeloCanal } from '@/components/IconesCanais';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/Toasts';
import { Confirmar, Modal } from '@/components/Modal';
import AgendaDoChamado from '@/components/AgendaDoChamado';
import SwipeRow from '@/components/SwipeRow';
import Abas from '@/components/Abas';
import { numero, quando, STATUS } from '@/lib/format';
import { avisarNoCanal } from '@/lib/canais';
import { bloqueioDa, rotuloDoBloqueio } from '@/lib/bloqueio';

const CELULAR = typeof window !== 'undefined' && window.matchMedia?.('(max-width: 900px)').matches;
const ABAS = [
  { id: 'waiting', rotulo: 'Na fila' },
  { id: 'human', rotulo: 'Equipe' },
  { id: 'bot', rotulo: 'Assistente' },
  { id: 'closed', rotulo: 'Fechados' },
];

const nomeCliente = (c) => c.lead_nome?.trim() || c.cliente_email || 'Visitante';

/** Em que pé está a compra nesta conversa: do carrinho ao pedido pago ou finalizado pela equipe. */
const ETAPAS = {
  montando: { rotulo: 'Montando pedido', Icone: ShoppingCart, cor: 'etapa-montando' },
  pagamento: { rotulo: 'Aguardando pagamento', Icone: Clock3, cor: 'etapa-pagamento' },
  anotado: { rotulo: 'Pedido anotado', Icone: ClipboardList, cor: 'etapa-anotado' },
  feito: { rotulo: 'Pedido pago/finalizado', Icone: CheckCircle2, cor: 'etapa-feito' },
};
const DO_PEDIDO = { aguardando: 'pagamento', anotado: 'anotado', pago: 'feito', finalizado: 'feito' };
const TEMPOS = [
  { min: 60, rotulo: '1 hora' },
  { min: 6 * 60, rotulo: '6 horas' },
  { min: 24 * 60, rotulo: '24 horas' },
  { min: 7 * 24 * 60, rotulo: '7 dias' },
  { min: null, rotulo: 'Banir' },
];

/** A equipe dá timeout ou bane quem está gastando o atendimento à toa. */
function BloquearModal({ conversa, atendente, onFechar, onFeito }) {
  const avisar = useToast();
  const [tempo, setTempo] = useState(60);
  const [motivo, setMotivo] = useState('');
  const [salvando, setSalvando] = useState(false);
  const banir = tempo === null;

  const salvar = async () => {
    setSalvando(true);
    const ate = banir ? null : new Date(Date.now() + tempo * 60e3).toISOString();
    const { error } = await supabase.from('bloqueios').insert({
      owner_id: conversa.owner_id, conversation_id: conversa.id, visitor_id: conversa.visitor_id, ip_hash: conversa.ip_hash,
      cliente_id: conversa.cliente_id, ate, motivo: motivo.trim() || null, por: 'equipe', por_nome: atendente,
    });
    if (!error) await supabase.from('conversations').update({ bloqueado_ate: ate, banido: banir }).eq('id', conversa.id);
    setSalvando(false);
    if (error) return avisar('Não deu para bloquear', { erro: true, texto: error.message });
    avisar(banir ? 'Pessoa banida' : 'Timeout aplicado', { texto: 'O assistente não responde mais essa pessoa enquanto valer.' });
    onFeito();
  };

  return (
    <Modal aberto onFechar={onFechar} largura={460}>
      <div className="stack">
        <h2 style={{ fontSize: 22 }}>Bloquear esta pessoa</h2>
        <p className="muted" style={{ margin: 0 }}>
          Enquanto valer, o assistente não responde mais ela, nem numa conversa nova. A equipe ainda pode responder por aqui.
        </p>
        <div className="row row-wrap" role="group" aria-label="Por quanto tempo">
          {TEMPOS.map((t) => (
            <button key={t.rotulo} type="button" className="chip" aria-pressed={tempo === t.min} onClick={() => setTempo(t.min)}>{t.rotulo}</button>
          ))}
        </div>
        <label className="stack" style={{ gap: 6 }}>
          <span className="label">Motivo (só a equipe vê)</span>
          <input className="input" value={motivo} maxLength={300} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: mandando mensagem sem parar" />
        </label>
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-ghost" onClick={onFechar}>Cancelar</button>
          <button type="button" className="btn btn-danger" disabled={salvando} onClick={salvar}><Ban /> {banir ? 'Banir' : 'Dar timeout'}</button>
        </div>
      </div>
    </Modal>
  );
}

function etapaDa(c, pedido) {
  if (pedido && DO_PEDIDO[pedido]) return DO_PEDIDO[pedido];
  return Array.isArray(c.carrinho) && c.carrinho.length ? 'montando' : null;
}

function SeloEtapa({ etapa }) {
  const e = ETAPAS[etapa];
  if (!e) return null;
  return <span className={`selo-etapa ${e.cor}`} title={e.rotulo}><e.Icone size={12} aria-hidden="true" /> {e.rotulo}</span>;
}
const estrelas = (n) => '★'.repeat(n) + '☆'.repeat(5 - n);
export default function Atendimentos() {
  const { recarregarUso } = useOutletContext();
  const { user, nome } = useAuth();
  const avisar = useToast();
  const [params, setParams] = useSearchParams();
  const abertaId = params.get('id');

  const [aba, setAba] = useState('waiting');
  // quadro (Kanban) ou lista; lembra a escolha neste navegador
  const [modo, setModoEstado] = useState(() => {
    try {
      // no celular não dá para arrastar cartões: começa na lista
      return localStorage.getItem('helpy_atendimentos_modo') || (window.matchMedia('(max-width: 900px)').matches ? 'lista' : 'quadro');
    } catch {
      return 'quadro';
    }
  });
  const setModo = (m) => {
    setModoEstado(m);
    try {
      localStorage.setItem('helpy_atendimentos_modo', m);
    } catch {
      /* sem armazenamento: vale só agora */
    }
  };
  const [busca, setBusca] = useState('');
  const [etapaFiltro, setEtapaFiltro] = useState('');
  const [pedidoDa, setPedidoDa] = useState({});
  const [conversas, setConversas] = useState(null);
  const [erroLista, setErroLista] = useState(false);
  const [contagem, setContagem] = useState({});
  const [assistentes, setAssistentes] = useState({});
  const [aberta, setAberta] = useState(null);
  const [mensagens, setMensagens] = useState([]);
  const [eventos, setEventos] = useState([]);
  const [resposta, setResposta] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [confirmar, setConfirmar] = useState(null);
  const [bloquear, setBloquear] = useState(false);
  const [deslizada, setDeslizada] = useState(null);
  const fim = useRef(null);

  const atendente = nome || user?.email?.split('@')[0] || 'Equipe';

  // ---- lista ----
  const carregar = useCallback(async () => {
    const [{ data, error }, ...counts] = await Promise.all([
      supabase
        .from('conversations')
        .select('*')
        .eq('teste', false)
        .eq('status', aba)
        .order(aba === 'waiting' ? 'escalado_em' : 'last_message_at', { ascending: aba === 'waiting' })
        .limit(200),
      ...ABAS.map((a) =>
        supabase.from('conversations').select('id', { count: 'exact', head: true }).eq('teste', false).eq('status', a.id),
      ),
    ]);
    // falha de rede não pode virar "fila vazia": a pessoa acharia que não tem ninguém esperando
    setErroLista(!!error);
    if (error) return;
    setConversas(data ?? []);
    setContagem(Object.fromEntries(ABAS.map((a, i) => [a.id, counts[i].count ?? 0])));
    const ids = (data ?? []).map((c) => c.id);
    if (ids.length) {
      const { data: peds } = await supabase.from('pedidos').select('conversation_id, status, criado_em')
        .in('conversation_id', ids).order('criado_em', { ascending: false }).limit(500);
      const mapa = {};
      // o pedido mais recente que ainda vale (cancelado e estornado não contam)
      for (const p of peds ?? []) if (!mapa[p.conversation_id] && DO_PEDIDO[p.status]) mapa[p.conversation_id] = p.status;
      setPedidoDa(mapa);
    } else setPedidoDa({});
  }, [aba]);

  useEffect(() => {
    setConversas(null);
    carregar();
    const t = setInterval(carregar, 15000);
    return () => clearInterval(t);
  }, [carregar]);

  useEffect(() => {
    supabase
      .from('assistants')
      .select('id, name')
      .then(({ data }) => setAssistentes(Object.fromEntries((data ?? []).map((a) => [a.id, a.name]))));
  }, []);

  // ---- conversa aberta ----
  // a conversa que está aberta agora: resposta atrasada de outra (troca rápida de chamado) é descartada
  const abertaAgora = useRef(null);
  const carregarAberta = useCallback(async (id) => {
    const [{ data: c, error: erro }, { data: msgs }, { data: evs }] = await Promise.all([
      supabase.from('conversations').select('*').eq('id', id).maybeSingle(),
      supabase.from('conversation_messages').select('id, role, content, author_name, created_at').eq('conversation_id', id).order('created_at').limit(300),
      supabase.from('conversa_eventos').select('id, tipo, quem, detalhe, criado_em').eq('conversation_id', id).order('criado_em').limit(100),
    ]);
    if (abertaAgora.current !== id) return;
    // uma falha de rede numa atualização não apaga da tela a conversa que já estava aberta
    if (erro) {
      setAberta((antes) => (antes?.id === id ? antes : null));
      return;
    }
    setAberta(c ?? null);
    setMensagens(msgs ?? []);
    setEventos(evs ?? []);
    if (c && !c.lido_em) await supabase.from('conversations').update({ lido_em: new Date().toISOString() }).eq('id', id);
  }, []);

  useEffect(() => {
    abertaAgora.current = abertaId;
    if (!abertaId) {
      setAberta(null);
      return;
    }
    carregarAberta(abertaId);
    const t = setInterval(() => carregarAberta(abertaId), 8000);
    return () => clearInterval(t);
  }, [abertaId, carregarAberta]);

  useEffect(() => {
    // rola só a conversa, não a página (no celular escondia os botões)
    const caixa = fim.current?.parentElement;
    if (caixa) caixa.scrollTop = caixa.scrollHeight;
  }, [mensagens.length]);

  const abrir = (id) => setParams(id ? { id } : {});

  // soOseLivre: assumir só vale se ninguém mais assumiu nesse meio-tempo (duas pessoas no mesmo chamado)
  const atualizar = async (patch, msgOk, soSeLivre = false) => {
    let q = supabase.from('conversations').update(patch).eq('id', aberta.id);
    if (soSeLivre) q = q.or(`status.neq.human,assumido_por.eq.${user.id}`);
    const { data: mudou, error } = await q.select('id');
    if (error) {
      avisar('Não deu para atualizar o chamado', { erro: true, texto: error.message });
      return false;
    }
    if (soSeLivre && !mudou?.length) {
      await Promise.all([carregarAberta(aberta.id), carregar()]);
      avisar('Outra pessoa já assumiu este chamado', { erro: true, texto: 'A tela foi atualizada com quem está atendendo.' });
      return false;
    }
    avisarNoCanal(aberta);
    if (msgOk) avisar(msgOk.titulo, { texto: msgOk.texto });
    await Promise.all([carregarAberta(aberta.id), carregar()]);
    recarregarUso();
    return true;
  };

  const assumir = () =>
    atualizar(
      { status: 'human', assumido_por: user.id, assumido_nome: atendente, assumido_em: new Date().toISOString() },
      { titulo: 'Chamado assumido', texto: 'O cliente vê que você está no atendimento.' },
      true,
    );

  const encerrar = () =>
    atualizar(
      { status: 'closed', fechado_em: new Date().toISOString(), encerrado_por: 'equipe' },
      { titulo: 'Chamado encerrado', texto: 'O cliente foi convidado a avaliar o atendimento.' },
    );

  // tira o timeout ou o banimento da pessoa (em todas as conversas dela)
  const desbloquear = async () => {
    const agora = new Date().toISOString();
    const q = [supabase.from('bloqueios').update({ removido_em: agora }).eq('conversation_id', aberta.id).is('removido_em', null)];
    if (aberta.visitor_id) {
      q.push(supabase.from('bloqueios').update({ removido_em: agora }).eq('visitor_id', aberta.visitor_id).is('removido_em', null));
      q.push(supabase.from('conversations').update({ bloqueado_ate: null, banido: false }).eq('visitor_id', aberta.visitor_id));
    }
    q.push(supabase.from('conversations').update({ bloqueado_ate: null, banido: false }).eq('id', aberta.id));
    const r = await Promise.all(q);
    const erro = r.find((x) => x.error)?.error;
    if (erro) return avisar('Não deu para desbloquear', { erro: true, texto: erro.message });
    avisar('Bloqueio retirado', { texto: 'O assistente volta a responder essa pessoa.' });
    await Promise.all([carregarAberta(aberta.id), carregar()]);
  };

  const reabrir = () =>
    atualizar(
      { status: aberta.assumido_por ? 'human' : 'waiting', fechado_em: null, encerrado_por: null },
      { titulo: 'Chamado reaberto' },
    );

  const devolver = () =>
    atualizar(
      { status: 'bot', assumido_por: null, assumido_nome: null, assumido_em: null },
      { titulo: 'Devolvido ao assistente', texto: 'Ele volta a responder esta conversa.' },
    );

  // ações rápidas pela lista (deslizando a linha no celular)
  const mudarDaLista = async (c, patch, titulo) => {
    setDeslizada(null);
    let q = supabase.from('conversations').update(patch).eq('id', c.id);
    // assumir pela lista também não passa por cima de quem já assumiu
    if (patch.status === 'human') q = q.or(`status.neq.human,assumido_por.eq.${user.id}`);
    const { data: mudou, error } = await q.select('id');
    if (error) return avisar('Não deu para atualizar o chamado', { erro: true, texto: error.message });
    if (!mudou?.length) {
      await carregar();
      return avisar('Outra pessoa já assumiu este chamado', { erro: true });
    }
    avisarNoCanal(c);
    avisar(titulo);
    await Promise.all([carregar(), aberta?.id === c.id ? carregarAberta(c.id) : null]);
    recarregarUso();
  };

  const acoesDaLinha = (c) => ({
    esquerda: c.status === 'waiting'
      ? {
          rotulo: 'Assumir', icone: <Hand />, cor: 'var(--senha)',
          onAcao: () => mudarDaLista(c, { status: 'human', assumido_por: user.id, assumido_nome: atendente, assumido_em: new Date().toISOString() }, 'Chamado assumido'),
        }
      : null,
    direita: c.status === 'bot'
      ? null
      : c.status === 'closed'
      ? {
          rotulo: 'Reabrir', icone: <RotateCcw />, cor: 'var(--tinta-2)',
          onAcao: () => mudarDaLista(c, { status: c.assumido_por ? 'human' : 'waiting', fechado_em: null, encerrado_por: null }, 'Chamado reaberto'),
        }
      : {
          rotulo: 'Encerrar', icone: <CheckCircle2 />, cor: 'var(--tinta)',
          onAcao: () => mudarDaLista(c, { status: 'closed', fechado_em: new Date().toISOString(), encerrado_por: 'equipe' }, 'Chamado encerrado'),
        },
  });

  const responder = async () => {
    const texto = resposta.trim();
    if (!texto || enviando) return;
    setEnviando(true);
    try {
      const { data: msg, error } = await supabase.from('conversation_messages').insert({
        conversation_id: aberta.id,
        role: 'agent',
        content: texto,
        author_name: atendente,
      }).select('id').single();
      if (error) throw error;
      // conversa que veio do WhatsApp, Instagram ou Discord: a resposta sai por lá
      if (aberta.canal_id) {
        try {
          await chamar('canais', { action: 'enviar', message_id: msg.id });
        } catch (e) {
          avisar(`Não chegou no ${NOME_DO_CANAL[canalDe(aberta)] ?? 'canal'}`, { erro: true, texto: e.message });
        }
      }
      // responder já é assumir: o assistente para de falar por cima
      if (aberta.status !== 'human') {
        await supabase
          .from('conversations')
          .update({ status: 'human', assumido_por: user.id, assumido_nome: atendente, assumido_em: aberta.assumido_em ?? new Date().toISOString() })
          .eq('id', aberta.id);
        avisarNoCanal(aberta);
      }
      setResposta('');
      await Promise.all([carregarAberta(aberta.id), carregar()]);
    } catch (e) {
      avisar('Mensagem não enviada', { erro: true, texto: e.message });
    } finally {
      setEnviando(false);
    }
  };

  const etapas = useMemo(() => Object.fromEntries((conversas ?? []).map((c) => [c.id, etapaDa(c, pedidoDa[c.id])])), [conversas, pedidoDa]);
  const temCompra = Object.values(etapas).some(Boolean);

  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!conversas) return conversas;
    return conversas.filter((c) =>
      (!etapaFiltro || etapas[c.id] === etapaFiltro)
      && (!q || [c.titulo, c.motivo, c.resumo, c.lead_nome, c.lead_contato, String(c.numero)].some((v) => String(v ?? '').toLowerCase().includes(q))),
    );
  }, [conversas, busca, etapaFiltro, etapas]);

  if (modo === 'quadro' && !abertaId) {
    return (
      <QuadroChamados
        assistentes={assistentes}
        recarregarUso={recarregarUso}
        onLista={() => setModo('lista')}
        onAbrir={(id) => {
          setModo('lista');
          abrir(id);
        }}
      />
    );
  }

  return (
    <div className="inbox" data-aberto={aberta ? 'true' : 'false'}>
      {/* ---------- fila ---------- */}
      <section className="inbox-list" aria-label="Lista de atendimentos">
        <div className="inbox-list-head">
          <div className="row" style={{ justifyContent: 'space-between', gap: 8 }}>
            <h1 style={{ fontSize: 26 }}>Atendimentos</h1>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => { abrir(null); setModo('quadro'); }}>
              <Columns3 size={15} /> Quadro
            </button>
          </div>
          <Abas
            rotulo="Situação dos atendimentos"
            ativa={aba}
            onMudar={setAba}
            abas={ABAS.map((a) => ({
              id: a.id,
              rotulo: a.rotulo,
              extra: contagem[a.id] > 0 && a.id !== 'closed' ? <span className="mono">{contagem[a.id]}</span> : null,
            }))}
          />
          <label className="row" style={{ position: 'relative' }}>
            <Search size={16} style={{ position: 'absolute', left: 12, color: 'var(--tinta-3)' }} aria-hidden="true" />
            <input className="input" style={{ paddingLeft: 36 }} placeholder="Buscar por nome, número ou assunto" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar atendimentos" />
          </label>
          {(temCompra || etapaFiltro) && (
            <div className="filtro-etapas" role="group" aria-label="Filtrar pela etapa da compra">
              <button type="button" className="chip" aria-pressed={!etapaFiltro} onClick={() => setEtapaFiltro('')}>Todos</button>
              {Object.entries(ETAPAS).map(([id, e]) => (
                <button key={id} type="button" className="chip" aria-pressed={etapaFiltro === id} onClick={() => setEtapaFiltro(etapaFiltro === id ? '' : id)}>
                  <e.Icone size={13} aria-hidden="true" /> {e.rotulo}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="inbox-items">
          {visiveis === null && [0, 1, 2].map((i) => <div key={i} className="skeleton" style={{ height: 76 }} />)}
          {erroLista && (
            <div className="alert alert-erro" style={{ margin: 12 }}>
              <span>Não conseguimos carregar os chamados agora. Confira a internet.</span>
              <button type="button" className="btn btn-ghost btn-sm" onClick={carregar}>Tentar de novo</button>
            </div>
          )}
          {!erroLista && visiveis?.length === 0 && (
            <p className="faint" style={{ padding: 16, textAlign: 'center' }}>
              {aba === 'waiting' ? 'Fila vazia. Quando o assistente precisar de alguém, o chamado chega aqui.' : 'Nada por aqui.'}
            </p>
          )}
          {visiveis?.map((c) => (
            <SwipeRow key={c.id} {...acoesDaLinha(c)} aberta={deslizada === c.id} onAbrir={() => setDeslizada(c.id)}>
            <button type="button" className="ticket" aria-current={aberta?.id === c.id} data-bloqueado={bloqueioDa(c) ? 'sim' : undefined} onClick={() => abrir(c.id)}>
              <div className="stub">
                <div className="stub-num">
                  <small>Senha</small>
                  <b>{numero(c.numero)}</b>
                </div>
                <div className="stub-body">
                  <div className="ticket-title">
                    {bloqueioDa(c) && <span className="flag flag-bloqueio" style={{ marginRight: 6 }}><Ban size={11} aria-hidden="true" /> {rotuloDoBloqueio(bloqueioDa(c))}</span>}
                    {c.prioridade === 'alta' && <span className="flag" style={{ marginRight: 6 }}>urgente</span>}
                    {c.titulo || c.motivo || 'Conversa com o assistente'}
                  </div>
                  <div className="ticket-sub">
                    {nomeCliente(c)}{assistentes[c.assistant_id] ? ` · ${assistentes[c.assistant_id]}` : ''}
                  </div>
                  <div className="ticket-meta">
                    {!c.lido_em && c.status === 'waiting' && <span className="badge badge-waiting">novo</span>}
                    {canalDe(c) && <SeloCanal tipo={canalDe(c)} />}
                    <SeloEtapa etapa={etapas[c.id]} />
                    <span>{quando(c.last_message_at)}</span>
                    <span>· {c.message_count} msgs</span>
                    {c.nota && <span>· {estrelas(c.nota)}</span>}
                  </div>
                </div>
              </div>
            </button>
            </SwipeRow>
          ))}
        </div>
      </section>

      {/* ---------- conversa ---------- */}
      <section className="inbox-detail" aria-label="Conversa">
        {!aberta ? (
          <div style={{ margin: 'auto', padding: 24, textAlign: 'center', maxWidth: 420 }}>
            <h2 style={{ fontSize: 22 }}>Escolha um atendimento</h2>
            <p className="muted" style={{ marginTop: 8 }}>
              Você vê a conversa inteira com o assistente, assume de onde ele parou e encerra quando resolver.
            </p>
          </div>
        ) : (
          <>
            <header className="detail-head">
              <button type="button" className="btn btn-quiet btn-icon" onClick={() => abrir(null)} aria-label="Voltar para a lista">
                <ArrowLeft />
              </button>
              <div style={{ flex: 1, minWidth: 200 }}>
                <p className="eyebrow">{numero(aberta.numero)}{assistentes[aberta.assistant_id] ? ` · ${assistentes[aberta.assistant_id]}` : ''}</p>
                <h2 style={{ marginTop: 4 }}>{aberta.titulo || aberta.motivo || 'Conversa com o assistente'}</h2>
                <div className="row" style={{ marginTop: 8 }}>
                  <span className={`badge ${STATUS[aberta.status].classe}`}>{STATUS[aberta.status].rotulo}</span>
                  {canalDe(aberta) && <SeloCanal tipo={canalDe(aberta)} />}
                  {aberta.assumido_nome && aberta.status === 'human' && <span className="faint" style={{ fontSize: 13 }}>com {aberta.assumido_nome}</span>}
                </div>
              </div>
              {/* uma ação principal por vez; as outras ficam pequenas ao lado */}
              <div className="row row-wrap detail-acoes">
                {(aberta.status === 'waiting' || aberta.status === 'bot') && (
                  <button type="button" className="btn btn-senha" onClick={assumir}><Hand /> Assumir</button>
                )}
                {(aberta.status === 'waiting' || aberta.status === 'human') && (
                  <button type="button" className="btn btn-ghost btn-sm" title="Devolver ao assistente" onClick={() => setConfirmar('devolver')}><Headset /> Devolver</button>
                )}
                {/* devolvida ao assistente, a conversa deixa de ser chamado: não há o que encerrar */}
                {(aberta.status === 'waiting' || aberta.status === 'human') && (
                  // na fila, a ação da vez é assumir; encerrar só ganha destaque depois
                  <button type="button" className={`btn ${aberta.status === 'human' ? 'btn-primary' : 'btn-ghost btn-sm'}`} onClick={() => setConfirmar('encerrar')}><CheckCircle2 /> Encerrar</button>
                )}
                {aberta.status === 'closed' && (
                  <button type="button" className="btn btn-ghost" onClick={reabrir}><RotateCcw /> Reabrir</button>
                )}
                {!bloqueioDa(aberta) && !aberta.teste && (
                  <button type="button" className="btn btn-quiet btn-sm" title="Timeout ou banir" onClick={() => setBloquear(true)}><Ban /> Bloquear</button>
                )}
              </div>
            </header>

            {bloqueioDa(aberta) && (
              <div className="alert alert-erro aviso-bloqueio">
                <Ban size={18} aria-hidden="true" />
                <span>
                  <b>{bloqueioDa(aberta).banido ? 'Pessoa banida.' : `Em ${rotuloDoBloqueio(bloqueioDa(aberta))}.`}</b>{' '}
                  O assistente não responde ela enquanto valer.
                </span>
                <button type="button" className="btn btn-ghost btn-sm" onClick={desbloquear}>Desbloquear</button>
              </div>
            )}

            {/* no celular os dados começam fechados: a conversa fica com a tela */}
            <details className="detail-dados" open={!CELULAR}>
            <summary>Dados do cliente e resumo</summary>
            <dl className="detail-info">
              <div><dt>Cliente</dt><dd>{nomeCliente(aberta)}</dd></div>
              <div><dt>Contato</dt><dd>{aberta.lead_contato || <span className="faint">não informado</span>}</dd></div>
              {aberta.motivo && <div><dt>Motivo</dt><dd>{aberta.motivo}</dd></div>}
              {aberta.lead_interesse && <div><dt>Interesse</dt><dd>{aberta.lead_interesse}</dd></div>}
              {aberta.resumo && <div style={{ gridColumn: '1 / -1' }}><dt>Resumo do assistente</dt><dd>{aberta.resumo}</dd></div>}
              <AgendaDoChamado key={aberta.id} conversa={aberta} onMudou={() => carregarAberta(aberta.id)} />
              {aberta.nota && (
                <div style={{ gridColumn: '1 / -1' }}>
                  <dt>Avaliação</dt>
                  <dd>{estrelas(aberta.nota)}{aberta.feedback_texto ? ` — “${aberta.feedback_texto}”` : ''}</dd>
                </div>
              )}
              {eventos.length > 0 && <HistoricoDoChamado eventos={eventos} />}
            </dl>
            </details>

            <div className="chat-scroll" style={{ flex: 1 }}>
              {mensagens.map((m) => (
                <div
                  key={m.id}
                  className={`msg ${m.role === 'user' ? 'msg-bot' : m.role === 'agent' ? 'msg-user' : m.role === 'system' ? 'msg-system' : 'msg-agent msg-do-lado'}`}
                >
                  <span className="msg-who">
                    {m.role === 'user' ? nomeCliente(aberta) : m.role === 'agent' ? m.author_name || 'Equipe' : m.role === 'assistant' ? assistentes[aberta.assistant_id] ?? 'Assistente' : 'Aviso'}
                    {' · '}
                    {new Date(m.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <div className="msg-body">{m.content}</div>
                </div>
              ))}
              <div ref={fim} />
            </div>

            <div className="composer">
              {aberta.status === 'closed' ? (
                <p className="faint" style={{ fontSize: 14 }}>
                  Encerrado{aberta.encerrado_por ? ` ${{ equipe: 'pela equipe', cliente: 'pelo cliente', assistente: 'pelo assistente' }[aberta.encerrado_por] ?? ''}` : ''}.{' '}
                  <button type="button" className="link-btn" onClick={reabrir}>Reabrir para responder</button>
                </p>
              ) : (
                <>
                  <div className="composer-row">
                    <textarea
                      rows={1}
                      value={resposta}
                      placeholder={aberta.status === 'human' ? 'Responder ao cliente…' : 'Responder…'}
                      disabled={enviando}
                      aria-label="Resposta"
                      onChange={(e) => setResposta(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          responder();
                        }
                      }}
                    />
                    <button type="button" className="btn btn-primary btn-icon" disabled={!resposta.trim() || enviando} onClick={responder} aria-label="Enviar resposta">
                      <ArrowUp />
                    </button>
                  </div>
                  <div className="composer-note">
                    O cliente vê como {atendente}, na mesma conversa.{aberta.status !== 'human' && ' Responder assume o chamado e pausa o assistente.'}
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </section>

      {bloquear && aberta && (
        <BloquearModal
          conversa={aberta}
          atendente={atendente}
          onFechar={() => setBloquear(false)}
          onFeito={() => {
            setBloquear(false);
            carregarAberta(aberta.id);
            carregar();
          }}
        />
      )}
      <Confirmar
        aberto={confirmar === 'encerrar'}
        titulo="Encerrar este chamado?"
        texto="O cliente vê que o atendimento terminou e pode avaliar. Se ele escrever de novo, o chamado reabre sozinho."
        acao="Encerrar"
        onConfirmar={() => {
          setConfirmar(null);
          encerrar();
        }}
        onFechar={() => setConfirmar(null)}
      />
      <Confirmar
        aberto={confirmar === 'devolver'}
        titulo="Devolver ao assistente?"
        texto="Ele volta a responder esta conversa sozinho. Use quando o assunto que precisava de alguém já foi resolvido."
        acao="Devolver"
        onConfirmar={() => {
          setConfirmar(null);
          devolver();
        }}
        onFechar={() => setConfirmar(null)}
      />
    </div>
  );
}

const ROTULO_EVENTO = {
  aberto: 'Chamado aberto',
  assumido: 'Assumido',
  devolvido: 'Devolvido ao assistente',
  encerrado: 'Encerrado',
  reaberto: 'Reaberto',
};

/** O que aconteceu com o chamado, passo a passo (só a equipe vê). */
function HistoricoDoChamado({ eventos }) {
  return (
    <div style={{ gridColumn: '1 / -1' }}>
      <details className="historico-chamado">
        <summary>Histórico do chamado <span className="faint">· {eventos.length} {eventos.length === 1 ? 'passo' : 'passos'}</span></summary>
        <ol>
          {eventos.map((e) => (
            <li key={e.id} data-tipo={e.tipo}>
              <span className="historico-ponto" aria-hidden="true" />
              <div>
                <b>{ROTULO_EVENTO[e.tipo] ?? e.tipo}</b>
                {e.quem && <span> {e.tipo === 'aberto' ? 'pelo' : 'por'} {e.quem}</span>}
                {e.detalhe && <div className="faint">{e.detalhe}</div>}
              </div>
              <time className="faint" dateTime={e.criado_em} title={new Date(e.criado_em).toLocaleString('pt-BR')}>{quando(e.criado_em)}</time>
            </li>
          ))}
        </ol>
      </details>
    </div>
  );
}
