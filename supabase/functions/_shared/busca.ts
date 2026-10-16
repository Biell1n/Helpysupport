// ============================================================
// Busca nas tabelas e listas do negócio, do jeito que uma pessoa procuraria.
//
// - "memória ram 16" acha "Kit RAM DDR4 16 GB": cada palavra conta ponto,
//   não precisa estar tudo igualzinho; número junto ou separado da unidade
//   ("16gb" / "16 GB") dá no mesmo
// - erro de digitação passa ("procesador", "gabinte")
// - plural e singular são a mesma coisa
// - sinônimos: o próprio assistente manda alternativas separadas por "|"
//   ("memória ram | pente | ddr4"); vale a que achar mais
// - ninguém bateu: a resposta diz o que existe (categorias), para tentar de novo
// ============================================================

const semAcento = (s: string) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
/** "16 gb" → "16gb", "650 w" → "650w": unidade grudada no número */
const juntar = (x: string) => x.replace(/(\d)\s+(?=[a-z])/g, '$1');
const normal = (x: string) => juntar(semAcento(x));

/** plural → singular, só o suficiente para "placas"/"placa", "fontes"/"fonte" */
const raiz = (w: string) => (w.length > 4 ? w.replace(/(oes|aes|es|s)$/, (m) => (m === 'oes' ? 'ao' : m === 'aes' ? 'ao' : '')) : w);

const VAZIAS = new Set(['de', 'da', 'do', 'das', 'dos', 'para', 'pra', 'com', 'um', 'uma', 'que', 'tem', 'voces', 'algum', 'alguma', 'e', 'o', 'a', 'os', 'as', 'no', 'na', 'em', 'por', 'mais', 'qual', 'quais']);

const palavrasDe = (x: string) =>
  normal(x).split(/[^a-z0-9.,]+/).filter((w) => w.length >= 2 && !VAZIAS.has(w)).map(raiz);

/** distância de edição pequena (para erro de digitação) */
function perto(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let erros = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++erros > 1) return false;
    if (a.length > b.length) i++;
    else if (a.length < b.length) j++;
    else {
      i++;
      j++;
    }
  }
  return erros + (a.length - i) + (b.length - j) <= 1;
}

export interface Achado<T> {
  item: T;
  pontos: number;
}

/** O que olhar em cada registro: o principal (nome, categoria…) pesa mais que o resto (observações…). */
export interface Textos {
  forte: string;
  resto?: string;
}

/**
 * Ordena os registros pelo quanto batem com a busca. Fica com os que fazem
 * sentido: perto do melhor resultado, nunca o que só bateu de raspão.
 */
export function buscar<T>(registros: T[], busca: string, textoDe: (r: T) => Textos): Achado<T>[] {
  const alternativas = busca.split('|').map((b) => b.trim()).filter(Boolean);
  if (!alternativas.length) return [];

  const quebra = (tx: string) => new Set(tx.split(/[^a-z0-9.,]+/).filter(Boolean).map(raiz));
  const base = registros.map((r) => {
    const t = textoDe(r);
    const forte = normal(t.forte);
    const resto = normal(t.resto ?? '');
    return { r, forte, resto, pForte: quebra(forte), pResto: quebra(resto) };
  });

  const notas = new Map<T, number>();
  for (const alt of alternativas) {
    const ps = [...new Set(palavrasDe(alt))];
    if (!ps.length) continue;
    const frase = normal(alt);
    for (const b of base) {
      let pontos = 0;
      for (const p of ps) {
        if (b.forte.includes(p)) pontos += 1;
        else if (p.length >= 5 && [...b.pForte].some((w) => perto(w, p))) pontos += 0.8;
        else if (b.resto.includes(p)) pontos += 0.35;
        else if (p.length >= 5 && [...b.pResto].some((w) => perto(w, p))) pontos += 0.25;
      }
      if (!pontos) continue;
      if (frase.length > 3 && b.forte.includes(frase)) pontos += 2;
      // proporção: bater 3 de 3 palavras vale mais que 3 de 6
      const nota = pontos / ps.length;
      if (nota > (notas.get(b.r) ?? 0)) notas.set(b.r, nota);
    }
  }
  const ordem = [...notas.entries()].map(([item, pontos]) => ({ item, pontos })).sort((a, b) => b.pontos - a.pontos);
  if (!ordem.length) return [];
  const melhor = ordem[0].pontos;
  return ordem.filter((x) => x.pontos >= Math.max(melhor * 0.5, 0.3));
}

/** Quando nada bate: o que existe na tabela (pela coluna que parece ser a categoria). */
export function categorias(registros: Record<string, unknown>[], colunas: { chave: string; rotulo: string }[]) {
  const col = colunas.find((c) => /categoria|tipo|linha|grupo|secao|seção|departamento|setor/i.test(`${c.chave} ${c.rotulo}`));
  if (!col) return null;
  const conta = new Map<string, number>();
  for (const r of registros) {
    const v = String(r?.[col.chave] ?? '').trim();
    if (v) conta.set(v, (conta.get(v) ?? 0) + 1);
  }
  return [...conta.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30).map(([v, n]) => `${v} (${n})`);
}
