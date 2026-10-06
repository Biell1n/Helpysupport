import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowUp, Bot, CheckCircle2, Hand, RotateCcw, Search } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/Toasts';
import { Confirmar } from '@/components/Modal';
import { numero, quando, STATUS } from '@/lib/format';

const ABAS = [
  { id: 'waiting', rotulo: 'Na fila' },
  { id: 'human', rotulo: 'Atendendo' },
  { id: 'bot', rotulo: 'Assistente' },
  { id: 'closed', rotulo: 'Encerrados' },
];

const nomeCliente = (c) => c.lead_nome?.trim() || 'Visitante';
const estrelas = (n) => '★'.repeat(n) + '☆'.repeat(5 - n);

export default function Atendimentos() {
  const { recarregarUso } = useOutletContext();
  const { user, nome } = useAuth();
  const avisar = useToast();
  const [params, setParams] = useSearchParams();
  const abertaId = params.get('id');

  const [aba, setAba] = useState('waiting');
  const [busca, setBusca] = useState('');
  const [conversas, setConversas] = useState(null);
  const [contagem, setContagem] = useState({});
  const [assistentes, setAssistentes] = useState({});
  const [aberta, setAberta] = useState(null);
  const [mensagens, setMensagens] = useState([]);
  const [resposta, setResposta] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [confirmar, setConfirmar] = useState(null);
  const fim = useRef(null);

  const atendente = nome || user?.email?.split('@')[0] || 'Equipe';

  // ---- lista ----
  const carregar = useCallback(async () => {
    const [{ data }, ...counts] = await Promise.all([
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
    setConversas(data ?? []);
    setContagem(Object.fromEntries(ABAS.map((a, i) => [a.id, counts[i].count ?? 0])));
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
  const carregarAberta = useCallback(async (id) => {
    const [{ data: c }, { data: msgs }] = await Promise.all([
      supabase.from('conversations').select('*').eq('id', id).maybeSingle(),
      supabase.from('conversation_messages').select('id, role, content, author_name, created_at').eq('conversation_id', id).order('created_at').limit(300),
    ]);
    if (c) setAberta(c);
    setMensagens(msgs ?? []);
    if (c && !c.lido_em) await supabase.from('conversations').update({ lido_em: new Date().toISOString() }).eq('id', id);
  }, []);

  useEffect(() => {
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

  const atualizar = async (patch, msgOk) => {
    const { error } = await supabase.from('conversations').update(patch).eq('id', aberta.id);
    if (error) {
      avisar('Não deu para atualizar o chamado', { erro: true, texto: error.message });
      return false;
    }
    if (msgOk) avisar(msgOk.titulo, { texto: msgOk.texto });
    await Promise.all([carregarAberta(aberta.id), carregar()]);
    recarregarUso();
    return true;
  };

  const assumir = () =>
    atualizar(
      { status: 'human', assumido_por: user.id, assumido_nome: atendente, assumido_em: new Date().toISOString() },
      { titulo: 'Chamado assumido', texto: 'O cliente vê que você está no atendimento.' },
    );

  const encerrar = () =>
    atualizar(
      { status: 'closed', fechado_em: new Date().toISOString(), encerrado_por: 'equipe' },
      { titulo: 'Chamado encerrado', texto: 'O cliente foi convidado a avaliar o atendimento.' },
    );

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

  const responder = async () => {
    const texto = resposta.trim();
    if (!texto || enviando) return;
    setEnviando(true);
    try {
      const { error } = await supabase.from('conversation_messages').insert({
        conversation_id: aberta.id,
        role: 'agent',
        content: texto,
        author_name: atendente,
      });
      if (error) throw error;
      // responder já é assumir: o assistente para de falar por cima
      if (aberta.status !== 'human') {
        await supabase
          .from('conversations')
          .update({ status: 'human', assumido_por: user.id, assumido_nome: atendente, assumido_em: aberta.assumido_em ?? new Date().toISOString() })
          .eq('id', aberta.id);
      }
      setResposta('');
      await Promise.all([carregarAberta(aberta.id), carregar()]);
    } catch (e) {
      avisar('Mensagem não enviada', { erro: true, texto: e.message });
    } finally {
      setEnviando(false);
    }
  };

  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!conversas || !q) return conversas;
    return conversas.filter((c) =>
      [c.titulo, c.motivo, c.resumo, c.lead_nome, c.lead_contato, String(c.numero)].some((v) => String(v ?? '').toLowerCase().includes(q)),
    );
  }, [conversas, busca]);

  return (
    <div className="inbox" data-aberto={aberta ? 'true' : 'false'}>
      {/* ---------- fila ---------- */}
      <section className="inbox-list" aria-label="Lista de atendimentos">
        <div className="inbox-list-head">
          <h1 style={{ fontSize: 26 }}>Atendimentos</h1>
          <div className="tabs" role="tablist">
            {ABAS.map((a) => (
              <button key={a.id} type="button" role="tab" className="tab" aria-selected={aba === a.id} onClick={() => setAba(a.id)}>
                {a.rotulo}
                {contagem[a.id] > 0 && a.id !== 'closed' && <span className="mono">{contagem[a.id]}</span>}
              </button>
            ))}
          </div>
          <label className="row" style={{ position: 'relative' }}>
            <Search size={16} style={{ position: 'absolute', left: 12, color: 'var(--tinta-3)' }} aria-hidden="true" />
            <input className="input" style={{ paddingLeft: 36 }} placeholder="Buscar por nome, número ou assunto" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar atendimentos" />
          </label>
        </div>

        <div className="inbox-items">
          {visiveis === null && [0, 1, 2].map((i) => <div key={i} className="skeleton" style={{ height: 76 }} />)}
          {visiveis?.length === 0 && (
            <p className="faint" style={{ padding: 16, textAlign: 'center' }}>
              {aba === 'waiting' ? 'Fila vazia. Quando o assistente precisar de alguém, o chamado chega aqui.' : 'Nada por aqui.'}
            </p>
          )}
          {visiveis?.map((c) => (
            <button key={c.id} type="button" className="ticket" aria-current={aberta?.id === c.id} onClick={() => abrir(c.id)}>
              <div className="stub">
                <div className="stub-num">
                  <small>Senha</small>
                  <b>{numero(c.numero)}</b>
                </div>
                <div className="stub-body">
                  <div className="ticket-title">
                    {c.prioridade === 'alta' && <span className="flag" style={{ marginRight: 6 }}>urgente</span>}
                    {c.titulo || c.motivo || 'Conversa com o assistente'}
                  </div>
                  <div className="ticket-sub">
                    {nomeCliente(c)} · {assistentes[c.assistant_id] ?? 'Assistente'}
                  </div>
                  <div className="ticket-meta">
                    {!c.lido_em && c.status === 'waiting' && <span className="badge badge-waiting">novo</span>}
                    <span>{quando(c.last_message_at)}</span>
                    <span>· {c.message_count} msgs</span>
                    {c.nota && <span>· {estrelas(c.nota)}</span>}
                  </div>
                </div>
              </div>
            </button>
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
                <p className="eyebrow">{numero(aberta.numero)} · {assistentes[aberta.assistant_id] ?? 'Assistente'}</p>
                <h2 style={{ marginTop: 4 }}>{aberta.titulo || aberta.motivo || 'Conversa com o assistente'}</h2>
                <div className="row" style={{ marginTop: 8 }}>
                  <span className={`badge ${STATUS[aberta.status].classe}`}>{STATUS[aberta.status].rotulo}</span>
                  {aberta.assumido_nome && aberta.status === 'human' && <span className="faint" style={{ fontSize: 13 }}>com {aberta.assumido_nome}</span>}
                </div>
              </div>
              <div className="row row-wrap">
                {aberta.status === 'waiting' && (
                  <button type="button" className="btn btn-senha" onClick={assumir}><Hand /> Assumir</button>
                )}
                {(aberta.status === 'waiting' || aberta.status === 'human') && (
                  <button type="button" className="btn btn-ghost" onClick={() => setConfirmar('devolver')}><Bot /> Devolver ao assistente</button>
                )}
                {aberta.status !== 'closed' ? (
                  <button type="button" className="btn btn-primary" onClick={() => setConfirmar('encerrar')}><CheckCircle2 /> Encerrar</button>
                ) : (
                  <button type="button" className="btn btn-ghost" onClick={reabrir}><RotateCcw /> Reabrir</button>
                )}
              </div>
            </header>

            <dl className="detail-info">
              <div><dt>Cliente</dt><dd>{nomeCliente(aberta)}</dd></div>
              <div><dt>Contato</dt><dd>{aberta.lead_contato || <span className="faint">não informado</span>}</dd></div>
              {aberta.motivo && <div><dt>Motivo</dt><dd>{aberta.motivo}</dd></div>}
              {aberta.lead_interesse && <div><dt>Interesse</dt><dd>{aberta.lead_interesse}</dd></div>}
              {aberta.resumo && <div style={{ gridColumn: '1 / -1' }}><dt>Resumo do assistente</dt><dd>{aberta.resumo}</dd></div>}
              {aberta.nota && (
                <div style={{ gridColumn: '1 / -1' }}>
                  <dt>Avaliação</dt>
                  <dd>{estrelas(aberta.nota)}{aberta.feedback_texto ? ` — “${aberta.feedback_texto}”` : ''}</dd>
                </div>
              )}
            </dl>

            <div className="chat-scroll" style={{ flex: 1 }}>
              {mensagens.map((m) => (
                <div
                  key={m.id}
                  className={`msg ${m.role === 'user' ? 'msg-bot' : m.role === 'agent' ? 'msg-user' : m.role === 'system' ? 'msg-system' : 'msg-agent'}`}
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
                  Encerrado{aberta.encerrado_por ? ` pelo ${aberta.encerrado_por === 'equipe' ? 'time' : aberta.encerrado_por}` : ''}.{' '}
                  <button type="button" className="link-btn" onClick={reabrir}>Reabrir para responder</button>
                </p>
              ) : (
                <>
                  <div className="composer-row">
                    <textarea
                      rows={1}
                      value={resposta}
                      placeholder={aberta.status === 'human' ? 'Responder ao cliente…' : 'Responder assume o chamado e pausa o assistente…'}
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
                  <div className="composer-note">O cliente vê como {atendente}, na mesma conversa.</div>
                </>
              )}
            </div>
          </>
        )}
      </section>

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
