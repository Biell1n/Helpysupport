// ============================================================
// O documento do assistente: seções, campos e listas.
//
// Herdado do builder do Horizons (v34), que chegou nisto depois de
// muito teste real:
//
// - O NÚCLEO vale para qualquer assistente: quem ele é, o que sabe,
//   quando chama uma pessoa. Nada de frete ou endereço aqui.
// - O que é do NEGÓCIO vem de duas camadas: campos de operação, que
//   aparecem conforme o modelo de negócio (um professor não vê frete),
//   e o catálogo, gerado sob medida para o ramo.
// - O vocabulário se adapta: um professor não tem "cliente".
//
// Espelhado em src/lib/documento.js para o modo formulário.
// ============================================================

export type Importance = 'critical' | 'important' | 'optional';

export const MODELOS = [
  'produto', 'servico', 'curso', 'assinatura', 'agendamento',
  'informativo', 'educacional', 'suporte',
] as const;
export type Modelo = (typeof MODELOS)[number];
export const VENDE: Modelo[] = ['produto', 'servico', 'curso', 'assinatura', 'agendamento'];

export interface FieldDef {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'select';
  importance: Importance;
  hint?: string;
  options?: string[];
  accumulates?: boolean;
  depende?: { campo: string; valores: string[] };
  custom?: boolean;
}

export interface ItemFieldDef {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'select';
  required?: boolean;
  hint?: string;
  options?: string[];
}

export interface CollectionDef {
  key: string;
  label: string;
  importance: Importance;
  min?: number;
  note?: string;
  item_fields: ItemFieldDef[];
  custom?: boolean;
}

export interface Section {
  key: string;
  label: string;
  note?: string;
  fields: FieldDef[];
  collections: CollectionDef[];
  dynamic?: boolean;
}

export interface Schema {
  business_model: Modelo | null;
  sections: Section[];
}

export interface Config {
  fields: Record<string, { value: string; status: 'confirmado' | 'vazio' | 'ignorado' }>;
  /**
   * Itens das listas. Chaves que começam com "_" são internas: `_sem` guarda,
   * separados por vírgula, os atributos que o dono não quis informar
   * naquele item (ex.: o preço de um produto específico).
   */
  collections: Record<string, Array<Record<string, string>>>;
  declined: { collections: string[]; item_fields: Record<string, string[]>; more: string[] };
}

/** Documento anexado na montagem (PDF, imagem, planilha), transcrito em texto. */
export interface Material {
  id: string;
  nome: string;
  tipo: string;
  texto: string;
  em: string;
}

export type MensagemBuilder = { role: 'user' | 'assistant'; content: string; anexos?: string[] };

/** O que o builder lembra entre mensagens e não aparece na tela. */
export interface Meta {
  business_model: Modelo | null;
  ramo: string | null;
  catalogo: Section | null; // seção do ramo gerada pela IA
  extra_fields: Record<string, FieldDef[]>; // campos criados, por seção
  extra_collections: Record<string, CollectionDef[]>;
  core_labels: Record<string, { label?: string; hint?: string }>;
  ask_counts: Record<string, number>;
  ask_turnos: Record<string, number>;
  turno: number;
  last_goal: string | null;
  review_done: boolean;
  tabela_oferecida: boolean;
  tabela_recusada: boolean;
  tabelas_criadas?: string[];
  /** documentos anexados, já em texto, que o assistente consulta ao atender */
  materiais?: Material[];
  /** o que o dono quer, resumido da conversa de montagem */
  briefing?: string;
  /** a conversa de montagem, para retomar ao editar */
  conversa?: MensagemBuilder[];
}

export const EMPTY_CONFIG: Config = {
  fields: {},
  collections: {},
  declined: { collections: [], item_fields: {}, more: [] },
};

/** Atributos que o dono não quis informar neste item. */
export const semNoItem = (item: Record<string, string> | undefined) =>
  String(item?._sem ?? '').split(',').map((x) => x.trim()).filter(Boolean);

export const EMPTY_META: Meta = {
  business_model: null,
  ramo: null,
  catalogo: null,
  extra_fields: {},
  extra_collections: {},
  core_labels: {},
  ask_counts: {},
  ask_turnos: {},
  turno: 0,
  last_goal: null,
  review_done: false,
  tabela_oferecida: false,
  tabela_recusada: false,
};

// ------------------------------------------------------------
// Núcleo
// ------------------------------------------------------------

const CORE_HEAD: Section[] = [
  {
    key: 'assistente',
    label: 'O assistente',
    note: 'Quem ele é e como ele fala.',
    fields: [
      { key: 'nome_assistente', label: 'Nome do assistente', type: 'text', importance: 'critical', hint: 'Como ele se apresenta a quem chega' },
      { key: 'nome_negocio', label: 'Em nome de quem ele fala', type: 'text', importance: 'critical', hint: 'Empresa, escola, escritório, ou o seu próprio nome' },
      {
        key: 'descricao_negocio', label: 'Para que ele serve', type: 'textarea', importance: 'critical',
        hint: 'Duas ou três frases: o que ele resolve e para quem. Ex.: tira dúvidas de quem quer comprar tênis de corrida',
      },
      {
        key: 'publico_alvo', label: 'Com quem ele conversa', type: 'textarea', importance: 'important',
        hint: 'Quem chega até ele. Ex.: clientes que já compraram; gente pesquisando preço',
      },
      {
        key: 'tom_de_voz', label: 'Como ele fala', type: 'textarea', importance: 'critical',
        hint: 'Formalidade, vocabulário e jeito. Ex.: simpático, palavras simples, sem gírias',
      },
      {
        key: 'regras', label: 'O que ele nunca deve fazer', type: 'textarea', importance: 'important', accumulates: true,
        hint: 'Proibições. Ex.: nunca dar desconto, nunca falar de concorrente',
      },
      { key: 'saudacao', label: 'Como ele abre a conversa', type: 'textarea', importance: 'optional', hint: 'A primeira mensagem. Pode deixar em branco e ele improvisa' },
    ],
    collections: [],
  },
  {
    key: 'conhecimento',
    label: 'O que ele precisa saber',
    note: 'O conteúdo que ele domina.',
    fields: [
      { key: 'assuntos_cobertos', label: 'Assuntos que ele domina', type: 'textarea', importance: 'important', hint: 'Lista solta dos temas que aparecem nas conversas' },
      {
        key: 'foco_atual', label: 'Foco do momento', type: 'textarea', importance: 'optional',
        hint: 'Algo passageiro que ele precisa saber agora. Ex.: promoção até sexta; loja fechada no feriado',
      },
    ],
    collections: [],
  },
];

const CORE_TAIL: Section[] = [
  {
    key: 'escalonamento',
    label: 'Chamados e equipe',
    note: 'Quando o assistente passa a conversa para uma pessoa. Dá para desligar: aí ele resolve tudo sozinho.',
    fields: [
      {
        key: 'chamados_ativos', label: 'Ele pode abrir chamado para a equipe?', type: 'select', importance: 'important',
        options: ['Sim', 'Não, ele resolve sozinho'],
        hint: 'Desligue se não houver ninguém para responder (ex.: um monitor de estudos).',
      },
      {
        key: 'quando_chamar_humano', label: 'Quando abrir chamado', type: 'textarea', importance: 'important',
        hint: 'Ex.: reclamação, negociação de preço, pedido de reembolso, assunto fora do escopo',
        depende: { campo: 'chamados_ativos', valores: ['Sim'] },
      },
      {
        key: 'nunca_chamar_humano', label: 'Quando NÃO abrir chamado', type: 'textarea', importance: 'optional',
        hint: 'Ex.: pedido de desconto (ele mesmo explica que não tem); dúvida que está no FAQ',
        depende: { campo: 'chamados_ativos', valores: ['Sim'] },
      },
      {
        key: 'codigo_chamado', label: 'Senha para abrir chamado', type: 'text', importance: 'optional',
        hint: 'Se preencher, a pessoa precisa informar esta senha para abrir chamado (ex.: código da turma). Em branco, qualquer um abre.',
        depende: { campo: 'chamados_ativos', valores: ['Sim'] },
      },
      {
        key: 'horario', label: 'Quando tem gente disponível', type: 'text', importance: 'optional',
        // O assistente funciona sempre; isto é quando existe um humano para assumir.
        hint: 'O assistente responde 24 horas. Aqui é quando você ou sua equipe conseguem assumir um chamado. Ex.: dias úteis, 9h às 18h',
        depende: { campo: 'chamados_ativos', valores: ['Sim'] },
      },
    ],
    collections: [
      {
        key: 'contatos',
        label: 'Para onde encaminhar',
        importance: 'important',
        min: 1,
        note: 'Seus contatos, para ele repassar quando precisar de uma pessoa. Se preferir que tudo vire chamado aqui no Helpy, pode dispensar.',
        item_fields: [
          { key: 'tipo', label: 'Canal', type: 'select', options: ['WhatsApp', 'Telefone', 'E-mail', 'Instagram', 'Site', 'Outro'], required: true },
          { key: 'valor', label: 'Número, endereço ou perfil', type: 'text', required: true },
        ],
      },
    ],
  },
  {
    key: 'duvidas',
    label: 'Perguntas frequentes',
    note: 'O que mais perguntam, e a resposta certa.',
    fields: [],
    collections: [
      {
        key: 'faq',
        label: 'Perguntas frequentes',
        importance: 'optional',
        min: 1,
        item_fields: [
          { key: 'pergunta', label: 'Pergunta', type: 'text', required: true },
          { key: 'resposta', label: 'Resposta', type: 'textarea', required: true },
        ],
      },
    ],
  },
];

// ------------------------------------------------------------
// Operação: aparece conforme o modelo de negócio
// ------------------------------------------------------------

const OPERACAO: Record<string, FieldDef[]> = {
  _comum: [
    {
      key: 'onde_encontrar', label: 'Onde as pessoas encontram vocês', type: 'textarea', importance: 'important',
      hint: 'Endereço, site, redes — o que existir. Se for só online, escreva isso.',
      depende: { campo: 'formato_atendimento', valores: ['Só presencial', 'Presencial e online'] },
    },
  ],
  vende: [
    {
      key: 'formato_atendimento', label: 'Como vocês atendem', type: 'select', importance: 'important',
      options: ['Só presencial', 'Só online', 'Presencial e online'],
    },
    { key: 'formas_pagamento', label: 'Formas de pagamento', type: 'textarea', importance: 'important', hint: 'Pix, cartão, parcelamento, boleto, dinheiro' },
    { key: 'garantia_trocas', label: 'Garantia e trocas', type: 'textarea', importance: 'important', hint: 'Prazo de garantia, política de troca e devolução' },
    { key: 'promocoes', label: 'Promoções e condições', type: 'textarea', importance: 'optional', hint: 'Desconto na primeira compra, cupom, frete grátis acima de tanto' },
  ],
  produto: [
    { key: 'entrega', label: 'Entrega e frete', type: 'textarea', importance: 'important', hint: 'Prazo, valor do frete, retirada no local, para onde entrega' },
  ],
  agendamento: [
    { key: 'agendamento_como', label: 'Como marcar horário', type: 'textarea', importance: 'important', hint: 'Antecedência, remarcação, o que acontece se faltar' },
    {
      key: 'usar_agenda', label: 'O assistente marca sozinho?', type: 'select', importance: 'optional',
      options: ['Sim, pela agenda do Helpy', 'Não, só informa'],
      hint: 'Se sim, ele consulta os horários livres da sua agenda e marca.',
    },
  ],
  educacional: [
    {
      key: 'nivel_alunos', label: 'Para quem ele ensina', type: 'text', importance: 'critical',
      hint: 'Ano, série ou idade. Ex.: 2º ano do fundamental, 7 e 8 anos',
    },
    {
      key: 'metodo_ensino', label: 'Como ele deve ensinar', type: 'textarea', importance: 'important',
      hint: 'Ex.: frases curtas, exemplos com objetos do dia a dia, nunca entregar a resposta, perguntar antes de explicar',
    },
    {
      key: 'materia', label: 'Matéria e conteúdo', type: 'textarea', importance: 'important',
      hint: 'O que está sendo estudado agora. Ex.: adição e subtração com dezenas; prova do 2º bimestre',
    },
  ],
  servico: [
    { key: 'agendamento_como', label: 'Como o cliente contrata', type: 'textarea', importance: 'important', hint: 'Orçamento, agendamento, prazo até começar' },
    {
      key: 'usar_agenda', label: 'O assistente marca sozinho?', type: 'select', importance: 'optional',
      options: ['Sim, pela agenda do Helpy', 'Não, só informa'],
      hint: 'Se sim, ele consulta os horários livres da sua agenda e marca.',
    },
  ],
};

function camposDeOperacao(model: Modelo | null): FieldDef[] {
  const out = model === 'educacional' ? [] : [...OPERACAO._comum];
  if (!model) return out;
  if (VENDE.includes(model)) out.push(...OPERACAO.vende);
  if (OPERACAO[model]) out.push(...OPERACAO[model]);
  return out;
}

// ------------------------------------------------------------
// Catálogos de reserva, quando a IA não gera um bom
// ------------------------------------------------------------

const cat = (key: string, label: string, note: string, colKey: string, colLabel: string, fields: ItemFieldDef[]): Section => ({
  key, label, note, fields: [], dynamic: true,
  collections: [{ key: colKey, label: colLabel, importance: 'critical', min: 1, item_fields: fields }],
});

export const FALLBACK: Record<Modelo, Section> = {
  produto: cat('catalogo', 'Produtos', 'O que está à venda, com preço e variações.', 'produtos', 'Produtos', [
    { key: 'nome', label: 'Nome do produto', type: 'text', required: true },
    { key: 'categoria', label: 'Categoria', type: 'text' },
    { key: 'descricao', label: 'Descrição', type: 'textarea' },
    { key: 'variacoes', label: 'Cores e tamanhos', type: 'text' },
    { key: 'preco', label: 'Preço', type: 'text', required: true },
    { key: 'disponibilidade', label: 'Disponibilidade', type: 'text' },
  ]),
  servico: cat('catalogo', 'Serviços', 'O que você faz, quanto custa e quanto demora.', 'servicos', 'Serviços', [
    { key: 'nome', label: 'Nome do serviço', type: 'text', required: true },
    { key: 'descricao', label: 'O que inclui', type: 'textarea' },
    { key: 'duracao', label: 'Duração', type: 'text' },
    { key: 'preco', label: 'Preço', type: 'text', required: true },
    { key: 'observacoes', label: 'Observações', type: 'text' },
  ]),
  curso: cat('catalogo', 'Cursos', 'O que se aprende, quanto dura e quanto custa.', 'cursos', 'Cursos', [
    { key: 'nome', label: 'Nome do curso', type: 'text', required: true },
    { key: 'descricao', label: 'O que ensina', type: 'textarea' },
    { key: 'carga_horaria', label: 'Carga horária', type: 'text' },
    { key: 'pre_requisito', label: 'Pré-requisito', type: 'text' },
    { key: 'formato', label: 'Formato', type: 'text' },
    { key: 'preco', label: 'Preço', type: 'text', required: true },
  ]),
  assinatura: cat('catalogo', 'Planos', 'As opções de assinatura e o que cada uma dá.', 'planos', 'Planos', [
    { key: 'nome', label: 'Nome do plano', type: 'text', required: true },
    { key: 'beneficios', label: 'O que inclui', type: 'textarea' },
    { key: 'periodicidade', label: 'Periodicidade', type: 'text' },
    { key: 'preco', label: 'Valor', type: 'text', required: true },
    { key: 'fidelidade', label: 'Fidelidade ou carência', type: 'text' },
  ]),
  agendamento: cat('catalogo', 'Procedimentos', 'O que dá para agendar, com duração e valor.', 'procedimentos', 'Procedimentos', [
    { key: 'nome', label: 'Procedimento', type: 'text', required: true },
    { key: 'descricao', label: 'Descrição', type: 'textarea' },
    { key: 'duracao', label: 'Duração', type: 'text' },
    { key: 'profissional', label: 'Quem atende', type: 'text' },
    { key: 'preco', label: 'Valor', type: 'text', required: true },
    { key: 'preparo', label: 'Preparo necessário', type: 'text' },
  ]),
  educacional: cat('catalogo', 'Conteúdo', 'O que o assistente ensina e como.', 'temas', 'Temas', [
    { key: 'tema', label: 'Tema ou assunto', type: 'text', required: true },
    { key: 'explicacao', label: 'Como explicar', type: 'textarea', required: true },
    { key: 'nivel', label: 'Ano ou nível', type: 'text' },
    { key: 'erros_comuns', label: 'Onde costumam errar', type: 'textarea' },
    { key: 'exemplo', label: 'Exemplo que funciona', type: 'textarea' },
  ]),
  suporte: cat('catalogo', 'Problemas e soluções', 'O que costuma dar errado, e o que fazer.', 'problemas', 'Problemas comuns', [
    { key: 'problema', label: 'Problema', type: 'text', required: true },
    { key: 'solucao', label: 'Como resolver', type: 'textarea', required: true },
    { key: 'sinais', label: 'Como identificar', type: 'text' },
    { key: 'quando_escalar', label: 'Quando chamar uma pessoa', type: 'text' },
  ]),
  informativo: cat('catalogo', 'Temas', 'Os assuntos que o assistente explica.', 'temas', 'Temas', [
    { key: 'titulo', label: 'Tema', type: 'text', required: true },
    { key: 'conteudo', label: 'O que dizer sobre isso', type: 'textarea', required: true },
    { key: 'observacoes', label: 'Cuidados ao falar disso', type: 'text' },
  ]),
};

// ------------------------------------------------------------
// Utilitários
// ------------------------------------------------------------

export const slug = (s: string) =>
  String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);

export const PRICE_RE = /(preco|valor|price|mensalidade|parcela|investimento|tarifa)/;

// Valores que parecem preenchimento mas não são informação. Sem isto a
// IA escrevia "Consultar" no preço, o item contava como completo e o
// assistente publicado respondia "consultar" ao cliente.
const LIXO_RE = new RegExp(
  '^(consultar|a consultar|sob consulta|consulte|consulte-nos|a definir|a combinar|sob demanda|varia conforme|depende|' +
    'nao informado|não informado|nao especificado|não especificado|sem informacao|sem informação|' +
    'indefinido|desconhecido|n/a|n\\.a\\.|nd|-+|\\?+|\\.+|_+)$',
  'i',
);

export function limpo(v: unknown, max = 4000): string {
  const t = String(v ?? '').trim().slice(0, max);
  return LIXO_RE.test(t) ? '' : t;
}

/** Endurece uma lista gerada pela IA: chaves limpas, identificador e preço obrigatórios. */
export function hardenCollection(col: CollectionDef, critical: boolean): CollectionDef {
  const fields = (col.item_fields ?? []).slice(0, 8).map((f, i) => {
    const key = slug(f.key || f.label) || `campo_${i + 1}`;
    return {
      key,
      label: String(f.label || key).slice(0, 40),
      type: f.type === 'textarea' ? 'textarea' as const : 'text' as const,
      required: f.required === true || i === 0 || PRICE_RE.test(key),
    };
  });
  return {
    key: slug(col.key || col.label) || 'itens',
    label: String(col.label || 'Itens').slice(0, 50),
    importance: critical ? 'critical' : 'important',
    min: 1,
    item_fields: fields,
  };
}

export function normalizeConfig(cfg: Partial<Config> | null | undefined): Config {
  const d = (cfg?.declined ?? {}) as Partial<Config['declined']>;
  return {
    fields: cfg?.fields && typeof cfg.fields === 'object' ? cfg.fields : {},
    collections: cfg?.collections && typeof cfg.collections === 'object' ? cfg.collections : {},
    declined: {
      collections: Array.isArray(d.collections) ? d.collections : [],
      item_fields: d.item_fields && typeof d.item_fields === 'object' ? d.item_fields : {},
      more: Array.isArray(d.more) ? d.more : [],
    },
  };
}

export function normalizeMeta(m: Partial<Meta> | null | undefined): Meta {
  const base = structuredClone(EMPTY_META);
  if (!m || typeof m !== 'object') return base;
  return {
    ...base,
    ...m,
    business_model: MODELOS.includes(m.business_model as Modelo) ? (m.business_model as Modelo) : null,
    extra_fields: m.extra_fields ?? {},
    extra_collections: m.extra_collections ?? {},
    core_labels: m.core_labels ?? {},
    ask_counts: m.ask_counts ?? {},
    ask_turnos: m.ask_turnos ?? {},
  };
}

/** Monta o documento completo a partir do que o builder sabe do negócio. */
export function buildSchema(metaIn: Partial<Meta>, config?: Config): Schema {
  const meta = normalizeMeta(metaIn);
  const model = meta.business_model;
  const campos = config?.fields ?? {};

  const aplica = (f: FieldDef) => {
    if (!f.depende) return true;
    const v = String(campos[f.depende.campo]?.value ?? '').trim();
    return !v || f.depende.valores.includes(v);
  };

  const vestir = <T extends { key: string; label: string; hint?: string }>(item: T): T => {
    const c = meta.core_labels[item.key];
    if (!c) return item;
    return {
      ...item,
      ...(c.label ? { label: String(c.label).slice(0, 60) } : {}),
      ...(c.hint !== undefined ? { hint: String(c.hint).slice(0, 160) } : {}),
    };
  };

  const prep = (sec: Section): Section => {
    const have = new Set(sec.fields.map((f) => f.key));
    const extras = (meta.extra_fields[sec.key] ?? []).filter((f) => !have.has(f.key));
    const extraCols = meta.extra_collections[sec.key] ?? [];
    return {
      ...sec,
      fields: [...sec.fields.filter(aplica).map(vestir), ...extras],
      collections: [...sec.collections.map(vestir), ...extraCols],
    };
  };

  const operacao: Section = {
    key: 'operacao',
    label: 'Como funciona',
    note: 'Onde encontram vocês e o que acontece na hora de fechar.',
    fields: camposDeOperacao(model),
    collections: [],
  };

  const catalogo = meta.catalogo ?? (model ? FALLBACK[model] : null);

  return {
    business_model: model,
    sections: [
      ...CORE_HEAD.map(prep),
      prep(operacao),
      ...(catalogo ? [prep(catalogo)] : []),
      ...CORE_TAIL.map(prep),
    ],
  };
}

export const allFields = (s: Schema) => s.sections.flatMap((x) => x.fields);
export const allCollections = (s: Schema) => s.sections.flatMap((x) => x.collections);

export const valueOf = (cfg: Config, key: string) => {
  const e = cfg.fields[key];
  return e && e.status !== 'ignorado' ? String(e.value ?? '').trim() : '';
};

const isFilled = (e: Config['fields'][string] | undefined) =>
  !!e && (e.status === 'ignorado' || String(e.value ?? '').trim() !== '');

/** O que falta, separado por importância, e os itens de lista incompletos. */
export function computeState(schema: Schema, cfg: Config) {
  const missing: Record<Importance, string[]> = { critical: [], important: [], optional: [] };
  const incomplete: Array<{ collection: string; label: string; index: number; item: string; fields: string[] }> = [];
  const askMore: string[] = [];

  for (const f of allFields(schema)) if (!isFilled(cfg.fields[f.key])) missing[f.importance].push(f.key);

  for (const c of allCollections(schema)) {
    const declined = cfg.declined.collections.includes(c.key);
    const list = cfg.collections[c.key] ?? [];
    if (!declined && list.length < (c.min ?? 1)) missing[c.importance].push(c.key);
    if (declined) continue;
    const skip = cfg.declined.item_fields[c.key] ?? [];
    const reqs = c.item_fields.filter((f) => f.required && !skip.includes(f.key));
    list.forEach((item, index) => {
      const sem = semNoItem(item);
      const faltam = reqs.filter((f) => !sem.includes(f.key) && !String(item?.[f.key] ?? '').trim()).map((f) => f.label);
      if (faltam.length) {
        incomplete.push({ collection: c.key, label: c.label, index, item: String(item?.[c.item_fields[0]?.key] ?? `item ${index + 1}`), fields: faltam });
      }
    });
    if (list.length > 0 && !cfg.declined.more.includes(c.key) && !['contatos', 'faq'].includes(c.key)) askMore.push(c.key);
  }
  return { missing, incomplete, askMore };
}

export function missingCritical(schema: Schema, cfg: Config): string[] {
  const { missing } = computeState(schema, cfg);
  const label = (k: string) => allFields(schema).find((f) => f.key === k)?.label ?? allCollections(schema).find((c) => c.key === k)?.label ?? k;
  return missing.critical.map(label);
}

/** Texto legível do documento, usado no prompt do atendente. */
export function describeConfig(schema: Schema, cfg: Config): string {
  const out: string[] = [];
  for (const s of schema.sections) {
    const linhas: string[] = [];
    for (const f of s.fields) {
      const v = valueOf(cfg, f.key);
      if (v) linhas.push(`${f.label}: ${v}`);
    }
    for (const c of s.collections) {
      if (cfg.declined.collections.includes(c.key)) continue;
      const list = cfg.collections[c.key] ?? [];
      if (!list.length) continue;
      linhas.push(`${c.label}:`);
      const semNaLista = cfg.declined.item_fields[c.key] ?? [];
      list.forEach((item, i) => {
        const sem = semNoItem(item);
        const partes = c.item_fields
          .map((f) => {
            const v = String(item?.[f.key] ?? '').trim();
            if (v) return `${f.label}: ${v}`;
            // dito de propósito, para ele não inventar nem prometer
            if (sem.includes(f.key) && !semNaLista.includes(f.key)) return `${f.label}: o dono preferiu não informar`;
            return '';
          })
          .filter(Boolean);
        if (partes.length) linhas.push(`  ${i + 1}. ${partes.join(' | ')}`);
      });
    }
    if (linhas.length) out.push(`## ${s.label}\n${linhas.join('\n')}`);
  }
  return out.join('\n\n');
}
