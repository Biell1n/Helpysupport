// Espelho de supabase/functions/_shared/plans.ts — mude os dois juntos.

// preco = R$/mês no plano anual (cobrado 12x de uma vez); precoMensal = R$/mês no plano mensal
export const PLANS = {
  trial: {
    id: 'trial', nome: 'Teste grátis', preco: 0, precoMensal: 0, assistentes: 1, builderIA: true, builderMsgs: 40, atendimentos: 25, mensagens: 400,
    ticketsAbertos: 10, chamados: true, chamadosAvancados: true, integracoes: true, canaisMeta: 1, tabelas: 3, funcionarios: 2,
  },
  essencial: {
    id: 'essencial', nome: 'Essencial', preco: 79, precoMensal: 97, assistentes: 1, builderIA: true, builderMsgs: 40, atendimentos: 200, mensagens: 4000,
    ticketsAbertos: 20, chamados: true, chamadosAvancados: true, integracoes: false, canaisMeta: 1, tabelas: 3, funcionarios: 1,
  },
  profissional: {
    id: 'profissional', nome: 'Profissional', preco: 197, precoMensal: 247, assistentes: 3, builderIA: true, builderMsgs: 150, atendimentos: 600, mensagens: 9000,
    ticketsAbertos: 100, chamados: true, chamadosAvancados: true, integracoes: true, canaisMeta: 2, tabelas: 10, funcionarios: 5, destaque: true,
  },
  business: {
    id: 'business', nome: 'Business', preco: 497, precoMensal: 597, assistentes: 10, builderIA: true, builderMsgs: 300, atendimentos: 1500, mensagens: 24000,
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
    'Link, QR code, site e Discord',
    p.canaisMeta ? `WhatsApp e Instagram: até ${p.canaisMeta} ${p.canaisMeta === 1 ? 'conta' : 'contas'}` : null,
  ].filter(Boolean);
}

/** Chave geral do uso extra no painel. Espelha COBRANCA_EXTRA_PRONTA de extra.ts. */
export const USO_EXTRA_DISPONIVEL = true;

/** Uso extra: o que passa da cota do plano, cobrado à parte até o limite do mês. Espelha PRECO_EXTRA de plans.ts. */
export const PRECO_EXTRA = { atendimento: 0.4, mensagem: 0.05 };

/** Vaga de funcionário além das incluídas no plano. */
export const PRECO_FUNCIONARIO_EXTRA = 19;

export const planOf = (profile) => PLANS[profile?.plan] ?? PLANS.trial;

/** Quanto o anual economiza em relação ao mensal (em %). */
export const descontoAnual = (p) => (p.precoMensal ? Math.round((1 - p.preco / p.precoMensal) * 100) : 0);

/** Preços cobrados (espelha precosVigentes de plans.ts). O servidor manda os de verdade, inclusive os de teste. */
export const PRECOS_PADRAO = {
  teste: false,
  planos: Object.fromEntries(['essencial', 'profissional', 'business'].map((id) => [id, { mensal: PLANS[id].precoMensal, anual: PLANS[id].preco * 12 }])),
  vaga: PRECO_FUNCIONARIO_EXTRA,
  extra: PRECO_EXTRA,
  // % do Helpy sobre cada venda paga pelo chat (espelha TAXA_VENDAS de plans.ts)
  vendas: { trial: 2, essencial: 2, profissional: 1.5, business: 1 },
  carteira: false,
};

export const diasDeTeste = (profile) => {
  if (profile?.plan !== 'trial' || !profile?.trial_ends_at) return null;
  return Math.ceil((new Date(profile.trial_ends_at).getTime() - Date.now()) / 864e5);
};

export const reais = (n) =>
  n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: n % 1 ? 2 : 0 });
