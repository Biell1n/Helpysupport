import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight, CircleCheck, CircleX, Inbox, Loader2, Plus, ScanSearch } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { chamar } from '@/lib/supabase';
import { numero, quando } from '@/lib/format';
import { SITUACAO } from '@/lib/ajuda';
import { BuscaAjuda, Categorias, Populares } from './CentralAjuda';

export const BASE = '/painel/suporte';
export const novoChamado = (cat, assunto) => `${BASE}/novo${cat ? `?cat=${cat}${assunto ? `&assunto=${encodeURIComponent(assunto)}` : ''}` : ''}`;

/** Serviços do Helpy e o aviso geral (quando a equipe publica um). */
export function StatusHelpy() {
  const [s, setS] = useState(null);
  useEffect(() => {
    chamar('suporte', { action: 'status' }).then(setS, () => setS(null));
  }, []);
  if (!s) return null;
  const fora = s.servicos.filter((x) => !x.ok);
  return (
    <div className="suporte-status">
      {s.aviso && (
        <div className={`alert ${s.aviso.nivel === 'problema' ? 'alert-erro' : ''}`} role="status">
          <AlertTriangle size={18} aria-hidden="true" />
          <span><b>Aviso da equipe Helpy:</b> {s.aviso.texto}</span>
        </div>
      )}
      <p className="suporte-servicos">
        <i data-ok={!fora.length || undefined} aria-hidden="true" />
        {fora.length ? `Instabilidade: ${fora.map((x) => x.nome).join(', ')}. A equipe já está vendo.` : 'Todos os serviços do Helpy funcionando'}
      </p>
    </div>
  );
}

const ICONE_NIVEL = { ok: CircleCheck, atencao: AlertTriangle, problema: CircleX };

/** Confere a conta e mostra o que está errado, com o caminho para resolver. */
export function Diagnostico({ itens: iniciais = null, compacto = false }) {
  const [itens, setItens] = useState(iniciais);
  const [rodando, setRodando] = useState(false);
  const [erro, setErro] = useState('');
  const rodar = async () => {
    setRodando(true);
    setErro('');
    try {
      setItens((await chamar('suporte', { action: 'diagnostico' })).itens);
    } catch (e) {
      setErro(e.message);
    } finally {
      setRodando(false);
    }
  };
  const problemas = itens?.filter((i) => i.nivel !== 'ok').length ?? 0;
  return (
    <section className="card suporte-diag">
      <div className="suporte-diag-cab">
        <span className="suporte-diag-icone"><ScanSearch size={22} aria-hidden="true" /></span>
        <div>
          <h2>{itens ? (problemas ? `Encontramos ${problemas} ${problemas === 1 ? 'ponto' : 'pontos'} para ver` : 'Tudo certo com a sua conta') : 'Verificar minha conta'}</h2>
          <p className="muted">
            {itens ? 'Conferimos plano, cota, assistentes, canais, Carteira e a fila.' : 'Em segundos a gente confere plano, cota, assistentes, canais e Carteira, e diz o que resolver.'}
          </p>
        </div>
        <button type="button" className={`btn ${itens ? 'btn-ghost' : 'btn-primary'}`} onClick={rodar} disabled={rodando}>
          {rodando ? <Loader2 className="spin" /> : <ScanSearch size={16} />} {itens ? 'Verificar de novo' : 'Verificar agora'}
        </button>
      </div>
      {erro && <div className="alert alert-erro"><span>{erro}</span></div>}
      {itens && (
        <ul className="suporte-diag-lista">
          {(compacto ? itens.filter((i) => i.nivel !== 'ok') : itens).map((i) => {
            const Icone = ICONE_NIVEL[i.nivel];
            return (
              <li key={i.id} data-nivel={i.nivel}>
                <Icone size={18} aria-hidden="true" />
                <div>
                  <b>{i.titulo}</b>
                  <span>{i.detalhe}</span>
                </div>
                {i.acao && <Link to={i.acao.para} className="btn btn-ghost btn-sm">{i.acao.rotulo}</Link>}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export function SeloSituacao({ status }) {
  const s = SITUACAO[status] ?? SITUACAO.fila;
  return <span className={`badge ${s.classe}`}>{s.rotulo}</span>;
}

export default function Suporte() {
  const { tipo } = useAuth();
  const [eu, setEu] = useState(null);
  const [chamados, setChamados] = useState(null);
  const [todos, setTodos] = useState(false);

  const carregar = useCallback(async () => {
    const [a, b] = await Promise.all([
      chamar('suporte', { action: 'eu' }).catch(() => null),
      chamar('suporte', { action: 'listar' }).catch(() => ({ chamados: [] })),
    ]);
    setEu(a);
    setChamados(b.chamados);
  }, []);
  useEffect(() => {
    carregar();
  }, [carregar]);

  const visiveis = todos ? chamados : chamados?.slice(0, 4);

  return (
    <div className="page suporte">
      <header className="suporte-heroi">
        <h1>Como podemos ajudar?</h1>
        <p className="muted">Busque a resposta, verifique a sua conta ou abra um chamado para a equipe Helpy.</p>
        <BuscaAjuda base={BASE} />
        <StatusHelpy />
      </header>

      {eu?.staff && (
        <Link to={`${BASE}/fila`} className="card suporte-fila-atalho">
          <Inbox size={20} aria-hidden="true" />
          <span><b>Fila do suporte</b> · {eu.fila} {eu.fila === 1 ? 'chamado esperando' : 'chamados esperando'} a equipe Helpy</span>
          <ArrowRight size={16} aria-hidden="true" />
        </Link>
      )}

      <div className={tipo === 'empresa' ? 'suporte-grade' : ''}>
        {tipo === 'empresa' && <Diagnostico />}

        <section className="card suporte-meus">
          <div className="suporte-meus-cab">
            <h2>Meus chamados</h2>
            <Link to={novoChamado()} className="btn btn-primary btn-sm"><Plus size={15} /> Abrir chamado</Link>
          </div>
          {chamados === null ? (
            <div className="skeleton" style={{ height: 120 }} />
          ) : chamados.length === 0 ? (
            <p className="muted" style={{ margin: 0, fontSize: 14 }}>Nenhum chamado ainda. Quando abrir, ele aparece aqui com a resposta.</p>
          ) : (
            <>
              <ul className="suporte-chamados">
                {visiveis.map((c) => (
                  <li key={c.id}>
                    <Link to={`${BASE}/chamado/${c.id}`}>
                      <span className="suporte-num">{numero(c.numero)}</span>
                      <span className="suporte-chamado-txt">
                        <b>{c.assunto}</b>
                        <small>{quando(c.atualizado_em)}</small>
                      </span>
                      <SeloSituacao status={c.status} />
                    </Link>
                  </li>
                ))}
              </ul>
              {chamados.length > 4 && (
                <button type="button" className="link-btn" onClick={() => setTodos((v) => !v)}>
                  {todos ? 'Mostrar menos' : `Ver todos (${chamados.length})`}
                </button>
              )}
            </>
          )}
        </section>
      </div>

      <section className="suporte-secao">
        <h2>Assuntos</h2>
        <Categorias base={BASE} />
      </section>

      <section className="suporte-secao">
        <h2>Mais procurados</h2>
        <Populares base={BASE} />
      </section>
    </div>
  );
}
