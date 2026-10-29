// Peças da central de ajuda, usadas na página pública (/ajuda) e no painel (/painel/suporte).
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowRight, CalendarDays, ChevronRight, Gem, MessageSquareText, Radio, Rocket, Search, ShieldCheck, ThumbsDown, ThumbsUp, Users, Wallet } from 'lucide-react';
import TextoFormatado from '@/components/TextoFormatado';
import { ARTIGOS, CATEGORIAS, buscarArtigos } from '@/lib/ajuda';
import '@/styles/suporte.css';

const ICONES = { rocket: Rocket, chat: MessageSquareText, canais: Radio, carteira: Wallet, agenda: CalendarDays, equipe: Users, plano: Gem, conta: ShieldCheck };
export const IconeCategoria = ({ icone, ...p }) => {
  const I = ICONES[icone] ?? MessageSquareText;
  return <I aria-hidden="true" {...p} />;
};

// as dúvidas que mais chegam ficam à vista na entrada
const POPULARES = ['canal-parou', 'resposta-errada', 'cota-acabou', 'pedido-pago-nao-confirmou', 'frete', 'convidar-funcionario'];

/** Busca com os resultados logo embaixo, enquanto a pessoa digita. */
export function BuscaAjuda({ base, rotulo = 'Como podemos ajudar?' }) {
  const [q, setQ] = useState('');
  const achados = useMemo(() => buscarArtigos(q, 6), [q]);
  return (
    <div className="ajuda-busca">
      <label className="ajuda-busca-campo">
        <Search size={20} aria-hidden="true" />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Ex.: WhatsApp parou de responder, frete, cota do mês"
          aria-label={rotulo}
        />
      </label>
      {q.trim().length > 1 && (
        <div className="ajuda-busca-resultados" role="list">
          {achados.length ? (
            achados.map((a) => (
              <Link key={a.id} role="listitem" to={`${base}/artigo/${a.id}`} className="ajuda-resultado">
                <b>{a.titulo}</b>
                <span>{a.resumo}</span>
              </Link>
            ))
          ) : (
            <p className="faint" style={{ margin: 0, padding: '12px 14px' }}>Nada encontrado com essas palavras. Tente outras, ou escolha um assunto abaixo.</p>
          )}
        </div>
      )}
    </div>
  );
}

export function Categorias({ base }) {
  return (
    <div className="ajuda-cats">
      {CATEGORIAS.map((c) => (
        <Link key={c.id} to={`${base}/categoria/${c.id}`} className="ajuda-cat">
          <span className="ajuda-cat-icone"><IconeCategoria icone={c.icone} size={20} /></span>
          <b>{c.nome}</b>
          <span>{c.descricao}</span>
        </Link>
      ))}
    </div>
  );
}

export function Populares({ base }) {
  return (
    <ul className="ajuda-lista">
      {POPULARES.map((id) => ARTIGOS.find((a) => a.id === id)).filter(Boolean).map((a) => (
        <li key={a.id}>
          <Link to={`${base}/artigo/${a.id}`}>
            <span><b>{a.titulo}</b><small>{a.resumo}</small></span>
            <ChevronRight size={16} aria-hidden="true" />
          </Link>
        </li>
      ))}
    </ul>
  );
}

const Trilha = ({ base, cat, fim }) => (
  <nav className="ajuda-trilha" aria-label="Você está em">
    <Link to={base}>Ajuda</Link>
    {cat && <><ChevronRight size={13} aria-hidden="true" /><Link to={`${base}/categoria/${cat.id}`}>{cat.nome}</Link></>}
    {fim && <><ChevronRight size={13} aria-hidden="true" /><span>{fim}</span></>}
  </nav>
);

/** Lista dos artigos de um assunto. */
export function CategoriaPagina({ base, abrirChamado }) {
  const { cat: id } = useParams();
  const cat = CATEGORIAS.find((c) => c.id === id);
  if (!cat) return <NaoAchou base={base} />;
  const artigos = ARTIGOS.filter((a) => a.cat === cat.id);
  return (
    <div className="ajuda-pagina">
      <Trilha base={base} />
      <header className="ajuda-cab">
        <span className="ajuda-cat-icone grande"><IconeCategoria icone={cat.icone} size={24} /></span>
        <div>
          <h1>{cat.nome}</h1>
          <p className="muted">{cat.descricao}</p>
        </div>
      </header>
      <ul className="ajuda-lista">
        {artigos.map((a) => (
          <li key={a.id}>
            <Link to={`${base}/artigo/${a.id}`}>
              <span><b>{a.titulo}</b><small>{a.resumo}</small></span>
              <ChevronRight size={16} aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
      <AindaPrecisa para={abrirChamado(cat.id)} />
    </div>
  );
}

/** Um artigo, com "isso ajudou?" no fim. */
export function ArtigoPagina({ base, abrirChamado }) {
  const { id } = useParams();
  const artigo = ARTIGOS.find((a) => a.id === id);
  const [ajudou, setAjudou] = useState(null);
  if (!artigo) return <NaoAchou base={base} />;
  const cat = CATEGORIAS.find((c) => c.id === artigo.cat);
  const relacionados = ARTIGOS.filter((a) => a.cat === artigo.cat && a.id !== artigo.id).slice(0, 3);
  return (
    <div className="ajuda-pagina">
      <Trilha base={base} cat={cat} />
      <article className="ajuda-artigo">
        <h1>{artigo.titulo}</h1>
        <p className="ajuda-artigo-resumo">{artigo.resumo}</p>
        <TextoFormatado texto={artigo.texto} />
      </article>

      <div className="ajuda-ajudou" aria-live="polite">
        {ajudou === null ? (
          <>
            <span className="ajuda-ajudou-pergunta">Isso resolveu?</span>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAjudou(true)}><ThumbsUp size={15} /> Resolveu</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAjudou(false)}><ThumbsDown size={15} /> Não resolveu</button>
          </>
        ) : ajudou ? (
          <span>Que bom. Obrigado por avisar.</span>
        ) : (
          <span>
            Poxa. <Link to={abrirChamado(artigo.cat, artigo.titulo)} className="link-forte">Abra um chamado</Link> e a gente resolve com você.
          </span>
        )}
      </div>

      {relacionados.length > 0 && (
        <section className="ajuda-relacionados">
          <h2>Outros sobre {cat?.nome.toLowerCase()}</h2>
          <ul className="ajuda-lista">
            {relacionados.map((a) => (
              <li key={a.id}>
                <Link to={`${base}/artigo/${a.id}`}>
                  <span><b>{a.titulo}</b><small>{a.resumo}</small></span>
                  <ChevronRight size={16} aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

export function AindaPrecisa({ para }) {
  return (
    <div className="ajuda-ainda">
      <div>
        <b>Não achou o que precisava?</b>
        <span>Abra um chamado. O assistente do suporte responde na hora e a equipe Helpy entra quando precisar.</span>
      </div>
      <Link to={para} className="btn btn-primary">Abrir chamado <ArrowRight size={16} /></Link>
    </div>
  );
}

function NaoAchou({ base }) {
  return (
    <div className="ajuda-pagina">
      <Trilha base={base} />
      <div className="empty">
        <h3>Esse artigo não existe mais</h3>
        <p>Use a busca ou escolha um assunto.</p>
        <Link to={base} className="btn btn-ghost">Voltar para a ajuda</Link>
      </div>
    </div>
  );
}
