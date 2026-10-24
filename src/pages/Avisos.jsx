import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Check, GraduationCap } from 'lucide-react';
import { IconeDoAviso } from '@/components/AlertasDaConta';
import { useToast } from '@/components/Toasts';
import { ensinar, marcarResolvida, marcarVisto, todosOsAvisos } from '@/lib/avisos';
import { quando } from '@/lib/format';

const FILTROS = [
  { id: 'novos', rotulo: 'Para conferir' },
  { id: 'todos', rotulo: 'Todos' },
];

/**
 * Caixa de avisos: o que o assistente notou, o que ele não soube responder e
 * os avisos do sistema. Visto ou não, tudo fica aqui; a equipe confirma ou
 * responde e o assistente aprende.
 */
export default function Avisos() {
  const avisar = useToast();
  const [params] = useSearchParams();
  const destaque = params.get('aviso');
  const [lista, setLista] = useState(null);
  const [filtro, setFiltro] = useState('novos');
  const [respondendo, setRespondendo] = useState(destaque);
  const [resposta, setResposta] = useState('');
  const [enviando, setEnviando] = useState(false);

  const carregar = useCallback(async () => {
    setLista(await todosOsAvisos());
  }, []);
  useEffect(() => {
    carregar();
  }, [carregar]);

  // veio de uma notificação: rola até ela
  useEffect(() => {
    if (!destaque || !lista) return;
    document.getElementById(destaque)?.scrollIntoView({ block: 'center' });
  }, [destaque, lista]);

  const mudar = (item, campos) => setLista((l) => l.map((x) => (x.chave === item.chave ? { ...x, ...campos } : x)));

  const responder = async (item, texto) => {
    setEnviando(true);
    try {
      await ensinar(item, texto);
      mudar(item, { visto: true, resolvida: true, resposta: texto });
      setRespondendo(null);
      setResposta('');
      avisar('O assistente aprendeu', { texto: 'A partir de agora ele responde isso sozinho.' });
    } catch (e) {
      avisar('Não deu para salvar', { erro: true, texto: e.message });
    } finally {
      setEnviando(false);
    }
  };

  const visiveis = (lista ?? []).filter((a) => filtro === 'todos' || !a.visto || (a.tipo === 'lacuna' && !a.resolvida && !a.resposta));
  const pendentes = (lista ?? []).filter((a) => !a.visto).length;

  return (
    <div className="page" style={{ maxWidth: 860 }}>
      <header className="page-head">
        <div>
          <Link to="/painel" className="btn btn-quiet btn-sm" style={{ marginLeft: -10 }}><ArrowLeft /> Painel</Link>
          <h1 style={{ marginTop: 6 }}>Avisos</h1>
          <p>O que o assistente notou, o que ele não soube responder e os recados do sistema. Confirme ou responda: o assistente aprende e não pergunta de novo.</p>
        </div>
      </header>

      <div className="row row-wrap" style={{ gap: 6, marginBottom: 16 }} role="group" aria-label="Filtrar avisos">
        {FILTROS.map((f) => (
          <button key={f.id} type="button" className="chip" aria-pressed={filtro === f.id} onClick={() => setFiltro(f.id)}>
            {f.rotulo}
            {f.id === 'novos' && pendentes > 0 && <small>{pendentes}</small>}
          </button>
        ))}
      </div>

      {lista === null && <div className="skeleton" style={{ height: 160 }} />}
      {lista && visiveis.length === 0 && (
        <p className="muted">{filtro === 'novos' ? 'Nada para conferir. Quando o assistente notar algo, aparece aqui.' : 'Nenhum aviso ainda.'}</p>
      )}

      <ul className="avisos">
        {visiveis.map((a) => (
          <li key={a.chave} id={a.chave} className="card aviso" data-visto={a.visto || undefined} data-destaque={destaque === a.chave || undefined}>
            <span className="alertas-icone" data-origem={a.origem}><IconeDoAviso item={a} /></span>
            <div className="aviso-corpo">
              <b>{a.titulo}</b>
              {a.detalhe && <p>{a.detalhe}</p>}
              <span className="faint">
                {a.tipo === 'lacuna' ? 'Pergunta sem resposta' : a.origem === 'sistema' ? 'Sistema' : 'O assistente notou'}{a.quando ? ` · ${quando(a.quando)}` : ''}
                {a.conversa && <> · <Link to={`/painel/atendimentos?id=${a.conversa}`}>ver conversa</Link></>}
              </span>
              {a.resposta && <p className="aviso-resposta"><Check size={14} /> Respondido: {a.resposta}</p>}
              {a.tipo === 'lacuna' && a.resolvida && !a.resposta && <p className="aviso-resposta"><Check size={14} /> Resolvida</p>}

              {respondendo === a.chave && a.assistantId && (
                <form
                  className="alertas-resposta"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (resposta.trim()) responder(a, resposta.trim());
                  }}
                >
                  <textarea
                    className="textarea"
                    rows={2}
                    autoFocus
                    value={resposta}
                    onChange={(e) => setResposta(e.target.value)}
                    placeholder={a.tipo === 'lacuna' ? 'A resposta certa, do jeito que o assistente deve falar.' : 'Ex.: O preço está certo, é promoção. Ou: a Base Líquida tem 8 tons, do 01 ao 08.'}
                  />
                  <button type="submit" className="btn btn-primary btn-sm" disabled={enviando || !resposta.trim()}>Ensinar ao assistente</button>
                </form>
              )}
            </div>
            <div className="alertas-acoes">
              {a.origem !== 'sistema' && a.assistantId && !a.resposta && !(a.tipo === 'lacuna' && a.resolvida) && (
                <>
                  {a.tipo === 'alerta' && (
                    <button type="button" className="btn btn-ghost btn-sm" disabled={enviando} onClick={() => responder(a, 'Conferido pela equipe: está certo.')}>
                      <Check size={15} /> Está certo
                    </button>
                  )}
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setRespondendo(respondendo === a.chave ? null : a.chave); setResposta(''); }}>
                    <GraduationCap size={15} /> Responder
                  </button>
                </>
              )}
              {a.tipo === 'lacuna' && !a.resolvida && (
                <button type="button" className="btn btn-quiet btn-sm" onClick={async () => { await marcarResolvida(a); mudar(a, { resolvida: true, visto: true }); }}>Resolvida</button>
              )}
              {!a.visto && (
                <button type="button" className="btn btn-quiet btn-sm" onClick={async () => { await marcarVisto(a); mudar(a, { visto: true }); }}>Visto</button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
