// Medidor da senha enquanto a pessoa digita: quatro tracinhos e uma dica curta.
// É só orientação; quem barra senha curta ou vazada é o envio do formulário.

const COMUNS = /(senha|password|123456|qwerty|abc123|111111|000000|helpy|iloveyou|admin|brasil)/i;
const SEQUENCIA = /(0123|1234|2345|3456|4567|5678|6789|abcd|bcde|cdef|qwer|asdf)/i;

/** 0 = curta demais · 1 fraca · 2 razoável · 3 boa · 4 forte */
export function forcaDaSenha(senha, evitar = []) {
  if (!senha || senha.length < 8) return { nivel: 0, dica: 'Use pelo menos 8 caracteres.' };
  const tipos = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(senha)).length;
  const pessoais = evitar
    .flatMap((t) => String(t ?? '').toLowerCase().split(/[\s@._-]+/))
    .filter((p) => p.length >= 4);
  const minuscula = senha.toLowerCase();
  if (COMUNS.test(senha) || pessoais.some((p) => minuscula.includes(p)) || /^(.)\1+$/.test(senha)) {
    return { nivel: 1, dica: 'Fácil de adivinhar: evite seu nome, o e-mail e palavras como "senha".' };
  }
  let pontos = 1;
  if (senha.length >= 12) pontos += 1;
  if (senha.length >= 16) pontos += 1;
  if (tipos >= 3) pontos += 1;
  if (tipos === 1) pontos -= 1;
  if (SEQUENCIA.test(senha) || /(.)\1\1/.test(senha)) pontos -= 1;
  const nivel = Math.max(1, Math.min(4, pontos));
  const dica = {
    1: 'Junte letras, números e símbolos, ou use uma frase maior.',
    2: 'Fica mais segura com 12 caracteres ou mais.',
    3: 'Boa.',
    4: 'Forte.',
  }[nivel];
  return { nivel, dica };
}

const ROTULO = ['Curta demais', 'Fraca', 'Razoável', 'Boa', 'Forte'];

export default function ForcaSenha({ senha, evitar }) {
  if (!senha) return <span className="hint">Pelo menos 8 caracteres. Evite senhas que você usa em outros sites.</span>;
  const { nivel, dica } = forcaDaSenha(senha, evitar);
  return (
    <div className="forca-senha" data-nivel={nivel} aria-live="polite">
      <div className="forca-barras" aria-hidden="true">
        {[1, 2, 3, 4].map((i) => <span key={i} className={i <= nivel ? 'cheia' : ''} />)}
      </div>
      <span className="hint">
        <b className="forca-rotulo">{ROTULO[nivel]}</b>
        {nivel === 3 || nivel === 4 ? null : <> · {dica}</>}
      </span>
    </div>
  );
}
