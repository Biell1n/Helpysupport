import { Component } from 'react';

// Arquivo de tela que não existe mais (o site foi atualizado com a aba aberta).
const ARQUIVO_VELHO = /dynamically imported module|Importing a module script failed|error loading dynamically imported module|Loading chunk|ChunkLoadError/i;
const CHAVE = 'helpy_recarregou_em';

/** Recarrega uma vez para pegar a versão nova (nunca em laço). */
export function recarregarParaVersaoNova() {
  try {
    const ultima = Number(sessionStorage.getItem(CHAVE) || 0);
    if (Date.now() - ultima < 30_000) return false;
    sessionStorage.setItem(CHAVE, String(Date.now()));
  } catch {
    /* sem armazenamento: recarrega mesmo assim */
  }
  window.location.reload();
  return true;
}

/**
 * Qualquer erro numa tela vira um aviso com "Recarregar", não uma página em
 * branco. Se for a versão do site que mudou, recarrega sozinho.
 */
export default class SemTelaBranca extends Component {
  state = { erro: null };

  static getDerivedStateFromError(erro) {
    return { erro };
  }

  componentDidCatch(erro) {
    if (ARQUIVO_VELHO.test(String(erro?.message ?? erro))) recarregarParaVersaoNova();
    else console.error(erro);
  }

  render() {
    if (!this.state.erro) return this.props.children;
    return (
      <div className="sem-tela-branca" role="alert">
        <h1>Algo não carregou</h1>
        <p>Pode ser a internet ou uma versão nova do Helpy. Recarregue a página para continuar de onde parou.</p>
        <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>Recarregar</button>
      </div>
    );
  }
}
