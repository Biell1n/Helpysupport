// Timeout ou banimento de quem gasta o atendimento à toa (tabela bloqueios).

/** Timeout ou banimento valendo nesta conversa (para o ticket vermelho). */
export function bloqueioDa(c) {
  if (c?.banido) return { banido: true };
  if (c?.bloqueado_ate && new Date(c.bloqueado_ate).getTime() > Date.now()) return { ate: c.bloqueado_ate };
  return null;
}

export function rotuloDoBloqueio(b) {
  if (b.banido) return 'banido';
  const d = new Date(b.ate);
  const hoje = new Date().toDateString() === d.toDateString();
  const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return `timeout até ${hoje ? hora : `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} ${hora}`}`;
}

