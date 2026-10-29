import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { ArrowLeft, CircleCheck, Headset, Loader2, Send, Star, UserRound } from 'lucide-react';
import { Marca } from '@/components/Logo';
import TextoFormatado from '@/components/TextoFormatado';
import { useToast } from '@/components/Toasts';
import { chamar } from '@/lib/supabase';
import { numero, quando } from '@/lib/format';
import { CATEGORIAS, SITUACAO } from '@/lib/ajuda';
import { BASE, SeloSituacao } from './Suporte';

const hora = (iso) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

// "eu" fica à direita: a empresa na visão dela, a equipe Helpy na visão da equipe
function Mensagem({ m, staff }) {
  if (m.autor === 'sistema') return <p className="suporte-marco">{m.texto} · {hora(m.criado_em)}</p>;
  const minha = staff ? m.autor === 'equipe' : m.autor === 'cliente';
  return (
    <div className={`suporte-msg${minha ? ' suporte-msg-eu' : ''}`} data-autor={m.autor}>
      <span className="suporte-msg-avatar" aria-hidden="true">
        {m.autor === 'ia' ? <Marca size={26} olhar={false} /> : m.autor === 'equipe' ? <Headset size={16} /> : <UserRound size={16} />}
      </span>
      <div>
        <span className="suporte-msg-quem">
          {m.autor === 'ia' ? 'Assistente do suporte' : m.autor === 'equipe' ? m.autor_nome || 'Equipe Helpy' : m.autor_nome || 'Você'}
          {m.autor === 'equipe' && <span className="suporte-selo-equipe">Equipe Helpy</span>}
          <time dateTime={m.criado_em}>{hora(m.criado_em)}</time>
        </span>
        <div className="suporte-msg-corpo">
          {m.autor === 'cliente' ? m.texto : <TextoFormatado texto={m.texto} />}
        </div>
      </div>
    </div>
  );
}

export default function Chamado() {
  const { id } = useParams();
  const { state } = useLocation();
  const avisar = useToast();
  const [ch, setCh] = useState(state?.chamado ?? null);
  const [erro, setErro] = useState('');
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [resolverJunto, setResolverJunto] = useState(false);
  const fim = useRef(null);
  const staff = !!ch?.empresa; // a função só manda os dados da empresa para a equipe Helpy

  const carregar = useCallback(async () => {
    try {
      setCh((await chamar('suporte', { action: 'ver', id })).chamado);
    } catch (e) {
      setErro(e.message);
    }
  }, [id]);
  useEffect(() => {
    carregar();
    // a resposta da equipe aparece sem recarregar a página
    const t = setInterval(carregar, 20000);
    return () => clearInterval(t);
  }, [carregar]);
  useEffect(() => {
    fim.current?.scrollIntoView({ block: 'end' });
  }, [ch?.mensagens?.length]);

  const agir = async (action, extra = {}, ok) => {
    setEnviando(true);
    try {
      setCh((await chamar('suporte', { action, id, ...extra })).chamado);
      if (ok) avisar(ok);
      return true;
    } catch (e) {
      avisar('Não deu certo', { erro: true, texto: e.message });
      return false;
    } finally {
      setEnviando(false);
    }
  };
  const enviar = async (e) => {
    e.preventDefault();
    if (!texto.trim()) return;
    const feito = staff
      ? await agir('equipe_responder', { texto, resolver: resolverJunto }, resolverJunto ? 'Respondido e resolvido' : 'Resposta enviada')
      : await agir('responder', { texto });
    if (feito) {
      setTexto('');
      setResolverJunto(false);
    }
  };

  if (erro && !ch) {
    return (
      <div className="page suporte">
        <Link to={BASE} className="link-btn suporte-voltar"><ArrowLeft size={15} /> Ajuda</Link>
        <div className="empty"><h3>Não deu para abrir o chamado</h3><p>{erro}</p></div>
      </div>
    );
  }
  if (!ch) return <div className="page suporte"><div className="skeleton" style={{ height: 320 }} /></div>;

  const cat = CATEGORIAS.find((c) => c.id === ch.categoria);
  const ultimaIa = ch.status === 'ia' && ch.mensagens.at(-1)?.autor === 'ia';

  return (
    <div className="page suporte suporte-chamado">
      <Link to={staff ? `${BASE}/fila` : BASE} className="link-btn suporte-voltar"><ArrowLeft size={15} /> {staff ? 'Fila do suporte' : 'Ajuda'}</Link>

      <header className="suporte-chamado-cab">
        <div>
          <p className="eyebrow">{numero(ch.numero)} · {cat?.nome ?? ch.categoria}{ch.prioridade === 'alta' ? ' · prioridade' : ''}</p>
          <h1>{ch.assunto}</h1>
          <p className="faint" style={{ margin: 0, fontSize: 13 }}>Aberto {quando(ch.criado_em)} · {SITUACAO[ch.status]?.dica}</p>
        </div>
        <SeloSituacao status={ch.status} />
      </header>

      <div className={staff ? 'suporte-chamado-grade' : ''}>
        <section className="card suporte-conversa" aria-label="Conversa do chamado">
          {ch.mensagens.map((m) => <Mensagem key={m.id} m={m} staff={staff} />)}

          {ultimaIa && !staff && (
            <div className="suporte-resolveu" role="group" aria-label="A resposta resolveu?">
              <span>A resposta resolveu?</span>
              <button type="button" className="btn btn-ghost btn-sm" disabled={enviando} onClick={() => agir('resolver', {}, 'Chamado resolvido')}>
                <CircleCheck size={15} /> Resolveu
              </button>
              <button type="button" className="btn btn-primary btn-sm" disabled={enviando} onClick={() => agir('escalar', {}, 'Passamos para a equipe Helpy')}>
                <Headset size={15} /> Falar com a equipe
              </button>
            </div>
          )}

          {ch.status === 'resolvido' && !staff && !ch.nota && <Avaliar onNota={(nota) => agir('avaliar', { nota }, 'Obrigado pela avaliação')} />}
          {ch.status === 'resolvido' && ch.nota && <p className="suporte-marco">Avaliação: {'★'.repeat(ch.nota)}{'☆'.repeat(5 - ch.nota)}</p>}
          <div ref={fim} />

          <form className="suporte-responder" onSubmit={enviar}>
            <textarea
              className="textarea"
              rows={3}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              maxLength={staff ? 5000 : 4000}
              aria-label={staff ? 'Responder como equipe Helpy' : 'Responder'}
              placeholder={staff ? 'Responder como equipe Helpy…' : ch.status === 'resolvido' ? 'Voltou a acontecer? Escreva aqui que o chamado reabre.' : 'Mande mais detalhes para a equipe…'}
            />
            <div className="row row-wrap" style={{ justifyContent: 'space-between' }}>
              {staff ? (
                <label className="check" style={{ fontSize: 13 }}>
                  <input type="checkbox" checked={resolverJunto} onChange={(e) => setResolverJunto(e.target.checked)} /> Responder e marcar como resolvido
                </label>
              ) : (
                <span className="faint" style={{ fontSize: 12.5 }}>Nunca mande senha, token ou dados de cartão.</span>
              )}
              <div className="row" style={{ gap: 8 }}>
                {!staff && ch.status !== 'resolvido' && ch.status !== 'ia' && (
                  <button type="button" className="btn btn-quiet btn-sm" disabled={enviando} onClick={() => agir('resolver', {}, 'Chamado resolvido')}>Já resolveu</button>
                )}
                <button type="submit" className="btn btn-primary btn-sm" disabled={enviando || !texto.trim()}>
                  {enviando ? <Loader2 className="spin" /> : <Send size={15} />} Enviar
                </button>
              </div>
            </div>
          </form>
        </section>

        {staff && <PainelEquipe ch={ch} agir={agir} enviando={enviando} />}
      </div>
    </div>
  );
}

function Avaliar({ onNota }) {
  const [sobre, setSobre] = useState(0);
  return (
    <div className="suporte-avaliar" role="group" aria-label="Avalie o atendimento">
      <span>Como foi o atendimento?</span>
      <span className="suporte-estrelas" onMouseLeave={() => setSobre(0)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" aria-label={`${n} de 5`} onMouseEnter={() => setSobre(n)} onFocus={() => setSobre(n)} onClick={() => onNota(n)}>
            <Star size={20} fill={n <= sobre ? 'currentColor' : 'none'} />
          </button>
        ))}
      </span>
    </div>
  );
}

const NIVEL = { problema: 'Problema', atencao: 'Atenção', ok: 'Ok' };

/** Só a equipe Helpy: quem abriu, o retrato da conta no momento e os controles. */
function PainelEquipe({ ch, agir, enviando }) {
  return (
    <aside className="card suporte-equipe-lado">
      <h2>Empresa</h2>
      <dl className="detail-info suporte-equipe-dl">
        <div><dt>Nome</dt><dd>{ch.empresa.nome}</dd></div>
        <div><dt>Plano</dt><dd>{ch.empresa.plano ?? '—'}</dd></div>
        <div><dt>Quem abriu</dt><dd>{ch.empresa.email ?? '—'}</dd></div>
      </dl>
      <div className="row row-wrap" style={{ gap: 6 }}>
        {ch.status !== 'resolvido' ? (
          <button type="button" className="btn btn-ghost btn-sm" disabled={enviando} onClick={() => agir('equipe_status', { status: 'resolvido' }, 'Resolvido')}>Marcar resolvido</button>
        ) : (
          <button type="button" className="btn btn-ghost btn-sm" disabled={enviando} onClick={() => agir('equipe_status', { status: 'fila' }, 'Reaberto')}>Reabrir</button>
        )}
        <button type="button" className="btn btn-quiet btn-sm" disabled={enviando} onClick={() => agir('equipe_status', { prioridade: ch.prioridade === 'alta' ? 'normal' : 'alta' })}>
          {ch.prioridade === 'alta' ? 'Tirar prioridade' : 'Dar prioridade'}
        </button>
      </div>
      <h2>Conta quando abriu</h2>
      <ul className="suporte-diag-lista suporte-diag-mini">
        {(ch.diagnostico ?? []).map((d) => (
          <li key={d.id} data-nivel={d.nivel}>
            <div><b>{NIVEL[d.nivel]}: {d.titulo}</b><span>{d.detalhe}</span></div>
          </li>
        ))}
      </ul>
    </aside>
  );
}
