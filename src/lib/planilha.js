// Leitura de planilhas no navegador: .xlsx, .csv e texto colado.
// O arquivo não sobe para lugar nenhum; só as linhas vão para a tabela.

export const LIMITE_LINHAS = 5000;

export const chavear = (s) =>
  String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);

export function lerCsv(texto) {
  const t = String(texto ?? '').replace(/^﻿/, '');
  const primeira = t.split(/\r?\n/, 1)[0] ?? '';
  const conta = (c) => primeira.split(c).length - 1;
  const sep = conta('\t') > 0 ? '\t' : conta(';') > conta(',') ? ';' : ',';
  const linhas = [];
  let linha = [];
  let campo = '';
  let aspas = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (aspas) {
      if (ch === '"' && t[i + 1] === '"') {
        campo += '"';
        i++;
      } else if (ch === '"') aspas = false;
      else campo += ch;
    } else if (ch === '"' && campo === '') aspas = true;
    else if (ch === sep) {
      linha.push(campo);
      campo = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && t[i + 1] === '\n') i++;
      linha.push(campo);
      campo = '';
      if (linha.some((c) => c.trim())) linhas.push(linha);
      linha = [];
    } else campo += ch;
  }
  if (campo || linha.length) {
    linha.push(campo);
    if (linha.some((c) => c.trim())) linhas.push(linha);
  }
  return linhas;
}

const doisDigitos = (n) => String(n).padStart(2, '0');

/** Valor de célula do Excel para texto, do jeito que o dono digitaria. */
export function textoDaCelula(v) {
  if (v == null) return '';
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return '';
    return `${v.getUTCFullYear()}-${doisDigitos(v.getUTCMonth() + 1)}-${doisDigitos(v.getUTCDate())}`;
  }
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100).replace('.', ',');
  if (typeof v === 'boolean') return v ? 'sim' : 'não';
  return String(v).trim();
}

/**
 * Lê o arquivo e devolve as abas com as linhas em texto.
 * [{ nome, linhas: [[...], ...] }]
 */
export async function lerArquivo(arquivo) {
  const nome = arquivo.name.toLowerCase();
  if (nome.endsWith('.csv') || nome.endsWith('.txt') || nome.endsWith('.tsv')) {
    const texto = await arquivo.text();
    return [{ nome: arquivo.name.replace(/\.[^.]+$/, ''), linhas: lerCsv(texto) }];
  }
  if (nome.endsWith('.xls')) {
    throw new Error('Arquivo .xls antigo: abra no Excel e salve como .xlsx ou .csv.');
  }
  if (!nome.endsWith('.xlsx')) throw new Error('Use um arquivo .xlsx (Excel) ou .csv.');
  const { default: lerExcel } = await import('read-excel-file/browser');
  const abas = await lerExcel(arquivo);
  return abas
    .map((a) => ({ nome: a.sheet, linhas: (a.data ?? []).map((l) => l.map(textoDaCelula)).filter((l) => l.some((c) => c)) }))
    .filter((a) => a.linhas.length);
}

const NUMERO = /^-?\d{1,3}(\.\d{3})*(,\d+)?$|^-?\d+([.,]\d+)?$/;
const DATA = /^\d{4}-\d{2}-\d{2}$|^\d{2}\/\d{2}\/\d{4}$/;

/** Monta as colunas a partir do cabeçalho, adivinhando o tipo pelos valores. */
export function colunasDe(cabecalho, linhas) {
  const usadas = new Set();
  return cabecalho.map((bruto, i) => {
    const rotulo = String(bruto ?? '').trim() || `Coluna ${i + 1}`;
    let chave = chavear(rotulo) || `coluna_${i + 1}`;
    for (let n = 2; usadas.has(chave); n++) chave = `${chavear(rotulo) || 'coluna'}_${n}`;
    usadas.add(chave);
    const valores = linhas.slice(0, 200).map((l) => String(l[i] ?? '').trim()).filter(Boolean);
    let tipo = 'texto';
    if (valores.length && valores.every((v) => NUMERO.test(v.replace(/^R\$\s?/, '')))) {
      tipo = /pre[cç]o|valor|custo|total|mensal/i.test(rotulo) || valores.some((v) => v.startsWith('R$')) ? 'moeda' : 'numero';
    } else if (valores.length && valores.every((v) => DATA.test(v))) tipo = 'data';
    else if (valores.some((v) => v.length > 120)) tipo = 'texto_longo';
    return { chave, rotulo: rotulo.slice(0, 80), tipo, ordem: i, obrigatoria: false };
  });
}

/** Transforma as linhas em registros { chave: valor } usando as colunas. */
export function registrosDe(colunas, linhas) {
  return linhas
    .slice(0, LIMITE_LINHAS)
    .map((l) => {
      const dados = {};
      colunas.forEach((c, i) => {
        if (c == null) return;
        const v = String(l[i] ?? '').trim();
        if (v) dados[c.chave] = c.tipo === 'moeda' ? v.replace(/^R\$\s?/, '') : v.slice(0, 2000);
      });
      return dados;
    })
    .filter((d) => Object.keys(d).length);
}
