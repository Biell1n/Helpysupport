import { useEffect } from 'react';
import { Link, Route, Routes } from 'react-router-dom';
import Logo from '@/components/Logo';
import { useAuth } from '@/contexts/AuthContext';
import { AindaPrecisa, ArtigoPagina, BuscaAjuda, CategoriaPagina, Categorias, Populares } from './CentralAjuda';
import { StatusHelpy } from './Suporte';

const BASE = '/ajuda';
const formulario = (cat, assunto) => `/painel/suporte/novo${cat ? `?cat=${cat}${assunto ? `&assunto=${encodeURIComponent(assunto)}` : ''}` : ''}`;
// sem login, abrir chamado passa pelo "Entrar" e volta para o formulário
const pelaEntrada = (cat, assunto) => `/entrar?de=${encodeURIComponent(formulario(cat, assunto))}`;

function Inicio({ abrirChamado }) {
  return (
    <>
      <header className="suporte-heroi">
        <h1>Como podemos ajudar?</h1>
        <p className="muted">Respostas para montar, conectar e vender com o Helpy. Se não achar, a equipe resolve com você.</p>
        <BuscaAjuda base={BASE} />
      </header>
      <section className="suporte-secao">
        <h2>Assuntos</h2>
        <Categorias base={BASE} />
      </section>
      <section className="suporte-secao">
        <h2>Mais procurados</h2>
        <Populares base={BASE} />
      </section>
      <AindaPrecisa para={abrirChamado()} />
    </>
  );
}

/** Central de ajuda aberta (sem login): artigos e o caminho para abrir chamado. */
export default function AjudaPublica() {
  const { user } = useAuth();
  const abrirChamado = user ? formulario : pelaEntrada;
  useEffect(() => {
    document.title = 'Ajuda · Helpy';
  }, []);
  return (
    <div className="ajuda-publica">
      <header className="ajuda-publica-topo">
        <Link to="/" aria-label="Helpy, página inicial"><Logo size={28} /></Link>
        <span className="ajuda-publica-titulo">Central de ajuda</span>
        <span className="spacer" />
        {user ? (
          <Link to="/painel/suporte" className="btn btn-primary btn-sm">Meus chamados</Link>
        ) : (
          <Link to={`/entrar?de=${encodeURIComponent('/painel/suporte')}`} className="btn btn-ghost btn-sm">Entrar</Link>
        )}
      </header>
      <main className="page suporte">
        {user && <StatusHelpy />}
        <Routes>
          <Route index element={<Inicio abrirChamado={abrirChamado} />} />
          <Route path="categoria/:cat" element={<CategoriaPagina base={BASE} abrirChamado={abrirChamado} />} />
          <Route path="artigo/:id" element={<ArtigoPagina base={BASE} abrirChamado={abrirChamado} />} />
        </Routes>
      </main>
      <footer className="ajuda-publica-rodape">
        <Link to="/termos">Termos de uso</Link>
        <Link to="/privacidade">Privacidade</Link>
        <Link to="/">helpy</Link>
      </footer>
    </div>
  );
}
