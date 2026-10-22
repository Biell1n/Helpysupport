// ============================================================
// Planos e limites. Espelhado em src/lib/plans.js — mude os dois juntos.
//
// Conta usada (pior caso, cliente usando 100% de tudo, dólar a R$ 5,60):
// mensagem de cliente ≈ R$ 0,0067 e mensagem no criador ≈ R$ 0,23, mais
// ~11% do preço em taxa de pagamento e imposto. Com os limites abaixo,
// todo plano fica com pelo menos 40% de lucro mesmo no pior caso.
// ============================================================

export type PlanId = 'trial' | 'essencial' | 'profissional' | 'business';

export interface Plan {
  id: PlanId;
  nome: string;
  preco: number; // R$/mês (preço de lançamento)
  assistentes: number;
  builderIA: boolean; // criar/editar conversando com a IA
  builderMsgs: number; // mensagens do criador por mês
  atendimentos: number; // conversas com clientes por mês
  mensagens: number; // mensagens de clientes por mês, somando todas as conversas
  ticketsAbertos: number | null; // null = sem limite
  chamados: boolean; // o assistente pode abrir chamado para a equipe
  chamadosAvancados: boolean; // senha para abrir chamado e casos em que não abrir
  integracoes: boolean; // consultar API e banco SQL da empresa
  canaisMeta: number; // quantos WhatsApp + Instagram conectados (Discord é livre)
  tabelas: number;
  msgsPorAtendimento: number;
  funcionarios: number; // contas de funcionário (convite) além do dono
}

export const PLANS: Record<PlanId, Plan> = {
  trial: {
    id: 'trial', nome: 'Teste grátis', preco: 0, assistentes: 1, builderIA: true, builderMsgs: 40, atendimentos: 25, mensagens: 400,
    ticketsAbertos: 10, chamados: true, chamadosAvancados: true, integracoes: true, canaisMeta: 0, tabelas: 3, msgsPorAtendimento: 30, funcionarios: 2,
  },
  essencial: {
    id: 'essencial', nome: 'Essencial', preco: 79, assistentes: 1, builderIA: true, builderMsgs: 40, atendimentos: 200, mensagens: 4000,
    ticketsAbertos: 20, chamados: true, chamadosAvancados: false, integracoes: false, canaisMeta: 0, tabelas: 3, msgsPorAtendimento: 40, funcionarios: 1,
  },
  profissional: {
    id: 'profissional', nome: 'Profissional', preco: 197, assistentes: 3, builderIA: true, builderMsgs: 150, atendimentos: 600, mensagens: 9000,
    ticketsAbertos: 100, chamados: true, chamadosAvancados: true, integracoes: true, canaisMeta: 2, tabelas: 10, msgsPorAtendimento: 40, funcionarios: 5,
  },
  business: {
    id: 'business', nome: 'Business', preco: 497, assistentes: 10, builderIA: true, builderMsgs: 300, atendimentos: 1500, mensagens: 24000,
    ticketsAbertos: null, chamados: true, chamadosAvancados: true, integracoes: true, canaisMeta: 20, tabelas: 50, msgsPorAtendimento: 40, funcionarios: 20,
  },
};

/**
 * Uso extra: o que passa da cota do plano, cobrado à parte até o limite do
 * mês que o dono escolher. Custo medido de IA por mensagem: média ≈ R$ 0,01,
 * as mais pesadas ≈ R$ 0,03 (e uma busca na internet soma ≈ R$ 0,05); a
 * mensagem a R$ 0,05 cobre isso com margem.
 */
export const PRECO_EXTRA = { atendimento: 0.4, mensagem: 0.05 } as const;

/** Vaga de funcionário além das incluídas no plano (por mês). Espelha src/lib/plans.js. */
export const PRECO_FUNCIONARIO_EXTRA = 19;

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
