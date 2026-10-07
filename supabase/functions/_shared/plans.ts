// ============================================================
// Planos e limites. Espelhado em src/lib/plans.js — mude os dois juntos.
//
// Conta usada para chegar nos números (Claude Haiku 4.5 no atendimento):
// um atendimento médio custa ~US$0,02 (~R$0,11). Cada plano foi
// dimensionado para que, mesmo usando 100% da cota, a IA fique em
// torno de 1/3 do preço.
// ============================================================

export type PlanId = 'trial' | 'essencial' | 'profissional' | 'business';

export interface Plan {
  id: PlanId;
  nome: string;
  preco: number; // R$/mês
  assistentes: number;
  builderIA: boolean; // criar/editar conversando com a IA
  builderMsgs: number; // mensagens do builder por mês
  atendimentos: number; // conversas com clientes por mês
  ticketsAbertos: number | null; // null = sem limite
  chamados: boolean; // o assistente pode abrir chamado para a equipe
  chamadosAvancados: boolean; // senha para abrir chamado e casos em que não abrir
  tabelas: number;
  msgsPorAtendimento: number;
  funcionarios: number; // contas de funcionário (convite) além do dono
}

export const PLANS: Record<PlanId, Plan> = {
  trial: {
    id: 'trial', nome: 'Teste grátis', preco: 0, assistentes: 1, builderIA: true, builderMsgs: 150,
    atendimentos: 50, ticketsAbertos: 10, chamados: true, chamadosAvancados: true, tabelas: 3, msgsPorAtendimento: 30, funcionarios: 2,
  },
  essencial: {
    id: 'essencial', nome: 'Essencial', preco: 79, assistentes: 1, builderIA: false, builderMsgs: 0,
    atendimentos: 200, ticketsAbertos: 20, chamados: true, chamadosAvancados: false, tabelas: 3, msgsPorAtendimento: 40, funcionarios: 1,
  },
  profissional: {
    id: 'profissional', nome: 'Profissional', preco: 197, assistentes: 3, builderIA: true, builderMsgs: 400,
    atendimentos: 600, ticketsAbertos: 100, chamados: true, chamadosAvancados: true, tabelas: 10, msgsPorAtendimento: 40, funcionarios: 5,
  },
  business: {
    id: 'business', nome: 'Business', preco: 497, assistentes: 10, builderIA: true, builderMsgs: 1500,
    atendimentos: 1500, ticketsAbertos: null, chamados: true, chamadosAvancados: true, tabelas: 50, msgsPorAtendimento: 40, funcionarios: 20,
  },
};

export interface Profile {
  id: string;
  plan: PlanId;
  trial_ends_at: string | null;
  creditos_extra: number;
  company_name: string | null;
  full_name: string | null;
}

export function planOf(profile: Pick<Profile, 'plan'> | null): Plan {
  return PLANS[(profile?.plan as PlanId) ?? 'trial'] ?? PLANS.trial;
}

export function trialExpirado(profile: Pick<Profile, 'plan' | 'trial_ends_at'> | null): boolean {
  if (!profile || profile.plan !== 'trial' || !profile.trial_ends_at) return false;
  return new Date(profile.trial_ends_at).getTime() < Date.now();
}

export const inicioDoMes = () => {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString();
};
