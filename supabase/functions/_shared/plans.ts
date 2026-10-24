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
  preco: number; // R$/mês no plano anual (cobrado 12x de uma vez)
  precoMensal: number; // R$/mês no plano mensal
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
    id: 'trial', nome: 'Teste grátis', preco: 0, precoMensal: 0, assistentes: 1, builderIA: true, builderMsgs: 40, atendimentos: 25, mensagens: 400,
    ticketsAbertos: 10, chamados: true, chamadosAvancados: true, integracoes: true, canaisMeta: 1, tabelas: 3, msgsPorAtendimento: 30, funcionarios: 2,
  },
  essencial: {
    id: 'essencial', nome: 'Essencial', preco: 79, precoMensal: 97, assistentes: 1, builderIA: true, builderMsgs: 40, atendimentos: 200, mensagens: 4000,
    ticketsAbertos: 20, chamados: true, chamadosAvancados: true, integracoes: false, canaisMeta: 1, tabelas: 3, msgsPorAtendimento: 40, funcionarios: 1,
  },
  profissional: {
    id: 'profissional', nome: 'Profissional', preco: 197, precoMensal: 247, assistentes: 3, builderIA: true, builderMsgs: 150, atendimentos: 600, mensagens: 9000,
    ticketsAbertos: 100, chamados: true, chamadosAvancados: true, integracoes: true, canaisMeta: 2, tabelas: 10, msgsPorAtendimento: 40, funcionarios: 5,
  },
  business: {
    id: 'business', nome: 'Business', preco: 497, precoMensal: 597, assistentes: 10, builderIA: true, builderMsgs: 300, atendimentos: 1500, mensagens: 24000,
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

export function planOf(profile: (Pick<Profile, 'plan'> & { precos_teste?: boolean }) | null): Plan {
  const plan = PLANS[(profile?.plan as PlanId) ?? 'trial'] ?? PLANS.trial;
  // preços de teste: o Essencial fica com cota pequena, para dar para testar o uso extra
  return profile?.precos_teste && plan.id === 'essencial' ? { ...plan, ...COTA_TESTE } : plan;
}

// ------------------------------------------------------------
// Preços cobrados. Anual = 12x o preço do plano, numa cobrança só.
// Com os preços de teste ligados (helpy_config.precos_teste), tudo vai para o
// mínimo do Asaas (R$ 5 por cobrança), para o dono testar pagando de verdade.
// ------------------------------------------------------------
export type Ciclo = 'mensal' | 'anual';
export type PlanoPago = 'essencial' | 'profissional' | 'business';
export const PAGOS: PlanoPago[] = ['essencial', 'profissional', 'business'];

export interface Precos {
  teste: boolean;
  planos: Record<PlanoPago, Record<Ciclo, number>>; // valor de cada cobrança (mês ou ano)
  vaga: number; // por mês
  extra: { atendimento: number; mensagem: number };
  vendas: Record<PlanId, number>; // % do Helpy sobre cada venda paga pelo chat
  cota_teste?: typeof COTA_TESTE;
}

/**
 * Taxa do Helpy sobre as vendas fechadas pelo assistente (em %), somada no
 * mês e cobrada com o uso extra. Menor nos planos maiores: quem vende mais
 * tem motivo para subir de plano. Fica abaixo do que marketplaces cobram
 * (10% a 20%) porque a venda e o cliente são da empresa.
 */
export const TAXA_VENDAS: Record<PlanId, number> = { trial: 2, essencial: 2, profissional: 1.5, business: 1 };

const COTA_TESTE = { atendimentos: 30, mensagens: 400 };

export function precosVigentes(teste: boolean): Precos {
  if (teste) {
    return {
      teste,
      // anual com valor próprio (e menor por mês), senão os dois ciclos parecem iguais na tela
      planos: { essencial: { mensal: 5, anual: 10 }, profissional: { mensal: 6, anual: 11 }, business: { mensal: 7, anual: 12 } },
      vaga: 0.01,
      // a fatura mínima do Asaas é R$ 5: a R$ 0,50 por mensagem, 10 mensagens já geram uma
      extra: { atendimento: 1, mensagem: 0.5 },
      vendas: TAXA_VENDAS,
      cota_teste: COTA_TESTE,
    };
  }
  const planos = Object.fromEntries(PAGOS.map((id) => [id, { mensal: PLANS[id].precoMensal, anual: PLANS[id].preco * 12 }])) as Precos['planos'];
  return { teste, planos, vaga: PRECO_FUNCIONARIO_EXTRA, extra: { ...PRECO_EXTRA }, vendas: TAXA_VENDAS };
}

/** Valor de cada cobrança da assinatura: plano no ciclo + vagas extras (mensais, x12 no anual). */
export function valorDaAssinatura(p: Precos, plano: PlanoPago, ciclo: Ciclo, vagas: number): number {
  const v = p.planos[plano][ciclo] + Math.max(0, vagas) * p.vaga * (ciclo === 'anual' ? 12 : 1);
  return Math.round(v * 100) / 100;
}

export function trialExpirado(profile: Pick<Profile, 'plan' | 'trial_ends_at'> | null): boolean {
  if (!profile || profile.plan !== 'trial' || !profile.trial_ends_at) return false;
  return new Date(profile.trial_ends_at).getTime() < Date.now();
}

export const inicioDoMes = () => {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString();
};
