// Gera a locução do vídeo, uma fala por cena, com a ElevenLabs.
//
//   ELEVEN_API_KEY=... node video/narrar.mjs [cena ...]
//
// Sem nomes de cena, gera todas. Cada fala vira video/narracao/<cena>.mp3 e a
// duração vai para video/narracao/duracoes.json, que o demo.js usa para
// dar a cada cena o tempo exato da fala.

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const PASTA = path.join(path.dirname(fileURLToPath(import.meta.url)), 'narracao');
const CHAVE = process.env.ELEVEN_API_KEY;
const VOZ = process.env.ELEVEN_VOZ || 'EXAVITQu4vr4xnSDxMaL'; // Sarah
if (!CHAVE) throw new Error('Defina ELEVEN_API_KEY');

export const FALAS = {
  abertura: 'Seu atendimento nunca fecha. Conheça o Helpy!',
  conte: 'Você conta como o seu negócio funciona, do seu jeito, numa conversa. E o Helpy monta o seu atendente.',
  publique: 'Depois, é só publicar o link: na bio, no site ou no QR code do balcão. Ele responde, consulta seus preços e marca horários, a qualquer hora.',
  canais: 'E atende onde o seu cliente já está: no WhatsApp, no Instagram, no Discord e no seu site. Tudo cai num painel só.',
  dados: 'Ele também se conecta com o que você já usa: planilhas do Excel e do Google, bancos de dados SQL, e sistemas como SAP e TOTVS. Preço e estoque, sempre certos.',
  chamados: 'Quando o assunto precisa de gente, ele abre um chamado com o resumo, e você responde na mesma conversa.',
  relatorios: 'E os relatórios mostram o que os seus clientes mais perguntam.',
  planos: 'Planos a partir de setenta e nove reais por mês.',
  fechamento: 'Teste grátis por sete dias. Crie o seu atendente.',
};

const ordem = Object.keys(FALAS);
const pedidas = process.argv.slice(2).length ? process.argv.slice(2) : ordem;
const arqDur = path.join(PASTA, 'duracoes.json');
const duracoes = existsSync(arqDur) ? JSON.parse(readFileSync(arqDur, 'utf8')) : {};

for (const cena of pedidas) {
  const i = ordem.indexOf(cena);
  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOZ}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'xi-api-key': CHAVE, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: FALAS[cena],
      model_id: 'eleven_multilingual_v2',
      // o texto vizinho deixa a entonação contínua entre as cenas
      previous_text: FALAS[ordem[i - 1]] ?? undefined,
      next_text: FALAS[ordem[i + 1]] ?? undefined,
      voice_settings: { stability: 0.5, similarity_boost: 0.8, style: 0.2, use_speaker_boost: true },
    }),
  });
  if (!r.ok) throw new Error(`${cena}: ${r.status} ${await r.text()}`);
  const arq = path.join(PASTA, `${cena}.mp3`);
  writeFileSync(arq, Buffer.from(await r.arrayBuffer()));
  const seg = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', arq]).toString());
  duracoes[cena] = Math.round(seg * 1000);
  console.log(cena, duracoes[cena], 'ms');
}
writeFileSync(arqDur, `${JSON.stringify(duracoes, null, 2)}\n`);
