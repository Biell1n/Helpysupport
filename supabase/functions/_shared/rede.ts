// ============================================================
// Endereços que o servidor pode acessar: só os públicos da internet.
// Qualquer endereço digitado pelo cliente (planilha, API, banco SQL)
// passa por aqui para o servidor não virar ponte para a rede interna
// (SSRF).
// ============================================================

import { UserError } from './cors.ts';

/** IPv6 com os 8 grupos por extenso (16 bits cada), ou null se não for IPv6 válido. */
function gruposV6(ip: string): number[] | null {
  let s = ip.toLowerCase().replace(/^\[|\]$/g, '').split('%')[0];
  // IPv4 no fim (::ffff:1.2.3.4) vira dois grupos
  const v4 = s.match(/(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (v4) {
    const n = v4.slice(1).map(Number);
    s = s.slice(0, v4.index) + ((n[0] << 8) | n[1]).toString(16) + ':' + ((n[2] << 8) | n[3]).toString(16);
  }
  const [ini, fim = null] = s.split('::');
  if (s.split('::').length > 2) return null;
  const a = ini ? ini.split(':') : [];
  const b = fim ? fim.split(':') : [];
  const falta = 8 - a.length - b.length;
  if (fim === null ? a.length !== 8 : falta < 0) return null;
  const g = [...a, ...Array(fim === null ? 0 : falta).fill('0'), ...b].map((x) => parseInt(x || '0', 16));
  return g.length === 8 && g.every((x) => Number.isInteger(x) && x >= 0 && x <= 0xffff) ? g : null;
}

const v4DeGrupos = (alto: number, baixo: number) => `${alto >> 8}.${alto & 255}.${baixo >> 8}.${baixo & 255}`;

export function ipPrivado(ip: string): boolean {
  const v4 = ip.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) || a >= 224;
  }
  if (!ip.includes(':')) return false;
  const g = gruposV6(ip);
  if (!g) return true; // IPv6 que não dá para ler: na dúvida, bloqueia
  const zeros = (n: number) => g.slice(0, n).every((x) => x === 0);
  if (zeros(8)) return true; // ::
  if (zeros(7) && g[7] === 1) return true; // ::1
  // IPv4 embutido no IPv6: mapeado (::ffff:a.b.c.d), compatível (::a.b.c.d), NAT64 (64:ff9b::/96) e 6to4 (2002::/16)
  if (zeros(5) && g[5] === 0xffff) return ipPrivado(v4DeGrupos(g[6], g[7]));
  if (zeros(6)) return ipPrivado(v4DeGrupos(g[6], g[7]));
  if (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0)) return ipPrivado(v4DeGrupos(g[6], g[7]));
  if (g[0] === 0x2002) return ipPrivado(v4DeGrupos(g[1], g[2]));
  return (g[0] & 0xfe00) === 0xfc00 || (g[0] & 0xffc0) === 0xfe80 || (g[0] & 0xff00) === 0xff00;
}

export async function urlSegura(bruta: string): Promise<URL> {
  let u: URL;
  try {
    u = new URL(String(bruta ?? '').trim());
  } catch {
    throw new UserError('Esse endereço não parece um link válido.');
  }
  if (!['https:', 'http:'].includes(u.protocol)) throw new UserError('Use um endereço que comece com https://');
  if (u.username || u.password) throw new UserError('Coloque usuário e senha no campo de cabeçalho, não no link.');
  const host = u.hostname.toLowerCase().replace(/\.$/, '');
  if (
    host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') ||
    host.endsWith('.internal') || host === 'metadata.google.internal' || ipPrivado(host)
  ) {
    throw new UserError('Esse endereço é de rede interna. O Helpy só alcança endereços públicos da internet.');
  }
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(host) && !host.includes(':')) {
    const ips = await enderecosDe(host);
    if (ips === null) throw new UserError('Não consegui conferir esse endereço agora. Tente de novo em instantes.', 503);
    if (ips.some(ipPrivado)) throw new UserError('Esse endereço aponta para uma rede interna.');
    // o nome existe mas não tem endereço público: não deixa passar
    if (!ips.length) throw new UserError('Não encontrei esse endereço na internet. Confira o link.');
  }
  return u;
}

// Endereços (A e AAAA) de um nome. Se a consulta falhar, devolve null: na dúvida, não deixa passar.
async function enderecosDe(host: string): Promise<string[] | null> {
  if (typeof Deno.resolveDns === 'function') {
    let falhou = false;
    const consulta = (tipo: 'A' | 'AAAA') => Deno.resolveDns(host, tipo).catch((e) => {
      // "não existe registro desse tipo" é normal; outro erro conta como falha
      if (!/NotFound|no records|NXDOMAIN/i.test(String(e?.name ?? '') + String(e?.message ?? ''))) falhou = true;
      return [] as string[];
    });
    const ips = [...(await consulta('A')), ...(await consulta('AAAA'))];
    if (ips.length || !falhou) return ips;
  }
  // sem DNS no servidor: pergunta por HTTPS
  try {
    const ips: string[] = [];
    for (const tipo of ['A', 'AAAA']) {
      const r = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(host)}&type=${tipo}`, {
        headers: { accept: 'application/dns-json' }, signal: AbortSignal.timeout(5000),
      });
      if (!r.ok) return null;
      const d = await r.json() as { Status?: number; Answer?: { type: number; data: string }[] };
      if (d.Status !== 0 && d.Status !== 3) return null;
      for (const a of d.Answer ?? []) if (a.type === 1 || a.type === 28) ips.push(a.data);
    }
    return ips;
  } catch {
    return null;
  }
}
