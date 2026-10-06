// Cálculo do progresso do documento do assistente. Mesma regra da edge
// function (supabase/functions/_shared/schema.ts → computeState), rodando
// aqui para o medidor andar a cada tecla.

export const MODELOS = [
  { id: 'produto', nome: 'Loja', desc: 'Vende produtos físicos' },
  { id: 'servico', nome: 'Serviços', desc: 'Presta serviços sob orçamento ou tabela' },
  { id: 'agendamento', nome: 'Agendamento', desc: 'Clínica, salão, consultório: marca horário' },
  { id: 'curso', nome: 'Cursos', desc: 'Vende cursos ou infoprodutos' },
  { id: 'assinatura', nome: 'Assinatura', desc: 'Planos recorrentes, academia, clube' },
  { id: 'suporte', nome: 'Suporte', desc: 'Ajuda quem já é cliente a resolver problemas' },
  { id: 'informativo', nome: 'Informativo', desc: 'Só informa e tira dúvidas' },
  { id: 'educacional', nome: 'Educacional', desc: 'Professor ou monitor: ajuda a aprender' },
];

export const EMPTY_CONFIG = {
  fields: {},
  collections: {},
  declined: { collections: [], item_fields: {}, more: [] },
};

export function normalizeConfig(cfg) {
  const d = cfg?.declined || {};
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

const flatFields = (s) => (s?.sections || []).flatMap((x) => x.fields || []);
const flatCollections = (s) => (s?.sections || []).flatMap((x) => x.collections || []);
const isFilled = (e) => !!e && (e.status === 'ignorado' || String(e.value ?? '').trim() !== '');
const bucket = (imp) => (imp === 'critical' ? 'critical' : imp === 'important' ? 'important' : 'optional');

export function computeState(schema, rawConfig) {
  const cfg = normalizeConfig(rawConfig);
  const missing = { critical: [], important: [], optional: [] };
  const incomplete = {};
  let done = 0;
  let total = 0;

  for (const f of flatFields(schema)) {
    total++;
    if (isFilled(cfg.fields[f.key])) done++;
    else missing[bucket(f.importance)].push(f.key);
  }

  for (const c of flatCollections(schema)) {
    const declined = cfg.declined.collections.includes(c.key);
    const list = Array.isArray(cfg.collections[c.key]) ? cfg.collections[c.key] : [];
    total++;
    if (declined || list.length >= (c.min ?? 1)) done++;
    else missing[bucket(c.importance)].push(c.key);
    if (declined) continue;

    const skip = cfg.declined.item_fields[c.key] || [];
    const reqs = (c.item_fields || []).filter((f) => f.required && !skip.includes(f.key));
    list.forEach((item, idx) => {
      const faltam = reqs.filter((f) => !String(item?.[f.key] ?? '').trim());
      total += reqs.length;
      done += reqs.length - faltam.length;
      if (faltam.length) incomplete[`${c.key}:${idx}`] = faltam.map((f) => f.label);
    });
  }

  return {
    progress: total === 0 ? 0 : Math.round((done / total) * 100),
    missing,
    incomplete,
    ready: missing.critical.length === 0 && total > 0,
  };
}

export const labelOf = (schema, key) =>
  flatFields(schema).find((f) => f.key === key)?.label ?? flatCollections(schema).find((c) => c.key === key)?.label ?? key;
