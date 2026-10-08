// ============================================================
// Endereços que o servidor pode acessar: só os públicos da internet.
// Qualquer endereço digitado pelo cliente (planilha, API, banco SQL)
// passa por aqui para o servidor não virar ponte para a rede interna
// (SSRF).
// ============================================================

import { UserError } from './cors.ts';

export function ipPrivado(ip: string): boolean {
  const v4 = ip.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) || a >= 224;
  }
  const v6 = ip.toLowerCase().replace(/^\[|\]$/g, '');
  if (v6.includes(':')) {
    if (v6 === '::' || v6 === '::1') return true;
    const mapeado = v6.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapeado) return ipPrivado(mapeado[1]);
    return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(v6);
  }
  return false;
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
    try {
      const ips = [
        ...(await Deno.resolveDns(host, 'A').catch(() => [] as string[])),
        ...(await Deno.resolveDns(host, 'AAAA').catch(() => [] as string[])),
      ];
      if (ips.some(ipPrivado)) throw new UserError('Esse endereço aponta para uma rede interna.');
    } catch (e) {
      if (e instanceof UserError) throw e;
    }
  }
  return u;
}
