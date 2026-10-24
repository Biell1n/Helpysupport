// Endereços no texto do assistente viram link de verdade. O link de
// pagamento (Asaas) vira um botão "Pagar", que abre a página com Pix (QR
// code), cartão ou boleto.
export const URL_NO_TEXTO = /(https?:\/\/[^\s<>()]+[^\s<>().,;:!?"'])/g;
const PAGAMENTO = /^https?:\/\/(www\.|sandbox\.)?asaas\.com\//i;

export function LinkNoTexto({ url }) {
  if (PAGAMENTO.test(url)) {
    return (
      <a className="link-pagar" href={url} target="_blank" rel="noreferrer">
        Pagar agora <span aria-hidden="true">→</span>
        <small>Pix, cartão ou boleto</small>
      </a>
    );
  }
  return (
    <a href={url} target="_blank" rel="noreferrer">
      {url.replace(/^https?:\/\/(www\.)?/, '')}
    </a>
  );
}

/** Troca os endereços de um pedaço de texto por links. */
export function comLinks(texto, chave = 'l') {
  return String(texto ?? '')
    .split(URL_NO_TEXTO)
    .map((p, i) => (i % 2 === 1 ? <LinkNoTexto key={`${chave}-${i}`} url={p} /> : p));
}
