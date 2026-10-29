import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, ArrowRight, ChevronRight, CircleX, Loader2, Send } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { chamar, supabase } from '@/lib/supabase';
import { ARTIGOS, CATEGORIAS, buscarArtigos } from '@/lib/ajuda';
import { IconeCategoria } from './CentralAjuda';
import { BASE } from './Suporte';

const PASSOS = ['Assunto', 'Antes de abrir', 'Detalhes'];

/**
 * Abrir chamado em três passos, como nos bons suportes: escolhe o assunto,
 * vê o que já pode resolver (artigos e o que a verificação da conta achou)
 * e só então escreve.
 */
export default function NovoChamado() {
  const { tipo } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [cat, setCat] = useState(() => (CATEGORIAS.some((c) => c.id === params.get('cat')) ? params.get('cat') : null));
  const [passo, setPasso] = useState(() => (params.get('cat') ? 1 : 0));
  const [assunto, setAssunto] = useState(() => params.get('assunto') ?? '');
  const [descricao, setDescricao] = useState('');
  const [assistente, setAssistente] = useState('');
  const [assistentes, setAssistentes] = useState([]);
  const [diag, setDiag] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    if (tipo !== 'empresa') return;
    supabase.from('assistants').select('id, name').order('created_at').then(({ data }) => setAssistentes(data ?? []));
  }, [tipo]);

  // no passo "antes de abrir", a conta é conferida para mostrar o que já se sabe
  useEffect(() => {
    if (passo !== 1 || tipo !== 'empresa' || diag) return;
    chamar('suporte', { action: 'diagnostico' }).then((r) => setDiag(r.itens), () => setDiag([]));
  }, [passo, tipo, diag]);

  const categoria = CATEGORIAS.find((c) => c.id === cat);
  const sugeridos = cat
    ? [...new Map([...(assunto ? buscarArtigos(assunto, 3) : []), ...ARTIGOS.filter((a) => a.cat === cat)].map((a) => [a.id, a])).values()].slice(0, 4)
    : [];
  const achados = (diag ?? []).filter((d) => d.nivel !== 'ok' && (d.cat === cat || d.nivel === 'problema'));

  const enviar = async (e) => {
    e.preventDefault();
    setErro('');
    setEnviando(true);
    try {
      const r = await chamar('suporte', { action: 'abrir', categoria: cat, assunto, descricao, assistant_id: assistente || undefined });
      navigate(`${BASE}/chamado/${r.chamado.id}`, { state: { chamado: r.chamado, recemAberto: true } });
    } catch (err) {
      setErro(err.message);
      setEnviando(false);
    }
  };

  return (
    <div className="page suporte suporte-novo">
      <Link to={BASE} className="link-btn suporte-voltar"><ArrowLeft size={15} /> Ajuda</Link>
      <h1>Abrir chamado</h1>

      <ol className="suporte-passos" aria-label="Passos">
        {PASSOS.map((p, i) => (
          <li key={p} data-estado={i < passo ? 'feito' : i === passo ? 'atual' : undefined} aria-current={i === passo ? 'step' : undefined}>
            <span>{i + 1}</span> {p}
          </li>
        ))}
      </ol>

      {passo === 0 && (
        <section>
          <h2 className="suporte-pergunta">Sobre o que é?</h2>
          <div className="ajuda-cats" role="radiogroup" aria-label="Assunto do chamado">
            {CATEGORIAS.map((c) => (
              <button
                key={c.id}
                type="button"
                role="radio"
                aria-checked={cat === c.id}
                className="ajuda-cat"
                onClick={() => {
                  setCat(c.id);
                  setPasso(1);
                }}
              >
                <span className="ajuda-cat-icone"><IconeCategoria icone={c.icone} size={20} /></span>
                <b>{c.nome}</b>
                <span>{c.descricao}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {passo === 1 && categoria && (
        <section className="stack">
          <h2 className="suporte-pergunta">Talvez isto resolva agora</h2>

          {tipo === 'empresa' && (
            <div className="card suporte-antes">
              {diag === null ? (
                <p className="muted" style={{ margin: 0 }}><Loader2 className="spin" size={15} style={{ verticalAlign: -3 }} /> Conferindo a sua conta…</p>
              ) : achados.length ? (
                <>
                  <b>Na sua conta encontramos:</b>
                  <ul className="suporte-diag-lista">
                    {achados.map((i) => (
                      <li key={i.id} data-nivel={i.nivel}>
                        {i.nivel === 'problema' ? <CircleX size={18} aria-hidden="true" /> : <AlertTriangle size={18} aria-hidden="true" />}
                        <div><b>{i.titulo}</b><span>{i.detalhe}</span></div>
                        {i.acao && <Link to={i.acao.para} className="btn btn-ghost btn-sm">{i.acao.rotulo}</Link>}
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="muted" style={{ margin: 0 }}>Conferimos a sua conta: nada de errado em {categoria.nome.toLowerCase()}.</p>
              )}
            </div>
          )}

          <ul className="ajuda-lista">
            {sugeridos.map((a) => (
              <li key={a.id}>
                <Link to={`${BASE}/artigo/${a.id}`}>
                  <span><b>{a.titulo}</b><small>{a.resumo}</small></span>
                  <ChevronRight size={16} aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>

          <div className="row row-wrap" style={{ justifyContent: 'space-between' }}>
            <button type="button" className="btn btn-quiet" onClick={() => setPasso(0)}><ArrowLeft size={16} /> Outro assunto</button>
            <button type="button" className="btn btn-primary" onClick={() => setPasso(2)}>Não resolveu, continuar <ArrowRight size={16} /></button>
          </div>
        </section>
      )}

      {passo === 2 && categoria && (
        <form className="card stack suporte-form" onSubmit={enviar}>
          <p className="faint" style={{ margin: 0, fontSize: 13 }}>
            {categoria.nome} · <button type="button" className="link-btn" onClick={() => setPasso(0)}>trocar</button>
          </p>
          <label className="field">
            <span className="label">Assunto</span>
            <input className="input" value={assunto} onChange={(e) => setAssunto(e.target.value)} maxLength={140} required placeholder="Ex.: WhatsApp não responde desde ontem" />
          </label>
          <label className="field">
            <span className="label">O que aconteceu?</span>
            <textarea
              className="textarea"
              rows={6}
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              maxLength={4000}
              required
              placeholder="Conte o que você fez, o que esperava e o que aconteceu. Número do pedido ou do chamado ajuda."
            />
            <span className="hint">Nunca mande senha, token ou dados de cartão. A equipe Helpy nunca pede isso.</span>
          </label>
          {assistentes.length > 1 && (
            <label className="field">
              <span className="label">Qual assistente? <span className="faint">(opcional)</span></span>
              <select className="select" value={assistente} onChange={(e) => setAssistente(e.target.value)}>
                <option value="">Não é de um assistente específico</option>
                {assistentes.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </label>
          )}
          {erro && <div className="alert alert-erro"><span>{erro}</span></div>}
          <div className="row row-wrap" style={{ justifyContent: 'space-between' }}>
            <button type="button" className="btn btn-quiet" onClick={() => setPasso(1)}><ArrowLeft size={16} /> Voltar</button>
            <button type="submit" className="btn btn-primary" disabled={enviando || assunto.trim().length < 3 || descricao.trim().length < 15}>
              {enviando ? <Loader2 className="spin" /> : <Send size={16} />} Enviar chamado
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
