import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ArrowUp, Star } from 'lucide-react';
import { chamar } from '@/lib/supabase';
import { Marca } from '@/components/Logo';
import { numero } from '@/lib/format';

function visitante() {
  try {
    let v = localStorage.getItem('helpy_visitante');
    if (!v) {
      v = crypto.randomUUID?.() ?? `v${Date.now()}${Math.random().toString(36).slice(2)}`;
      localStorage.setItem('helpy_visitante', v);
    }
    return v;
  } catch {
    window.__helpyVisitante ??= `t${Date.now()}${Math.random().toString(36).slice(2)}`;
    return window.__helpyVisitante;
  }
}

const lembrar = (chave, valor) => {
  try {
    if (valor) localStorage.setItem(chave, valor);
    else localStorage.removeItem(chave);
  } catch {
    /* navegador sem armazenamento: a conversa vale só nesta aba */
  }
};

const ler = (chave) => {
  try {
    return localStorage.getItem(chave);
  } catch {
    return null;
  }
};

/**
 * A conversa com o atendente. Usada no link público (/c/:token) e no
 * teste do dono (modoTeste, com o id do assistente).
 */
export function Conversa({ token, assistantId, modoTeste = false, cabecalho = true }) {
  const visitorId = useRef(modoTeste ? `teste-${assistantId}` : visitante()).current;
  const chaveConversa = modoTeste ? `helpy_teste_${assistantId}` : `helpy_conv_${token}`;
  const base = modoTeste ? { teste: true, assistant_id: assistantId } : { token };

  const [info, setInfo] = useState(null);
  const [fatal, setFatal] = useState(null);
  const [conversa, setConversa] = useState(() => ler(chaveConversa));
  const [estado, setEstado] = useState({ status: 'bot' });
  const [mensagens, setMensagens] = useState([]);
  const [texto, setTexto] = useState('');
  const [pensando, setPensando] = useState(false);
  const [nota, setNota] = useState(0);
  const [comentario, setComentario] = useState('');
  const [avaliou, setAvaliou] = useState(false);
  const ultimoAgente = useRef(null);
  const fim = useRef(null);
  const area = useRef(null);

  const absorver = (d) => {
    if (!d) return;
    setEstado((p) => ({ ...p, ...Object.fromEntries(Object.entries({ status: d.status, numero: d.numero, assumido: d.assumido, assumido_nome: d.assumido_nome }).filter(([, v]) => v !== undefined)) }));
    if (d.ja_avaliou) setAvaliou(true);
  };

  // ---- abertura ----
  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const i = await chamar('public-chat', { ...base, action: 'info' });
        if (!vivo) return;
        setInfo(i);
        const salva = ler(chaveConversa);
        if (salva) {
          const h = await chamar('public-chat', { ...base, action: 'history', conversation_id: salva, visitor_id: visitorId });
          if (!vivo) return;
          if (h.messages?.length) {
            setMensagens(h.messages);
            absorver(h);
            ultimoAgente.current = [...h.messages].reverse().find((m) => m.role === 'agent')?.created_at ?? null;
          } else {
            lembrar(chaveConversa, null);
            setConversa(null);
          }
        }
      } catch (e) {
        if (vivo) setFatal(e.message);
      }
    })();
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, assistantId]);

  // ---- respostas da equipe chegam por consulta periódica ----
  useEffect(() => {
    if (!conversa) return;
    const t = setInterval(async () => {
      try {
        const d = await chamar('public-chat', { ...base, action: 'poll', conversation_id: conversa, visitor_id: visitorId, desde: ultimoAgente.current });
        absorver(d);
        if (d.messages?.length) {
          ultimoAgente.current = d.messages.at(-1).created_at;
          setMensagens((p) => [...p, ...d.messages]);
        }
      } catch {
        /* consulta de fundo: silenciosa */
      }
    }, 8000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversa]);

  useEffect(() => {
    fim.current?.scrollIntoView({ block: 'end' });
  }, [mensagens, pensando, estado.status]);

  useEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, [texto]);

  const enviar = useCallback(async () => {
    const content = texto.trim();
    if (!content || pensando) return;
    setTexto('');
    setMensagens((p) => [...p, { role: 'user', content }]);
    setPensando(true);
    try {
      const d = await chamar('public-chat', { ...base, action: 'message', content, conversation_id: conversa, visitor_id: visitorId });
      if (d.conversation_id && d.conversation_id !== conversa) {
        setConversa(d.conversation_id);
        lembrar(chaveConversa, d.conversation_id);
      }
      absorver(d);
      if (d.message) setMensagens((p) => [...p, { role: d.modo === 'recado' ? 'system' : 'assistant', content: d.message }]);
    } catch (e) {
      setMensagens((p) => [...p, { role: 'system', content: e.message }]);
    } finally {
      setPensando(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texto, pensando, conversa]);

  const acao = async (action, extra = {}) => {
    try {
      const d = await chamar('public-chat', { ...base, action, conversation_id: conversa, visitor_id: visitorId, ...extra });
      return d;
    } catch {
      return null;
    }
  };

  const avaliar = async () => {
    if (!nota) return;
    await acao('feedback', { nota, texto: comentario });
    setAvaliou(true);
  };

  const reabrir = async () => {
    const d = await acao('reabrir');
    if (d) {
      setEstado((p) => ({ ...p, status: d.status }));
      setAvaliou(false);
      setNota(0);
    }
  };

  const encerrar = async () => {
    const d = await acao('encerrar');
    if (d) setEstado((p) => ({ ...p, status: 'closed' }));
  };

  const novaConversa = () => {
    lembrar(chaveConversa, null);
    setConversa(null);
    setMensagens([]);
    setEstado({ status: 'bot' });
    setAvaliou(false);
    setNota(0);
  };

  if (fatal) {
    return (
      <div className="publico" style={{ placeItems: 'center', display: 'grid', padding: 16 }}>
        <div className="stack" style={{ alignItems: 'center', textAlign: 'center', maxWidth: 380 }}>
          <Marca size={48} />
          <h1 style={{ fontSize: 24 }}>Atendimento indisponível</h1>
          <p className="muted">{fatal}</p>
        </div>
      </div>
    );
  }

  const nome = info?.name || 'Atendimento';
  const fechado = estado.status === 'closed';
  const humano = estado.status === 'waiting' || estado.status === 'human';

  return (
    <div className="publico" style={modoTeste ? { minHeight: 0, height: '100%' } : undefined}>
      {cabecalho && (
        <header className="publico-top">
          <div className="publico-top-in">
            <span className="publico-avatar" aria-hidden="true">{nome[0]?.toUpperCase()}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <b style={{ display: 'block' }}>{nome}</b>
              <span className="faint" style={{ fontSize: 13 }}>{info?.negocio || 'Atendimento online'}</span>
            </div>
            {estado.numero && (
              <span className="badge badge-plain mono" title="Número do seu atendimento">{numero(estado.numero)}</span>
            )}
          </div>
        </header>
      )}

      <div className="chat-scroll publico-in" aria-live="polite">
        {mensagens.length === 0 && info && (
          <div className="msg msg-bot">
            <span className="msg-who">{nome}</span>
            <div className="msg-body">{info.saudacao || `Oi! Sou ${nome}${info.negocio ? `, do atendimento de ${info.negocio}` : ''}. Como posso ajudar?`}</div>
          </div>
        )}

        {mensagens.map((m, i) => (
          <div key={i} className={`msg ${m.role === 'user' ? 'msg-user' : m.role === 'agent' ? 'msg-agent' : m.role === 'system' ? 'msg-system' : 'msg-bot'}`}>
            {m.role === 'assistant' && <span className="msg-who">{nome}</span>}
            {m.role === 'agent' && <span className="msg-who">{m.author_name || estado.assumido_nome || 'Equipe'} · equipe</span>}
            <div className="msg-body">{m.content}</div>
          </div>
        ))}

        {pensando && !humano && (
          <div className="msg msg-bot">
            <span className="msg-who">{nome}</span>
            <div className="msg-body typing" aria-label="Digitando"><i /><i /><i /></div>
          </div>
        )}

        {estado.status === 'waiting' && (
          <div className="stub stub-senha ticket-aviso">
            <div className="stub-num"><small>Sua senha</small><b>{numero(estado.numero)}</b></div>
            <div className="stub-body">
              <b>Chamado aberto para a equipe</b>
              <p style={{ fontSize: 13 }}>Alguém vai responder por aqui. Pode deixar a página aberta ou voltar por este mesmo link.</p>
            </div>
          </div>
        )}
        {estado.status === 'human' && (
          <div className="alert alert-ok ticket-aviso">
            <span><b>{estado.assumido_nome || 'Uma pessoa da equipe'}</b> está cuidando do seu atendimento.</span>
          </div>
        )}

        {fechado && !avaliou && (
          <div className="card stack ticket-aviso">
            <b>Atendimento encerrado. Como foi?</b>
            <div className="estrelas" role="radiogroup" aria-label="Nota de 1 a 5">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button" className="estrela" role="radio" aria-checked={nota === n} aria-label={`${n} de 5`} data-on={nota >= n} onClick={() => setNota(n)}>
                  <Star fill={nota >= n ? 'currentColor' : 'none'} />
                </button>
              ))}
            </div>
            <textarea className="textarea" rows={2} placeholder="Quer contar algo? (opcional)" value={comentario} onChange={(e) => setComentario(e.target.value)} />
            <div className="row row-wrap">
              <button type="button" className="btn btn-primary" disabled={!nota} onClick={avaliar}>Enviar avaliação</button>
              <button type="button" className="btn btn-ghost" onClick={reabrir}>Ainda preciso de ajuda</button>
            </div>
          </div>
        )}
        {fechado && avaliou && (
          <div className="msg msg-system">
            <div className="msg-body">
              Obrigado! Atendimento encerrado. <button type="button" className="link-btn" onClick={novaConversa}>Começar outra conversa</button>
            </div>
          </div>
        )}
        <div ref={fim} />
      </div>

      <div className="composer">
        <div className="publico-in">
          <div className="composer-row">
            <textarea
              ref={area}
              rows={1}
              value={texto}
              disabled={pensando || fechado || !info}
              placeholder={fechado ? 'Atendimento encerrado' : humano ? 'Escreva para a equipe…' : 'Escreva sua mensagem…'}
              aria-label="Mensagem"
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  enviar();
                }
              }}
            />
            <button type="button" className="btn btn-primary btn-icon" disabled={!texto.trim() || pensando || fechado} onClick={enviar} aria-label="Enviar">
              <ArrowUp />
            </button>
          </div>
          <div className="composer-note">
            {modoTeste ? (
              <span>Modo teste: não conta na cota nem aparece nos atendimentos. <button type="button" className="link-btn" onClick={novaConversa}>Recomeçar</button></span>
            ) : mensagens.length > 1 && !fechado ? (
              <span>Resolvido? <button type="button" className="link-btn" onClick={encerrar}>Encerrar atendimento</button></span>
            ) : (
              <span>Atendimento automático com apoio da equipe.</span>
            )}
          </div>
          {!modoTeste && (
            <p className="feito-com">
              feito com <a href="/" target="_blank" rel="noreferrer">helpy</a>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ChatPublico() {
  const { token } = useParams();
  return <Conversa token={token} />;
}
