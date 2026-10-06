// Espelho de supabase/functions/_shared/plans.ts — mude os dois juntos.

export const PLANS = {
  trial: {
    id: 'trial', nome: 'Teste grátis', preco: 0, assistentes: 1, builderIA: true, builderMsgs: 150,
    atendimentos: 50, ticketsAbertos: 10, chamados: true, chamadosAvancados: true, tabelas: 3,
  },
  essencial: {
    id: 'essencial', nome: 'Essencial', preco: 79, assistentes: 1, builderIA: false, builderMsgs: 0,
    atendimentos: 200, ticketsAbertos: 20, chamados: true, chamadosAvancados: false, tabelas: 3,
  },
  profissional: {
    id: 'profissional', nome: 'Profissional', preco: 197, assistentes: 3, builderIA: true, builderMsgs: 400,
    atendimentos: 600, ticketsAbertos: 100, chamados: true, chamadosAvancados: true, tabelas: 10,
  },
  business: {
    id: 'business', nome: 'Business', preco: 497, assistentes: 10, builderIA: true, builderMsgs: 1500,
    atendimentos: 1500, ticketsAbertos: null, chamados: true, chamadosAvancados: true, tabelas: 50,
  },
};

export const planOf = (profile) => PLANS[profile?.plan] ?? PLANS.trial;

export const diasDeTeste = (profile) => {
  if (profile?.plan !== 'trial' || !profile?.trial_ends_at) return null;
  return Math.ceil((new Date(profile.trial_ends_at).getTime() - Date.now()) / 864e5);
};

export const reais = (n) =>
  n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: n % 1 ? 2 : 0 });
