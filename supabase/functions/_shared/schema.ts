// ============================================================
// O "documento" do assistente: seções, campos e listas.
//
// Todo assistente nasce deste esqueleto. O builder (IA ou formulário)
// preenche os valores e pode acrescentar campos/listas que o negócio
// pedir. Espelhado em src/lib/baseSchema.js para o modo formulário.
// ============================================================

export type Importance = 'critical' | 'important' | 'optional';

export interface FieldDef {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'select';
  importance: Importance;
  hint?: string;
  options?: string[];
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
  hint?: string;
  item_fields: ItemFieldDef[];
  custom?: boolean;
}

export interface Section {
  key: string;
  title: string;
  fields: FieldDef[];
  collections: CollectionDef[];
}

export interface Schema {
  sections: Section[];
}

export interface Config {
  fields: Record<string, { value: string; status: 'confirmado' | 'vazio' | 'ignorado' }>;
  collections: Record<string, Array<Record<string, string>>>;
  declined: { collections: string[]; item_fields: Record<string, string[]>; more: string[] };
}

export const EMPTY_CONFIG: Config = {
  fields: {},
  collections: {},
  declined: { collections: [], item_fields: {}, more: [] },
};

export const BASE_SCHEMA: Schema = {
  sections: [
    {
      key: 'negocio',
      title: 'O negócio',
      fields: [
        { key: 'nome_negocio', label: 'Nome do negócio', type: 'text', importance: 'critical', hint: 'Ex.: Barbearia do Zé' },
        { key: 'segmento', label: 'Ramo', type: 'text', importance: 'critical', hint: 'Ex.: barbearia, clínica odontológica, loja de roupas' },
        { key: 'descricao', label: 'O que vocês fazem', type: 'textarea', importance: 'critical', hint: 'Duas ou três frases, como você explicaria para um cliente novo.' },
        { key: 'endereco', label: 'Endereço', type: 'text', importance: 'important', hint: 'Rua, número, bairro e cidade. Deixe em branco se for só online.' },
        { key: 'contato', label: 'Contato direto', type: 'text', importance: 'important', hint: 'WhatsApp, telefone ou e-mail para casos que o assistente não resolve.' },
        { key: 'site', label: 'Site ou Instagram', type: 'text', importance: 'optional' },
      ],
      collections: [],
    },
    {
      key: 'atendente',
      title: 'O atendente',
      fields: [
        { key: 'nome_assistente', label: 'Nome do atendente', type: 'text', importance: 'critical', hint: 'Ex.: Bia. É como ele se apresenta.' },
        {
          key: 'tom', label: 'Jeito de falar', type: 'select', importance: 'important',
          options: ['Acolhedor', 'Profissional', 'Descontraído', 'Direto ao ponto'],
        },
        { key: 'saudacao', label: 'Primeira mensagem', type: 'textarea', importance: 'optional', hint: 'Ex.: Oi! Sou a Bia, da Barbearia do Zé. Quer marcar um horário?' },
      ],
      collections: [],
    },
    {
      key: 'funcionamento',
      title: 'Funcionamento',
      fields: [
        { key: 'horario', label: 'Horário de atendimento', type: 'textarea', importance: 'critical', hint: 'Ex.: seg a sex, 9h às 19h; sáb, 9h às 13h.' },
        { key: 'pagamento', label: 'Formas de pagamento', type: 'text', importance: 'important', hint: 'Ex.: Pix, cartão, dinheiro.' },
        { key: 'entrega', label: 'Entrega ou área atendida', type: 'text', importance: 'optional' },
        {
          key: 'usar_agenda', label: 'O atendente pode marcar horários?', type: 'select', importance: 'optional',
          options: ['Sim, pela agenda do Helpy', 'Não'],
          hint: 'Se sim, ele consulta a sua agenda e marca sozinho.',
        },
      ],
      collections: [],
    },
    {
      key: 'oferta',
      title: 'O que vocês oferecem',
      fields: [],
      collections: [
        {
          key: 'servicos',
          label: 'Serviços e produtos',
          importance: 'critical',
          min: 1,
          item_fields: [
            { key: 'nome', label: 'Nome', type: 'text', required: true },
            { key: 'preco', label: 'Preço', type: 'text', hint: 'Ex.: R$ 45 ou "a partir de R$ 80"' },
            { key: 'duracao', label: 'Duração', type: 'text', hint: 'Ex.: 40 min' },
            { key: 'descricao', label: 'Detalhes', type: 'textarea' },
          ],
        },
      ],
    },
    {
      key: 'duvidas',
      title: 'Perguntas frequentes',
      fields: [],
      collections: [
        {
          key: 'faq',
          label: 'Perguntas e respostas',
          importance: 'important',
          min: 1,
          item_fields: [
            { key: 'pergunta', label: 'Pergunta', type: 'text', required: true },
            { key: 'resposta', label: 'Resposta', type: 'textarea', required: true },
          ],
        },
      ],
    },
    {
      key: 'regras',
      title: 'Regras do atendimento',
      fields: [
        { key: 'politicas', label: 'Trocas, cancelamentos e garantias', type: 'textarea', importance: 'important' },
        { key: 'quando_humano', label: 'Quando chamar alguém da equipe', type: 'textarea', importance: 'important', hint: 'Ex.: reclamações, orçamentos acima de R$ 500, pedidos de reembolso.' },
        { key: 'nao_fazer', label: 'O que o atendente nunca deve fazer', type: 'textarea', importance: 'optional', hint: 'Ex.: dar desconto, prometer prazo de entrega.' },
      ],
      collections: [],
    },
  ],
};

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

export function normalizeSchema(s: Partial<Schema> | null | undefined): Schema {
  return Array.isArray(s?.sections) && s!.sections.length ? (s as Schema) : structuredClone(BASE_SCHEMA);
}

export const allFields = (s: Schema) => s.sections.flatMap((x) => x.fields);
export const allCollections = (s: Schema) => s.sections.flatMap((x) => x.collections);

export const valueOf = (cfg: Config, key: string) => {
  const e = cfg.fields[key];
  return e && e.status !== 'ignorado' ? String(e.value ?? '').trim() : '';
};

export function missingCritical(schema: Schema, cfg: Config): string[] {
  const out: string[] = [];
  for (const f of allFields(schema)) {
    const e = cfg.fields[f.key];
    const ok = e && (e.status === 'ignorado' || String(e.value ?? '').trim() !== '');
    if (f.importance === 'critical' && !ok) out.push(f.label);
  }
  for (const c of allCollections(schema)) {
    if (c.importance !== 'critical' || cfg.declined.collections.includes(c.key)) continue;
    const list = cfg.collections[c.key] ?? [];
    if (list.length < (c.min ?? 1)) out.push(c.label);
  }
  return out;
}

export const slug = (s: string) =>
  String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);

/** Texto legível do documento, usado nos prompts. */
export function describeConfig(schema: Schema, cfg: Config): string {
  const out: string[] = [];
  for (const s of schema.sections) {
    const linhas: string[] = [];
    for (const f of s.fields) {
      const v = valueOf(cfg, f.key);
      if (v) linhas.push(`- ${f.label}: ${v}`);
    }
    for (const c of s.collections) {
      if (cfg.declined.collections.includes(c.key)) continue;
      const list = cfg.collections[c.key] ?? [];
      if (!list.length) continue;
      linhas.push(`- ${c.label}:`);
      for (const item of list) {
        const partes = c.item_fields
          .map((f) => (String(item?.[f.key] ?? '').trim() ? `${f.label}: ${String(item[f.key]).trim()}` : ''))
          .filter(Boolean);
        if (partes.length) linhas.push(`  • ${partes.join(' | ')}`);
      }
    }
    if (linhas.length) out.push(`## ${s.title}\n${linhas.join('\n')}`);
  }
  return out.join('\n\n');
}
