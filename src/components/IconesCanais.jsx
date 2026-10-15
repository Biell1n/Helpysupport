/* Ícones simples de cada serviço, no traço dos outros ícones do painel. */
export const IconeDoCanal = {
  whatsapp: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M4.5 19.5 5.6 16A8 8 0 1 1 8.4 18.6Z" />
      <path d="M9.2 8.6c.2-.5.6-.6.9-.6h.4l.9 2.1-.6.8a5 5 0 0 0 2.4 2.4l.8-.6 2.1.9v.4c0 .3-.1.7-.6.9-.6.3-1.5.4-2.8-.2a8.7 8.7 0 0 1-3.4-3.4c-.6-1.3-.5-2.2-.2-2.8Z" />
    </svg>
  ),
  instagram: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" {...p}>
      <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.2" cy="6.8" r=".6" fill="currentColor" />
    </svg>
  ),
  discord: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M8.5 6.5a14 14 0 0 1 7 0l1.5-1c1.8.6 3 1.5 3.5 2.4.8 2.6 1 5.6.5 8.6-1.3 1.2-2.7 1.9-4 2.3l-1-1.8" />
      <path d="M8.5 6.5 7 5.5c-1.8.6-3 1.5-3.5 2.4-.8 2.6-1 5.6-.5 8.6 1.3 1.2 2.7 1.9 4 2.3l1-1.8" />
      <path d="M7.5 16c2.8 1.3 6.2 1.3 9 0" />
      <circle cx="9.3" cy="12" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="14.7" cy="12" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  ),
};

export const NOME_DO_CANAL = { whatsapp: 'WhatsApp', instagram: 'Instagram', discord: 'Discord' };

/** De qual canal veio a conversa (o visitor_id dos canais é "whatsapp:…", "instagram:…", "discord:…"). */
export const canalDe = (c) => (c?.canal_id ? String(c.visitor_id ?? '').split(':')[0] : '');

export function SeloCanal({ tipo }) {
  const I = IconeDoCanal[tipo];
  if (!I) return null;
  return (
    <span className={`selo-canal canal-${tipo}`} title={`Pelo ${NOME_DO_CANAL[tipo]}`}>
      <I width={13} height={13} aria-hidden="true" /> {NOME_DO_CANAL[tipo]}
    </span>
  );
}
