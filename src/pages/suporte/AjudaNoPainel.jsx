import { ArtigoPagina, CategoriaPagina } from './CentralAjuda';
import { BASE, novoChamado } from './Suporte';

/** Artigo ou assunto da central de ajuda dentro do painel: "abrir chamado" já vai para o formulário. */
export default function AjudaNoPainel({ tipo }) {
  return (
    <div className="page suporte">
      {tipo === 'artigo' ? <ArtigoPagina base={BASE} abrirChamado={novoChamado} /> : <CategoriaPagina base={BASE} abrirChamado={novoChamado} />}
    </div>
  );
}
