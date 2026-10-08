/**
 * Prova de trabalho do chat público.
 *
 * Antes da primeira mensagem, o navegador procura um número (nonce) que
 * faça SHA-256("token:visitante:hora:nonce") começar com N bits zero.
 * Para uma pessoa leva menos de um segundo e roda enquanto ela digita;
 * para um robô abrindo milhares de conversas, cada uma custa esse tempo.
 * O servidor confere com um único hash.
 */

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);
const W = new Uint32Array(64);

/** Primeira palavra (32 bits) do SHA-256 dos bytes — basta para contar zeros até 32. */
function sha256Inicio(bytes) {
  const len = bytes.length;
  const blocos = ((len + 9 + 63) >> 6) << 6;
  const m = new Uint8Array(blocos);
  m.set(bytes);
  m[len] = 0x80;
  const bits = len * 8;
  m[blocos - 4] = bits >>> 24;
  m[blocos - 3] = bits >>> 16;
  m[blocos - 2] = bits >>> 8;
  m[blocos - 1] = bits;

  let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a;
  let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;
  for (let o = 0; o < blocos; o += 64) {
    for (let i = 0; i < 16; i++) {
      const j = o + i * 4;
      W[i] = (m[j] << 24) | (m[j + 1] << 16) | (m[j + 2] << 8) | m[j + 3];
    }
    for (let i = 16; i < 64; i++) {
      const a = W[i - 15], b = W[i - 2];
      const s0 = ((a >>> 7) | (a << 25)) ^ ((a >>> 18) | (a << 14)) ^ (a >>> 3);
      const s1 = ((b >>> 17) | (b << 15)) ^ ((b >>> 19) | (b << 13)) ^ (b >>> 10);
      W[i] = (W[i - 16] + s0 + W[i - 7] + s1) | 0;
    }
    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
    for (let i = 0; i < 64; i++) {
      const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const t1 = (h + S1 + ((e & f) ^ (~e & g)) + K[i] + W[i]) | 0;
      const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const t2 = (S0 + ((a & b) ^ (a & c) ^ (b & c))) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0;
      d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    h0 = (h0 + a) | 0; h1 = (h1 + b) | 0; h2 = (h2 + c) | 0; h3 = (h3 + d) | 0;
    h4 = (h4 + e) | 0; h5 = (h5 + f) | 0; h6 = (h6 + g) | 0; h7 = (h7 + h) | 0;
  }
  return h0 >>> 0;
}

const enc = new TextEncoder();

/**
 * Resolve o desafio em fatias, sem travar a página.
 * `agora` é a hora do servidor (vem no "info"), para relógio errado não atrapalhar.
 */
export function resolverDesafio({ token, visitante, agora, bits }) {
  return resolverProva(`${token}:${visitante}`, { agora, bits });
}

/** Prova sobre um texto qualquer (ex.: o e-mail no cadastro, conferida pelo banco). */
export function resolverProva(texto, { agora = Date.now(), bits = 17 } = {}) {
  const ts = Math.floor(agora);
  const prefixo = `${texto}:${ts}:`;
  const limite = 2 ** (32 - bits);
  let nonce = 0;
  return new Promise((ok) => {
    const fatia = () => {
      const fim = nonce + 4000;
      for (; nonce < fim; nonce++) {
        if (sha256Inicio(enc.encode(prefixo + nonce)) < limite) return ok({ ts, nonce });
      }
      setTimeout(fatia, 0);
    };
    fatia();
  });
}

export const _sha256Inicio = sha256Inicio;
