export const numero = (n) => (n == null ? '—' : `Nº ${String(n).padStart(4, '0')}`);

export function quando(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const min = Math.round((Date.now() - d.getTime()) / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  if (min < 1440) return `há ${Math.round(min / 60)} h`;
  if (min < 2880) return 'ontem';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

export const iniciais = (nome = '') =>
  nome
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('') || '?';

export const STATUS = {
  bot: { rotulo: 'Com o assistente', classe: 'badge-bot' },
  waiting: { rotulo: 'Aguardando equipe', classe: 'badge-waiting' },
  human: { rotulo: 'Em atendimento', classe: 'badge-human' },
  closed: { rotulo: 'Encerrado', classe: 'badge-closed' },
};
