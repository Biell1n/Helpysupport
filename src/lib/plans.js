// Espelho de supabase/functions/_shared/plans.ts — mude os dois juntos.

// preco = preço de lançamento (quem assina agora mantém); precoCheio = quando chegarem WhatsApp e Instagram
export const PLANS = {
  trial: {
    id: 'trial', nome: 'Teste grátis', preco: 0, assistentes: 1, builderIA: true, builderMsgs: 40, atendimentos: 25, mensagens: 400,
    ticketsAbertos: 10, chamados: true, chamadosAvancados: true, integracoes: true, canaisMeta: 0, tabelas: 3, funcionarios: 2,
  },
  essencial: {
    id: 'essencial', nome: 'Essencial', preco: 79, precoCheio: 97, assistentes: 1, builderIA: true, builderMsgs: 40, atendimentos: 200, mensagens: 4000,
    ticketsAbertos: 20, chamados: true, chamadosAvancados: false, integracoes: false, canaisMeta: 0, tabelas: 3, funcionarios: 1,
  },
  profissional: {
    id: 'profissional', nome: 'Profissional', preco: 197, precoCheio: 247, assistentes: 3, builderIA: true, builderMsgs: 150, atendimentos: 600, mensagens: 9000,
    ticketsAbertos: 100, chamados: true, chamadosAvancados: true, integracoes: true, canaisMeta: 2, tabelas: 10, funcionarios: 5, destaque: true,
  },
  business: {
    id: 'business', nome: 'Business', preco: 497, precoCheio: 597, assistentes: 10, builderIA: true, builderMsgs: 300, atendimentos: 1500, mensagens: 24000,
    ticketsAbertos: null, chamados: true, chamadosAvancados: true, integracoes: true, canaisMeta: 20, tabelas: 50, funcionarios: 20,
  },
};

/** Dias de teste grátis para quem cria a conta. */
export const DIAS_DE_TESTE = 7;

/** O que cada plano inclui, em frases curtas (a página de planos e a inicial usam a mesma lista). */
export function recursosDoPlano(p) {
  const n = (x) => x.toLocaleString('pt-BR');
  return [
    `${n(p.atendimentos)} atendimentos e ${n(p.mensagens)} mensagens por mês`,
    `${p.assistentes} ${p.assistentes > 1 ? 'assistentes' : 'assistente'}`,
    `Criador com IA: ${n(p.builderMsgs)} mensagens por mês`,
    p.ticketsAbertos ? `${p.ticketsAbertos} chamados abertos ao mesmo tempo` : 'Chamados sem limite',
    `${p.tabelas} tabelas, agenda e relatórios`,
    p.integracoes ? 'Conecta com API e banco SQL' : null,
    `${p.funcionarios} ${p.funcionarios > 1 ? 'funcionários' : 'funcionário'} na equipe`,
    p.id === 'essencial' ? 'Link, QR code e site' : null,
    p.id === 'profissional' ? 'WhatsApp e Instagram (em breve)' : null,
    p.id === 'business' ? 'WhatsApp e Instagram em vários números (em breve)' : null,
  ].filter(Boolean);
}

/** Vaga de funcionário além das incluídas no plano. */
export const PRECO_FUNCIONARIO_EXTRA = 19;

export const planOf = (profile) => PLANS[profile?.plan] ?? PLANS.trial;

export const diasDeTeste = (profile) => {
  if (profile?.plan !== 'trial' || !profile?.trial_ends_at) return null;
  return Math.ceil((new Date(profile.trial_ends_at).getTime() - Date.now()) / 864e5);
};

export const reais = (n) =>
  n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: n % 1 ? 2 : 0 });
