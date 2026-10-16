// ============================================================
// Asaas: cobrança por Pix, cartão e boleto.
//
// Usado em dois lugares, com contas diferentes:
//   - o Helpy cobrando os planos (chave ASAAS_API_KEY nas variáveis)
//   - a empresa vendendo pelo assistente (a chave dela, no Vault)
// Ambiente "sandbox" é o de teste (dinheiro de mentira).
// ============================================================

export type Ambiente = 'sandbox' | 'producao';

const BASE: Record<Ambiente, string> = {
  sandbox: 'https://api-sandbox.asaas.com/v3',
  producao: 'https://api.asaas.com/v3',
};

/** Erro que veio do Asaas, já com a mensagem que dá para mostrar. */
export class ErroAsaas extends Error {
  status: number;
  constructor(status: number, corpo: string) {
    let msg = '';
    try {
      const j = JSON.parse(corpo) as { errors?: { description?: string }[] };
      msg = (j.errors ?? []).map((e) => e.description).filter(Boolean).join(' ');
    } catch { /* corpo sem JSON */ }
    super(
      status === 401
        ? 'O Asaas recusou a chave. Confira se copiou inteira e se é do ambiente certo (teste ou produção).'
        : msg || `O Asaas respondeu ${status}.`,
    );
    this.status = status;
  }
}

export function asaas(chave: string, ambiente: Ambiente = 'sandbox') {
  const pedir = async <T = Record<string, unknown>>(caminho: string, init: { method?: string; body?: unknown } = {}): Promise<T> => {
    const res = await fetch(`${BASE[ambiente]}${caminho}`, {
      method: init.method ?? 'GET',
      headers: { access_token: chave, 'Content-Type': 'application/json', 'User-Agent': 'Helpy' },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: AbortSignal.timeout(20000),
    });
    const texto = await res.text();
    if (!res.ok) throw new ErroAsaas(res.status, texto);
    return (texto ? JSON.parse(texto) : {}) as T;
  };
  return { pedir, ambiente };
}

export type ClienteAsaas = ReturnType<typeof asaas>;

/** A chave vale? Devolve o nome da conta (para mostrar no painel). */
export async function conferirConta(c: ClienteAsaas): Promise<string> {
  await c.pedir('/finance/balance');
  const info = await c.pedir<{ name?: string; companyName?: string; tradingName?: string }>('/myAccount/commercialInfo').catch(() => null);
  return String(info?.tradingName || info?.companyName || info?.name || 'Conta Asaas').slice(0, 120);
}

const EVENTOS = ['PAYMENT_CREATED', 'PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED', 'PAYMENT_OVERDUE', 'PAYMENT_DELETED', 'PAYMENT_REFUNDED'];

/**
 * Cadastra o aviso de pagamento (webhook) na conta, para o Asaas avisar o
 * Helpy quando um pagamento cair. Se já existe um para esse endereço, só
 * atualiza o token.
 */
export async function garantirWebhook(c: ClienteAsaas, url: string, token: string, email: string) {
  const lista = await c.pedir<{ data?: { id: string; url: string }[] }>('/webhooks').catch(() => ({ data: [] as { id: string; url: string }[] }));
  const corpo = {
    name: 'Helpy', url, email, enabled: true, interrupted: false, apiVersion: 3,
    authToken: token, sendType: 'SEQUENTIALLY', events: EVENTOS,
  };
  const ja = (lista.data ?? []).find((w) => w.url === url);
  if (ja) await c.pedir(`/webhooks/${ja.id}`, { method: 'PUT', body: corpo });
  else await c.pedir('/webhooks', { method: 'POST', body: corpo });
}

/** Pagamento confirmado (cartão aprovado) ou recebido (Pix, boleto). */
export const pago = (status?: string, evento?: string) =>
  ['PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED'].includes(String(evento)) || ['CONFIRMED', 'RECEIVED', 'RECEIVED_IN_CASH'].includes(String(status));

export const FORMA: Record<string, string> = { PIX: 'Pix', CREDIT_CARD: 'Cartão', BOLETO: 'Boleto', UNDEFINED: 'A escolher' };

/** Confere o dígito de CPF (11) ou CNPJ (14). O Asaas exige um válido para cobrar. */
export function documentoValido(doc: string): boolean {
  const d = doc.replace(/\D/g, '');
  if (/^(\d)\1+$/.test(d)) return false;
  if (d.length === 11) {
    const dig = (n: number) => {
      let soma = 0;
      for (let i = 0; i < n; i++) soma += Number(d[i]) * (n + 1 - i);
      const r = (soma * 10) % 11;
      return r === 10 ? 0 : r;
    };
    return dig(9) === Number(d[9]) && dig(10) === Number(d[10]);
  }
  if (d.length === 14) {
    const dig = (n: number) => {
      const pesos = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
      const soma = pesos.reduce((s, p, i) => s + p * Number(d[i]), 0);
      const r = soma % 11;
      return r < 2 ? 0 : 11 - r;
    };
    return dig(12) === Number(d[12]) && dig(13) === Number(d[13]);
  }
  return false;
}

/** Data de hoje no Brasil, no formato do Asaas (AAAA-MM-DD). */
export function hojeBr(somaDias = 0): string {
  const d = new Date(Date.now() + somaDias * 864e5);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(d);
}
