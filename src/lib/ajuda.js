// Artigos e categorias da central de ajuda: a mesma fonte que a função "suporte" usa.
export { ARTIGOS, CATEGORIAS, buscarArtigos } from '../../supabase/functions/_shared/ajuda.ts';

/** Como cada situação do chamado aparece para a empresa. */
export const SITUACAO = {
  ia: { rotulo: 'Resposta automática', classe: 'badge-bot', dica: 'Veja se a resposta resolveu. Se não, passe para a equipe.' },
  fila: { rotulo: 'Na fila da equipe', classe: 'badge-waiting', dica: 'A equipe Helpy responde aqui mesmo, em até 1 dia útil.' },
  aguardando_voce: { rotulo: 'Respondido', classe: 'badge-human', dica: 'A equipe respondeu. Responda se ainda precisar.' },
  resolvido: { rotulo: 'Resolvido', classe: 'badge-closed', dica: 'Resolvido. Se voltar a acontecer, é só responder aqui.' },
};
