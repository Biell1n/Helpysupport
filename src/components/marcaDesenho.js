// Desenho da marca do Helpy, em vetor (sem depender de fonte instalada).
// O símbolo ocupa uma caixa de 200 × 200; o nome usa unidades em que a altura-x vale 100.

/**
 * O balão-senha: o balão de conversa com os picotes da senha de atendimento
 * (o mesmo desenho dos chamados do painel) e uma pontinha curva embaixo.
 * Tudo é paramétrico para a abertura poder "montar" a forma:
 *   cx, cy = centro do corpo; w, h = tamanho; r = raio dos cantos;
 *   f = raio dos picotes (0 = sem picote); t = tamanho da pontinha (0 a 1).
 */
export function senha({ cx = 100, cy = 92, w = 160, h = 136, r = 42, f = 14, t = 1 } = {}) {
  const x0 = cx - w / 2, x1 = cx + w / 2, y0 = cy - h / 2, y1 = cy + h / 2;
  const k = w / 160; // a pontinha acompanha o tamanho do corpo
  const lado = (x, desce) =>
    f > 0.2
      ? `V${cy + (desce ? -f : f)} A${f},${f} 0 0 ${desce ? 0 : 0} ${x},${cy + (desce ? f : -f)} `
      : '';
  const pontinha = t > 0.01
    ? `H${x0 + 70 * k} Q${x0 + (70 - 18 * t) * k},${y1 + 2 * t * k} ${x0 + (52 - 28 * t) * k},${y1 + 26 * t * k} ` +
      `Q${x0 + (52 - 18 * t) * k},${y1 + 8 * t * k} ${x0 + (70 - 36 * t) * k},${y1} `
    : '';
  return (
    `M${x0 + r},${y0} H${x1 - r} A${r},${r} 0 0 1 ${x1},${y0 + r} ${lado(x1, true)}V${y1 - r} ` +
    `A${r},${r} 0 0 1 ${x1 - r},${y1} ${pontinha}H${x0 + r} A${r},${r} 0 0 1 ${x0},${y1 - r} ` +
    `${lado(x0, false)}V${y0 + r} A${r},${r} 0 0 1 ${x0 + r},${y0} Z`
  );
}

/** Os olhinhos: duas pílulas (centro x, centro y, largura, altura). */
export const OLHOS = [
  { cx: 84, cy: 92, w: 17, h: 44 },
  { cx: 116, cy: 92, w: 17, h: 44 },
];

/** "helpy" letra por letra (Archivo larga, a mesma família dos títulos do site). Linha de base em y = 0. */
export const LETRAS = [
  { x: 0.0, d: 'M12.4 0V-137.7H44.4V-87.8H45.8Q50.5 -93.1 56.4 -96.3Q62.3 -99.5 68.9 -101Q75.6 -102.5 82.4 -102.5Q95.7 -102.5 104.8 -98.2Q113.8 -93.8 118.4 -84.9Q123.1 -76 123.1 -62.4V0H91.1V-57.8Q91.1 -62.9 89.7 -66.8Q88.3 -70.6 85.6 -73Q83 -75.4 79.1 -76.6Q75.3 -77.8 70.3 -77.8Q63.2 -77.8 57.3 -74.8Q51.4 -71.8 47.9 -66.5Q44.4 -61.2 44.4 -54.2V0Z' },
  { x: 130.2, d: 'M70.6 2.3Q51.3 2.3 37.3 -3.3Q23.3 -8.9 15.7 -20.5Q8.1 -32.1 8.1 -50.1Q8.1 -67.7 15.5 -79.4Q23 -91 36.8 -96.8Q50.6 -102.5 69.4 -102.5Q88.7 -102.5 102.2 -96.9Q115.7 -91.3 122.7 -79.9Q129.8 -68.6 129.8 -51.4V-43.5H41.2Q41.6 -35.2 45.1 -29.8Q48.6 -24.4 55.2 -21.8Q61.7 -19.3 71 -19.3Q75.7 -19.3 80.3 -20.3Q84.9 -21.4 88.6 -23.4Q92.2 -25.4 94.5 -28.4Q96.8 -31.4 97 -35.2H129.4Q129.4 -26.6 125.2 -19.6Q121 -12.7 113.2 -7.8Q105.4 -2.9 94.6 -0.3Q83.8 2.3 70.6 2.3ZM41.4 -61.4H96.1Q96.1 -66.2 94.2 -69.8Q92.3 -73.4 88.8 -75.9Q85.3 -78.4 80.6 -79.7Q75.9 -80.9 70.3 -80.9Q61.7 -80.9 55.6 -78.6Q49.4 -76.3 45.8 -71.9Q42.3 -67.5 41.4 -61.4Z' },
  { x: 263.3, d: 'M12.4 0V-137.7H44.4V0Z' },
  { x: 315.4, d: 'M12.5 35.9V-100.2H38.4L41.1 -85.1H42.6Q49.3 -94.6 58.8 -98.6Q68.4 -102.5 79.5 -102.5Q94.1 -102.5 105.1 -96.9Q116.2 -91.2 122.4 -79.6Q128.6 -68 128.6 -50.1Q128.6 -32.3 122.4 -20.7Q116.2 -9 105.4 -3.4Q94.5 2.3 80.4 2.3Q73.7 2.3 67.2 0.8Q60.7 -0.7 55.2 -3.8Q49.7 -6.9 45.8 -11.6H44.4V35.9ZM70.4 -22.4Q79.1 -22.4 84.8 -25.5Q90.4 -28.7 93.3 -34.5Q96.1 -40.3 96.1 -48.2V-52Q96.1 -60.1 93.3 -65.9Q90.4 -71.7 84.7 -74.8Q78.9 -77.9 70.2 -77.9Q61.7 -77.9 55.9 -74.6Q50 -71.3 47.1 -65.3Q44.2 -59.4 44.2 -51.2V-49.1Q44.2 -43.1 45.9 -38.1Q47.5 -33.2 50.8 -29.7Q54.1 -26.2 59 -24.3Q63.9 -22.4 70.4 -22.4Z' },
  { x: 446.8, d: 'M28.4 38.1Q22 38.1 17.1 37.1Q12.1 36.2 8.7 34.9V15.4H23.2Q30.4 15.4 34.8 13.4Q39.3 11.4 42 7.9Q44.8 4.4 46.7 0L0.6 -100.2H35.2L53.9 -54Q55.3 -50.8 57 -46.1Q58.7 -41.4 60.5 -36.5Q62.3 -31.7 63.6 -28H65.1Q65.6 -29.5 66.6 -32.7Q67.6 -35.8 69 -39.7Q70.5 -43.6 71.9 -47.5Q73.3 -51.3 74.3 -54.3L91.2 -100.2H124.3L84.3 -7.7Q79.9 2.3 75.2 10.6Q70.5 19 64.3 25.2Q58.1 31.4 49.4 34.7Q40.7 38.1 28.4 38.1Z' }
];

/** Medidas do nome: largura total, altura acima da linha de base e abaixo dela. */
export const NOME = { largura: 571.7, topo: 137.7, base: 38.1 };

/** Como símbolo e nome se encaixam no conjunto (em unidades do símbolo). */
export const CONJUNTO = { escala: 0.6, vao: 30, linhaBase: 122 };

export const CORES = { azul: '#1F66F4', marinho: '#0B1A2C', branco: '#FFFFFF', papel: '#F2F6FA' };
