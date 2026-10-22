import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowUp, CalendarCheck, CalendarClock, CalendarX, CircleCheckBig, LogIn, UserCheck } from 'lucide-react';
import PeekRating from '@/components/PeekRating';
import Sugestoes from '@/components/Sugestoes';
import { useToast } from '@/components/Toasts';
import BolinhasPensando from '@/components/BolinhasPensando';
import TextoQueChega from '@/components/TextoQueChega';
import { chamar } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { resolverDesafio } from '@/lib/prova';
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
  const [pedeLogin, setPedeLogin] = useState(false);
  const notificar = useToast();
  const statusAntes = useRef(null);
  const { user } = useAuth() ?? {};
  const prova = useRef(null);
  const ultimoAgente = useRef(null);
  const fim = useRef(null);
  const area = useRef(null);

  const absorver = (d) => {
    if (!d) return;
    // alguém da equipe acabou de assumir: aviso na conversa e notificação
    if (d.status === 'human' && statusAntes.current && statusAntes.current !== 'human') {
      const aviso = { role: 'system', author_name: 'evento:assumido', content: `${d.assumido_nome || 'Uma pessoa da equipe'} vai continuar o atendimento com você.` };
      setMensagens((p) => [...p, aviso]);
    }
    if (d.status) statusAntes.current = d.status;
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
        // a barreira contra robôs roda enquanto a pessoa lê e digita
        if (!modoTeste && i.desafio) {
          prova.current = resolverDesafio({ token, visitante: visitorId, agora: i.desafio.agora, bits: i.desafio.bits });
        }
        // "Minhas conversas" abre a conversa certa em qualquer aparelho (?conversa=…, só para a conta dona dela)
        const doLink = modoTeste ? null : new URLSearchParams(window.location.search).get('conversa');
        const salva = doLink || ler(chaveConversa);
        if (doLink) {
          lembrar(chaveConversa, doLink);
          setConversa(doLink);
        }
        if (salva) {
          const h = await chamar('public-chat', { ...base, action: 'history', conversation_id: salva, visitor_id: visitorId });
          if (!vivo) return;
          if (h.messages?.length) {
            setMensagens(h.messages);
            absorver(h);
            ultimoAgente.current = [...h.messages].reverse().find((m) => m.role === 'agent' || m.role === 'system')?.created_at ?? null;
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
          setMensagens((p) => juntar(p, d.messages));
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

  // forcado: o texto de uma sugestão tocada (senão, o que está na caixa)
  const enviar = useCallback(async (forcado) => {
    const content = (typeof forcado === 'string' ? forcado : texto).trim();
    if (!content || pensando) return;
    if (typeof forcado !== 'string') setTexto('');
    setMensagens((p) => [...p, { role: 'user', content }]);
    setPensando(true);
    try {
      const pedido = { ...base, action: 'message', content, conversation_id: conversa, visitor_id: visitorId };
      if (!conversa && prova.current) pedido.prova = await prova.current;
      let d;
      try {
        d = await chamar('public-chat', pedido);
      } catch (e) {
        // prova velha (página aberta há horas): pega uma hora nova e refaz uma vez
        if (conversa || modoTeste || !/navegador/i.test(e.message)) throw e;
        const i = await chamar('public-chat', { ...base, action: 'info' });
        prova.current = resolverDesafio({ token, visitante: visitorId, agora: i.desafio.agora, bits: i.desafio.bits });
        d = await chamar('public-chat', { ...pedido, prova: await prova.current });
      }
      if (d.precisa_login) setPedeLogin(d.motivo_login || true);
      if (d.conversation_id && d.conversation_id !== conversa) {
        setConversa(d.conversation_id);
        lembrar(chaveConversa, d.conversation_id);
      }
      absorver(d);
      if (d.eventos?.length) {
        setMensagens((p) => juntar(p, d.eventos));
        ultimoAgente.current = d.eventos.at(-1).created_at;
      }
      if (d.message) setMensagens((p) => [...p, { role: d.modo === 'recado' || d.modo === 'login' ? 'system' : 'assistant', content: d.message, novo: true }]);
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
            {info?.foto ? <img className="publico-avatar publico-avatar-foto" src={info.foto} alt="" /> : <span className="publico-avatar" aria-hidden="true">{nome[0]?.toUpperCase()}</span>}
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
        {mensagens.length === 0 && !pensando && info?.sugestoes?.length > 0 && (
          <Sugestoes
            rotulo="Toque para perguntar"
            sugestoes={info.sugestoes.map((r, i) => ({ id: `${i}-${r}`, rotulo: r }))}
            onEscolher={(x) => enviar(x.rotulo)}
          />
        )}

        {mensagens.map((m, i) => (
          tipoDoEvento(m) ? <Evento key={i} m={m} /> :
          <div key={i} className={`msg ${m.role === 'user' ? 'msg-user' : m.role === 'agent' ? 'msg-agent' : m.role === 'system' ? 'msg-system' : 'msg-bot'}`}>
            {m.role === 'assistant' && <span className="msg-who">{nome}</span>}
            {m.role === 'agent' && <span className="msg-who">{m.author_name || estado.assumido_nome || 'Equipe'} · equipe</span>}
            <div className="msg-body">{m.novo && m.role === 'assistant' ? <TextoQueChega texto={m.content} /> : m.content}</div>
          </div>
        ))}

        {pensando && !humano && (
          <div className="msg msg-bot">
            <span className="msg-who">{nome}</span>
            <div className="msg-body pensando"><BolinhasPensando /></div>
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
          <div className="chat-presenca" role="status">
            <i aria-hidden="true" /> <b>{estado.assumido_nome || 'Alguém da equipe'}</b> está atendendo você
          </div>
        )}

        {fechado && !avaliou && (
          <div className="card stack ticket-aviso">
            <b>Atendimento encerrado. Como foi?</b>
            <PeekRating
              value={nota}
              onChange={setNota}
              size={30}
              ariaLabel="Nota de 1 a 5"
              labels={['Ruim', 'Fraco', 'Ok', 'Bom', 'Ótimo']}
            />
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
        {pedeLogin && !user && !modoTeste && (
          <div className="card stack ticket-aviso">
            <b>{typeof pedeLogin === 'string' ? `Entre com sua conta ${pedeLogin}` : 'Para falar com a equipe, entre com sua conta'}</b>
            <p className="muted" style={{ fontSize: 13 }}>
              Assim a equipe sabe quem é você e pode responder também por e-mail. Depois de entrar, você volta para esta conversa.
            </p>
            <div className="row row-wrap">
              <Link className="btn btn-primary" to={`/entrar?de=${encodeURIComponent(`/c/${token}`)}`}>
                <LogIn size={16} /> Entrar
              </Link>
              <Link className="btn btn-ghost" to={`/criar-conta?de=${encodeURIComponent(`/c/${token}`)}`}>Criar conta</Link>
            </div>
          </div>
        )}
        <div ref={fim} />
      </div>

      <div className="composer">
        <div className="publico-in">
          <div className="composer-row" data-pensando={pensando || undefined}>
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
            ) : user ? (
              <span>Conectado como {user.email}. A equipe pode responder por aqui.</span>
            ) : (
              <span>
                Atendimento automático.{' '}
                <Link className="link-btn" to={`/entrar?de=${encodeURIComponent(`/c/${token}`)}`}>Entrar</Link> para falar com a equipe.
              </span>
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

// avisos de ação concluída: aparecem destacados na conversa e como notificação
const EVENTOS = {
  agendado: { titulo: 'Horário confirmado', tom: 'ok', Icone: CalendarCheck },
  pendente: { titulo: 'Aguardando confirmação', tom: 'espera', Icone: CalendarClock },
  remarcado: { titulo: 'Horário remarcado', tom: 'info', Icone: CalendarCheck },
  cancelado: { titulo: 'Horário cancelado', tom: 'perigo', Icone: CalendarX },
  assumido: { titulo: 'Atendimento assumido', tom: 'info', Icone: UserCheck },
  pago: { titulo: 'Pagamento confirmado', tom: 'ok', Icone: CircleCheckBig },
};
// a mesma mensagem pode chegar pela consulta periódica e pela resposta do envio: entra uma vez só
const chaveDa = (m) => `${m.role}|${m.author_name ?? ''}|${m.created_at ?? ''}|${m.content}`;
const juntar = (atuais, novas) => {
  const vistas = new Set(atuais.map(chaveDa));
  return [...atuais, ...novas.filter((m) => !vistas.has(chaveDa(m)))];
};
const tipoDoEvento = (m) => (m.role === 'system' && String(m.author_name ?? '').startsWith('evento:') ? m.author_name.slice(7) : null);
// "sábado, 10/10, 10:00 · Corte" (como a agenda escreve o horário)
const DATA = /([a-zà-ú-]+),\s*(\d{2}\/\d{2}),?\s*(?:às\s*)?(\d{1,2}:\d{2})(?:\s*·\s*([^·.]+))?/i;
const VALOR = /R\$\s?[\d.]+,\d{2}/;

/** Avisos na conversa: alguém da equipe entrou vira uma linha discreta; horário e pagamento viram um comprovante. */
function Evento({ m }) {
  const tipo = tipoDoEvento(m);
  const texto = String(m.content ?? '');
  if (tipo === 'assumido') {
    const nome = texto.split(' vai continuar')[0].trim() || 'Uma pessoa da equipe';
    return (
      <div className="chat-marco" role="status">
        <span className="chat-marco-avatar" aria-hidden="true">{nome[0].toUpperCase()}</span>
        <span><b>{nome}</b> entrou na conversa</span>
      </div>
    );
  }
  const { titulo, tom, Icone } = EVENTOS[tipo] ?? { titulo: 'Aviso', tom: 'info', Icone: CalendarCheck };
  const data = texto.match(DATA);
  const valor = texto.match(VALOR)?.[0];
  const detalhe = !data
    ? (valor && texto.replace(/^[^.]*R\$[^.]*\.\s*/, '')) || texto
    : tipo === 'pendente'
      ? 'O negócio ainda vai confirmar. O aviso chega aqui.'
      : valor
        ? `Pagamento de ${valor} recebido.`
        : tipo === 'cancelado'
          ? 'Este horário foi liberado.'
          : 'Está na agenda. Até lá!';
  return (
    <div className="chat-recibo-sombra" role="status">
      <div className="chat-recibo" data-tom={tom} data-tipo={tipo}>
        <div className="chat-recibo-lado">
          {data ? (
            <>
              <small>{data[1].slice(0, 3)}</small>
              <b>{data[2]}</b>
              <span>{data[3]}</span>
            </>
          ) : (
            <>
              <small>{tipo === 'pago' ? 'Pago' : 'Aviso'}</small>
              <b className="chat-recibo-valor">{valor ?? <Icone size={22} />}</b>
            </>
          )}
        </div>
        <div className="chat-recibo-corpo">
          <span className="chat-recibo-status"><Icone size={14} aria-hidden="true" /> {titulo}</span>
          {data && <b>{data[4]?.trim() || 'Horário marcado'}</b>}
          <p>{detalhe}</p>
        </div>
      </div>
    </div>
  );
}

export default function ChatPublico() {
  const { token } = useParams();
  return <Conversa token={token} />;
}
