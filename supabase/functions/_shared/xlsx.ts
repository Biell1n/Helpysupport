// ============================================================
// Leitor de .xlsx sem biblioteca de fora.
//
// Um .xlsx é um ZIP com XMLs dentro. Aqui: acha os arquivos no ZIP,
// descompacta com o DecompressionStream do próprio Deno e lê a primeira
// aba (texto, números, datas e fórmulas já calculadas). Sem dependência
// = sem vulnerabilidade de terceiros lendo arquivo que vem de fora.
// ============================================================

const LIMITE_DESCOMPACTADO = 40_000_000; // trava contra "zip bomba"

interface Entrada {
  nome: string;
  metodo: number;
  compactado: number;
  tamanho: number;
  local: number;
}

function u16(b: Uint8Array, i: number) {
  return b[i] | (b[i + 1] << 8);
}
function u32(b: Uint8Array, i: number) {
  return (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0;
}

function indice(zip: Uint8Array): Map<string, Entrada> {
  // fim do diretório central: assinatura 0x06054b50, nos últimos 64 KB
  let fim = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 65_557); i--) {
    if (u32(zip, i) === 0x06054b50) {
      fim = i;
      break;
    }
  }
  if (fim < 0) throw new Error('não é um ZIP');
  const total = u16(zip, fim + 10);
  let p = u32(zip, fim + 16);
  const mapa = new Map<string, Entrada>();
  const dec = new TextDecoder();
  for (let n = 0; n < total; n++) {
    if (u32(zip, p) !== 0x02014b50) throw new Error('ZIP corrompido');
    const nomeLen = u16(zip, p + 28);
    const extraLen = u16(zip, p + 30);
    const comentLen = u16(zip, p + 32);
    const nome = dec.decode(zip.subarray(p + 46, p + 46 + nomeLen));
    mapa.set(nome, {
      nome,
      metodo: u16(zip, p + 10),
      compactado: u32(zip, p + 20),
      tamanho: u32(zip, p + 24),
      local: u32(zip, p + 42),
    });
    p += 46 + nomeLen + extraLen + comentLen;
  }
  return mapa;
}

async function extrair(zip: Uint8Array, e: Entrada): Promise<string> {
  if (e.tamanho > LIMITE_DESCOMPACTADO) throw new Error('arquivo grande demais');
  const l = e.local;
  if (u32(zip, l) !== 0x04034b50) throw new Error('ZIP corrompido');
  const ini = l + 30 + u16(zip, l + 26) + u16(zip, l + 28);
  const dados = zip.subarray(ini, ini + e.compactado);
  if (e.metodo === 0) return new TextDecoder().decode(dados);
  if (e.metodo !== 8) throw new Error('compressão não suportada');
  const fluxo = new Blob([new Uint8Array(dados)]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  const leitor = fluxo.getReader();
  const partes: Uint8Array[] = [];
  let soma = 0;
  for (;;) {
    const { done, value } = await leitor.read();
    if (done) break;
    soma += value.length;
    if (soma > LIMITE_DESCOMPACTADO) {
      await leitor.cancel();
      throw new Error('arquivo grande demais');
    }
    partes.push(value);
  }
  const tudo = new Uint8Array(soma);
  let o = 0;
  for (const x of partes) {
    tudo.set(x, o);
    o += x.length;
  }
  return new TextDecoder().decode(tudo);
}

const ENTIDADES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
function texto(xml: string): string {
  return xml.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e: string) =>
    e[0] === '#' ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : ENTIDADES[e.toLowerCase()]
  );
}

/** Texto de um <si> ou <is>: junta todos os <t> (texto com formatação vem em pedaços). */
function juntarT(xml: string): string {
  let s = '';
  for (const m of xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)) s += m[1];
  return texto(s);
}

function colunaDe(ref: string): number {
  let n = 0;
  for (const ch of ref.replace(/\d+$/, '')) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

const DATA_FMT_IDS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47]);

function estilosDeData(styles: string): Set<number> {
  const custom = new Map<number, string>();
  for (const m of styles.matchAll(/<numFmt\s[^>]*numFmtId="(\d+)"[^>]*formatCode="([^"]*)"/g)) custom.set(Number(m[1]), texto(m[2]));
  const xfs = styles.match(/<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/)?.[1] ?? '';
  const datas = new Set<number>();
  let i = 0;
  for (const m of xfs.matchAll(/<xf\s([^>]*?)\/?>/g)) {
    const id = Number(m[1].match(/numFmtId="(\d+)"/)?.[1] ?? 0);
    const code = custom.get(id)?.replace(/\[[^\]]*\]|"[^"]*"/g, '') ?? '';
    if (DATA_FMT_IDS.has(id) || /[dmy]/i.test(code) && !/^[#0.,%\s]*$/.test(code)) datas.add(i);
    i++;
  }
  return datas;
}

/** Número de série do Excel → "dd/mm/aaaa" (com hora, se tiver). */
function dataDoExcel(serie: number): string {
  const ms = Math.round((serie - 25569) * 864e5);
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  const dia = `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
  const temHora = d.getUTCHours() || d.getUTCMinutes();
  if (serie < 1) return `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
  return temHora ? `${dia} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}` : dia;
}

/** Lê a primeira aba do .xlsx como linhas de texto. */
export async function lerXlsx(bytes: Uint8Array, maxLinhas = 5000): Promise<string[][]> {
  const zip = indice(bytes);
  const pegar = async (nome: string) => {
    const e = zip.get(nome);
    return e ? await extrair(bytes, e) : '';
  };

  // qual arquivo é a primeira aba
  const workbook = await pegar('xl/workbook.xml');
  const rels = await pegar('xl/_rels/workbook.xml.rels');
  const rid = workbook.match(/<sheet\s[^>]*r:id="([^"]+)"/)?.[1];
  let alvo = 'xl/worksheets/sheet1.xml';
  if (rid) {
    const t = rels.match(new RegExp(`<Relationship\\s[^>]*Id="${rid}"[^>]*Target="([^"]+)"`))?.[1]
      ?? rels.match(new RegExp(`<Relationship\\s[^>]*Target="([^"]+)"[^>]*Id="${rid}"`))?.[1];
    if (t) alvo = t.startsWith('/') ? t.slice(1) : `xl/${t.replace(/^\.\//, '')}`;
  }
  const sheet = await pegar(alvo);
  if (!sheet) throw new Error('aba não encontrada');

  const compart = [...(await pegar('xl/sharedStrings.xml')).matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => juntarT(m[1]));
  const datas = estilosDeData(await pegar('xl/styles.xml'));

  const linhas: string[][] = [];
  for (const row of sheet.matchAll(/<row\s([^>]*)>([\s\S]*?)<\/row>|<row\s([^>]*)\/>/g)) {
    if (linhas.length > maxLinhas) break;
    const r = Number((row[1] ?? row[3]).match(/\br="(\d+)"/)?.[1] ?? linhas.length + 1) - 1;
    const linha: string[] = [];
    let auto = 0;
    for (const c of (row[2] ?? '').matchAll(/<c\s([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = c[1];
      const ref = attrs.match(/\br="([A-Z]+\d+)"/)?.[1];
      const col = ref ? colunaDe(ref) : auto;
      auto = col + 1;
      const tipo = attrs.match(/\bt="(\w+)"/)?.[1] ?? 'n';
      const estilo = Number(attrs.match(/\bs="(\d+)"/)?.[1] ?? 0);
      const corpo = c[2] ?? '';
      const v = corpo.match(/<v>([\s\S]*?)<\/v>/)?.[1];
      let val = '';
      if (tipo === 's') val = compart[Number(v)] ?? '';
      else if (tipo === 'inlineStr') val = juntarT(corpo);
      else if (tipo === 'b') val = v === '1' ? 'Sim' : 'Não';
      else if (tipo === 'str' || tipo === 'e') val = texto(v ?? '');
      else if (v != null && v !== '') {
        const n = Number(v);
        val = datas.has(estilo) && Number.isFinite(n) ? dataDoExcel(n) : String(n).replace('.', ',');
      }
      linha[col] = val;
    }
    linhas[r] = Array.from(linha, (x) => x ?? '');
  }
  // tira linhas vazias e colunas sobrando no fim
  const cheias = Array.from(linhas, (l) => l ?? []).filter((l) => l.some((x) => String(x).trim()));
  const largura = Math.max(0, ...cheias.map((l) => {
    let n = l.length;
    while (n && !String(l[n - 1]).trim()) n--;
    return n;
  }));
  return cheias.map((l) => Array.from({ length: largura }, (_, i) => String(l[i] ?? '')));
}
