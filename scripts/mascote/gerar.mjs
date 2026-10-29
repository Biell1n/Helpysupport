#!/usr/bin/env node
// ============================================================
// Mascote novo do Helpy: o balão-senha da marca em 3D (vinil macio).
//
// Gera pela API do kie.ai (modelo de imagem Seedream). Precisa da variável
// KIE_AI_API_KEY no ambiente.
//
//   node scripts/mascote/gerar.mjs conceito   → 3 variações do personagem inteiro
//   node scripts/mascote/gerar.mjs camadas <conceito.png>
//        → corpo, braços, ticket e balãozinho separados, no mesmo estilo do
//          conceito escolhido, em fundo verde (depois recortado: recortar.py)
//
// O rosto sai sem olhos: os olhos (as duas pílulas da marca) são desenhados
// por cima no site, para piscar e seguir o mouse como no logo.
// ============================================================

import fs from 'node:fs';
import path from 'node:path';

const API = 'https://api.kie.ai';
const UPLOAD = 'https://kieai.redpandaai.co/api/file-base64-upload';
const KEY = process.env.KIE_AI_API_KEY;
if (!KEY) {
  console.error('Falta KIE_AI_API_KEY no ambiente.');
  process.exit(1);
}
const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` };
const SAIDA = path.resolve('scripts/mascote/saida');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ESTILO = `Premium 3D character render in the style of a designer vinyl toy. Soft-touch matte material with subtle subsurface scattering and a gentle satin sheen. Soft studio key light from the upper left, cool blue rim light from behind, soft contact shadow. Minimal, friendly, high-end, clean geometry, no clutter. Brand color cobalt blue #1F66F4 with a slightly lighter top face; accents in pure white. No text, no letters, no logos, no watermark.`;

const CORPO = `The mascot's entire body is a single inflated speech bubble shaped like a queue ticket: a soft rounded rectangle, wider than tall, with one semicircular notch cut into the middle of the left side and one into the middle of the right side (like a perforated ticket stub), and a small curved speech-bubble tail at the bottom left. The front face is smooth and completely blank: NO eyes, NO mouth, NO facial features at all. Two short stubby rounded white arms attached at the lower sides.`;

const CONCEITOS = [
  `${CORPO} The left arm waves hello, the right arm rests. Three-quarter view, floating slightly tilted, cheerful pose. Clean light gray-blue studio background (#F2F6FA).`,
  `${CORPO} Both arms open in a welcoming gesture. Front view, slight bounce pose. A small white ticket stub and a tiny white chat bubble float beside it. Clean light gray-blue studio background (#F2F6FA).`,
  `${CORPO} One arm raised holding a tiny white ticket stub like presenting a number. Three-quarter view from slightly below, heroic but cute. Clean light gray-blue studio background (#F2F6FA).`,
];

// fundo verde liso para recortar depois (sem sombra no fundo)
const VERDE = 'Isolated on a perfectly flat solid chroma-key green background (#00FF00), evenly lit, no shadow on the background, no floor, nothing else in frame.';
const CAMADAS = {
  corpo: `The same mascot body only, exactly matching the reference style, color and proportions, WITHOUT arms, blank face with no eyes and no mouth, front three-quarter view, centered. ${VERDE}`,
  'braco-acena': `Only the mascot's left arm from the reference, alone, raised and waving, short stubby rounded white arm with a soft rounded hand, same material and lighting as the reference. ${VERDE}`,
  'braco-parado': `Only the mascot's right arm from the reference, alone, resting downward, short stubby rounded white arm, same material and lighting as the reference. ${VERDE}`,
  ticket: `A small floating white queue-ticket stub with two semicircular side notches and a subtle blue dashed perforation line, blank (no text), same soft vinyl material and lighting as the reference. ${VERDE}`,
  balao: `A small floating white rounded speech bubble with three soft blue dots inside, same soft vinyl material and lighting as the reference. ${VERDE}`,
};

async function enviar(arquivo) {
  const b64 = fs.readFileSync(arquivo).toString('base64');
  const r = await fetch(UPLOAD, { method: 'POST', headers: H, body: JSON.stringify({ base64Data: `data:image/png;base64,${b64}`, uploadPath: 'helpy-mascote', fileName: path.basename(arquivo) }) });
  const j = await r.json();
  const url = j?.data?.downloadUrl || j?.data?.fileUrl || j?.data?.url;
  if (!url) throw new Error('upload falhou: ' + JSON.stringify(j));
  return url;
}

async function gerar(prompt, saida, ref) {
  const input = { prompt, aspect_ratio: '1:1', quality: 'high', output_format: 'png', nsfw_checker: false };
  if (ref) input.image_urls = [await enviar(ref)];
  const model = ref ? 'seedream/5-pro-image-to-image' : 'seedream/5-pro-text-to-image';
  const c = await (await fetch(`${API}/api/v1/jobs/createTask`, { method: 'POST', headers: H, body: JSON.stringify({ model, input }) })).json();
  if (c.code !== 200) throw new Error('createTask: ' + JSON.stringify(c));
  for (let espera = 4000; ; espera = Math.min(espera * 1.25, 15000)) {
    await sleep(espera);
    const d = (await (await fetch(`${API}/api/v1/jobs/recordInfo?taskId=${c.data.taskId}`, { headers: H })).json())?.data ?? {};
    if (d.state === 'success') {
      const out = typeof d.resultJson === 'string' ? JSON.parse(d.resultJson) : d.resultJson;
      const url = out?.resultUrls?.[0];
      fs.mkdirSync(SAIDA, { recursive: true });
      fs.writeFileSync(saida, Buffer.from(await (await fetch(url)).arrayBuffer()));
      console.log('ok', path.relative(process.cwd(), saida));
      return saida;
    }
    if (d.state === 'fail') throw new Error(`${path.basename(saida)}: ${d.failMsg ?? JSON.stringify(d)}`);
  }
}

const [cmd, ref] = process.argv.slice(2);
if (cmd === 'conceito') {
  await Promise.all(CONCEITOS.map((p, i) => gerar(`${ESTILO}\n\n${p}`, path.join(SAIDA, `conceito-${i + 1}.png`))));
} else if (cmd === 'camadas' && ref) {
  for (const [nome, p] of Object.entries(CAMADAS)) await gerar(`${ESTILO}\n\n${p}`, path.join(SAIDA, `camada-${nome}.png`), ref);
} else {
  console.error('uso: node scripts/mascote/gerar.mjs conceito | camadas <conceito.png>');
  process.exit(1);
}
