// Confere se a senha já apareceu em vazamentos (base HaveIBeenPwned), sem enviar a senha:
// só os 5 primeiros caracteres do hash SHA-1 saem do navegador ("k-anonimato").
// A comparação final acontece aqui. Sem internet ou com a base fora do ar, deixa passar.
export async function vezesVazada(senha) {
  try {
    const bytes = new Uint8Array(await crypto.subtle.digest('SHA-1', new TextEncoder().encode(senha)));
    const hash = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 4000);
    const r = await fetch(`https://api.pwnedpasswords.com/range/${hash.slice(0, 5)}`, { headers: { 'Add-Padding': 'true' }, signal: ctrl.signal });
    clearTimeout(t);
    if (!r.ok) return 0;
    const resto = hash.slice(5);
    for (const linha of (await r.text()).split('\n')) {
      const [suf, n] = linha.trim().split(':');
      if (suf === resto) return Number(n) || 0;
    }
    return 0;
  } catch {
    return 0;
  }
}

export const AVISO_VAZADA = 'Essa senha já apareceu em vazamentos de dados na internet. Escolha outra, que você não use em nenhum outro site.';
