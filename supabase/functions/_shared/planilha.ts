// ============================================================
// Planilha → tabela em Dados (lado do servidor).
//
// Mesma regra da importação pelo navegador (src/lib/planilha.js): a
// primeira linha é o cabeçalho, o tipo de cada coluna é adivinhado pelos
// valores e a primeira coluna identifica o registro. Mude os dois juntos.
// ============================================================

import { lerCsv } from './fontes.ts';

export const LIMITE_LINHAS = 5000;

export interface Coluna {
  chave: string;
  rotulo: string;
  tipo: 'texto' | 'texto_longo' | 'numero' | 'moeda' | 'data';
  ordem: number;
  obrigatoria: boolean;
}

export interface Aba {
  nome: string | null;
  cabecalho: string[];
  linhas: string[][];
}

export const chavear = (s: string) =>
  String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);

const NUMERO = /^-?\d{1,3}(\.\d{3})*(,\d+)?$|^-?\d+([.,]\d+)?$/;
const DATA = /^\d{4}-\d{2}-\d{2}$|^\d{2}\/\d{2}\/\d{4}$/;

/**
 * Lê o texto que o navegador manda: o .xlsx chega como CSV com "# Aba: nome"
 * antes de cada aba; um .csv comum chega como está. Abas sem dado ficam de fora.
 */
export function lerAbas(texto: string): Aba[] {
  const t = texto.replace(/^﻿/, '');
  const partes = /^# Aba: /m.test(t)
    ? t.split(/^# Aba: /m).filter((p) => p.trim()).map((p) => {
      const quebra = p.indexOf('\n');
      return { nome: (quebra < 0 ? p : p.slice(0, quebra)).trim() || null, corpo: quebra < 0 ? '' : p.slice(quebra + 1) };
    })
    : [{ nome: null, corpo: t }];
  const abas: Aba[] = [];
  for (const p of partes) {
    const todas = lerCsv(p.corpo);
    if (todas.length < 2) continue; // só cabeçalho (ou nada)
    const largura = Math.max(...todas.map((l) => l.length));
    const cabecalho = Array.from({ length: largura }, (_, i) => String(todas[0][i] ?? '').trim() || `Coluna ${i + 1}`);
    abas.push({ nome: p.nome, cabecalho, linhas: todas.slice(1, LIMITE_LINHAS + 1) });
  }
  return abas;
}

/** Monta as colunas a partir do cabeçalho, adivinhando o tipo pelos valores. */
export function colunasDe(cabecalho: string[], linhas: string[][]): Coluna[] {
  const usadas = new Set<string>();
  return cabecalho.map((bruto, i) => {
    const rotulo = String(bruto ?? '').trim() || `Coluna ${i + 1}`;
    let chave = chavear(rotulo) || `coluna_${i + 1}`;
    for (let n = 2; usadas.has(chave); n++) chave = `${chavear(rotulo) || 'coluna'}_${n}`;
    usadas.add(chave);
    const valores = linhas.slice(0, 200).map((l) => String(l[i] ?? '').trim()).filter(Boolean);
    let tipo: Coluna['tipo'] = 'texto';
    if (valores.length && valores.every((v) => NUMERO.test(v.replace(/^R\$\s?/, '')))) {
      tipo = /pre[cç]o|valor|custo|total|mensal/i.test(rotulo) || valores.some((v) => v.startsWith('R$')) ? 'moeda' : 'numero';
    } else if (valores.length && valores.every((v) => DATA.test(v))) tipo = 'data';
    else if (valores.some((v) => v.length > 120)) tipo = 'texto_longo';
    return { chave, rotulo: rotulo.slice(0, 80), tipo, ordem: i, obrigatoria: false };
  });
}

/** Transforma as linhas em registros { chave: valor } usando as colunas. */
export function registrosDe(colunas: Coluna[], linhas: string[][]): Record<string, string>[] {
  return linhas
    .slice(0, LIMITE_LINHAS)
    .map((l) => {
      const dados: Record<string, string> = {};
      colunas.forEach((c, i) => {
        const v = String(l[i] ?? '').trim();
        if (v) dados[c.chave] = c.tipo === 'moeda' ? v.replace(/^R\$\s?/, '') : v.slice(0, 2000);
      });
      return dados;
    })
    .filter((d) => Object.keys(d).length);
}
