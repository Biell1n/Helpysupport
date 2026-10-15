// Desenho da marca do Helpy, em vetor (sem depender de fonte instalada).
// O símbolo ocupa uma caixa de 200 × 200; o nome usa unidades em que a altura-x vale 100.

/**
 * O balão: quadrado de 160 com três cantos totalmente redondos e o canto de baixo à esquerda
 * com raio "rc". rc = 80 é um círculo perfeito; rc = 19,2 é a pontinha do balão.
 */
export function balao(rc = 19.2) {
  return balaoEm(20, 160, rc);
}

/** O mesmo balão em qualquer posição e tamanho (canto superior esquerdo em x, x). */
export function balaoEm(x, s, rc) {
  const y = x, R = s / 2;
  return (
    `M${x + R},${y} H${x + s - R} A${R},${R} 0 0 1 ${x + s},${y + R} V${y + s - R} ` +
    `A${R},${R} 0 0 1 ${x + s - R},${y + s} H${x + rc} A${rc},${rc} 0 0 1 ${x},${y + s - rc} ` +
    `V${y + R} A${R},${R} 0 0 1 ${x + R},${y} Z`
  );
}

/** Os olhinhos: duas pílulas (centro x, centro y, largura, altura). */
export const OLHOS = [
  { cx: 84, cy: 94, w: 17, h: 44 },
  { cx: 124, cy: 94, w: 17, h: 44 },
];

/**
 * A versão em contorno (a logo do site): o mesmo balão, menor, com traço de 22.
 * Por fora ela coincide com balaoEm(19, 162, 27.8) e por dentro com balaoEm(41, 118, 5.8).
 */
export const CONTORNO = { x: 30, s: 140, rc: 16.8, traco: 22 };
export const OLHOS_CONTORNO = [
  { cx: 83, cy: 99, w: 16, h: 38 },
  { cx: 117, cy: 99, w: 16, h: 38 },
];

/** "helpy" letra por letra (Geist SemiBold, espaçamento apertado). Linha de base em y = 0. */
export const LETRAS = [
  { x: 0.0, d: 'M12.7 0V-132.7H38.7V-76.9H35.3Q36.8 -85.6 41.3 -91.2Q45.7 -96.7 52.3 -99.5Q58.9 -102.2 66.7 -102.2Q77.9 -102.2 85.4 -97.4Q92.9 -92.6 96.7 -84Q100.6 -75.4 100.6 -64.3V0H74.6V-58Q74.6 -69.7 70.8 -75.6Q67 -81.4 58.5 -81.4Q49.3 -81.4 44 -75.3Q38.7 -69.3 38.7 -57.4V0Z' },
  { x: 105.2, d: 'M56.8 2.2Q41.7 2.2 30.5 -4.2Q19.3 -10.7 13.2 -22.4Q7.1 -34.2 7.1 -50Q7.1 -65.8 13.2 -77.5Q19.3 -89.2 30.4 -95.7Q41.5 -102.2 56.4 -102.2Q71 -102.2 81.9 -95.8Q92.8 -89.3 98.7 -77.3Q104.7 -65.2 104.7 -48.4V-42.9H34Q34.7 -30.4 40.8 -24.2Q47 -17.9 57.2 -17.9Q64.8 -17.9 69.8 -21.3Q74.9 -24.6 76.9 -30.9L103.3 -29.3Q99.3 -14.6 86.9 -6.2Q74.5 2.2 56.8 2.2ZM34 -59.5H77.9Q77.3 -71.1 71.4 -76.8Q65.6 -82.4 56.4 -82.4Q47.3 -82.4 41.3 -76.5Q35.3 -70.6 34 -59.5Z' },
  { x: 210.5, d: 'M37.8 0Q26.2 0 19.4 -5.9Q12.7 -11.8 12.7 -24.9V-132.7H38.7V-27.6Q38.7 -23.5 40.7 -21.6Q42.7 -19.7 46.4 -19.7H53.5V0Z' },
  { x: 261.7, d: 'M12.7 28V-100H37.7L38.2 -78.8L35.9 -79.8Q39.6 -90.7 48.1 -96.5Q56.5 -102.2 67.9 -102.2Q82 -102.2 91.4 -95.2Q100.7 -88.2 105.5 -76.4Q110.2 -64.6 110.2 -50Q110.2 -35.5 105.4 -23.6Q100.7 -11.8 91.2 -4.8Q81.8 2.2 67.7 2.2Q60.3 2.2 53.9 -0.4Q47.5 -3.1 42.9 -7.9Q38.3 -12.8 36.4 -19.4L38.7 -21.1V28ZM61 -18.2Q71.4 -18.2 77.4 -26.7Q83.4 -35.1 83.4 -50Q83.4 -64.9 77.4 -73.3Q71.4 -81.8 61 -81.8Q54.1 -81.8 49.1 -78.2Q44.1 -74.7 41.4 -67.6Q38.7 -60.5 38.7 -50Q38.7 -39.5 41.4 -32.4Q44 -25.3 49.1 -21.8Q54.1 -18.2 61 -18.2Z' },
  { x: 368.2, d: 'M20.4 28V8.3H33.4Q38.2 8.3 40.6 6.9Q42.9 5.4 44.2 1.9L46.6 -4.5H39.3L3.9 -100H30.7L54.7 -28.8L77.4 -100H104.1L65.3 10Q62 19.6 55.7 23.8Q49.5 28 38.4 28Z' },
];

/** Medidas do nome: largura total, altura acima da linha de base e abaixo dela. */
export const NOME = { largura: 476.3, topo: 132.7, base: 28.0 };

/** Como símbolo e nome se encaixam no conjunto (em unidades do símbolo). */
export const CONJUNTO = { escala: 0.62, vao: 34, linhaBase: 131 };

export const CORES = { azul: '#1F66F4', marinho: '#0B1A2C', branco: '#FFFFFF', papel: '#F2F6FA' };
