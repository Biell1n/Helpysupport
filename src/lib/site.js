/**
 * Endereço oficial do site para voltas de login externo (Discord etc.):
 * o mesmo cadastrado lá, venha a pessoa pelo www, pelo domínio puro ou pela
 * Vercel. Em teste local, usa o próprio endereço.
 */
export function origemDoSite() {
  const { hostname, origin } = window.location;
  if (hostname === 'localhost' || hostname === '127.0.0.1') return origin;
  return 'https://helpysupport.com';
}
