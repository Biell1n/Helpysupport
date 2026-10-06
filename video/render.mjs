// Gera o vídeo de demonstração a partir de video/demo.html.
//
//   1. npm run dev            (em outro terminal)
//   2. node video/render.mjs  (precisa do Playwright e do ffmpeg instalados)
//
// Cada quadro é desenhado com window.__quadro(t) e fotografado; o ffmpeg
// junta tudo em public/videos/helpy-demo.mp4 e .webm, mais um pôster.

import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW || 'playwright');

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SAIDA = path.join(RAIZ, 'public', 'videos');
const URL_DEMO = process.env.DEMO_URL || 'http://localhost:5173/video/demo.html?render=1';
const FPS = Number(process.env.FPS || 30);
const SO_QUADROS = process.env.QUADROS; // ex.: "0,5000,9000" para conferir quadros soltos

const navegador = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const pagina = await navegador.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
await pagina.goto(URL_DEMO, { waitUntil: 'networkidle' });
await pagina.evaluate(() => document.fonts.ready);
await pagina.waitForFunction(() => typeof window.__quadro === 'function');
const duracao = await pagina.evaluate(() => window.__duracao);

if (SO_QUADROS) {
  for (const t of SO_QUADROS.split(',').map(Number)) {
    await pagina.evaluate((x) => window.__quadro(x), t);
    await pagina.screenshot({ path: path.join(process.env.PASTA || '.', `quadro-${t}.png`) });
    console.log('quadro', t);
  }
  await navegador.close();
  process.exit(0);
}

const mp4 = path.join(SAIDA, 'helpy-demo.mp4');
const ffmpeg = spawn('ffmpeg', [
  '-y', '-loglevel', 'error',
  '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-',
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '24', '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
  mp4,
], { stdio: ['pipe', 'inherit', 'inherit'] });

const total = Math.round((duracao / 1000) * FPS);
for (let i = 0; i < total; i++) {
  const t = (i * 1000) / FPS;
  await pagina.evaluate((x) => window.__quadro(x), t);
  const img = await pagina.screenshot({ type: 'jpeg', quality: 92 });
  if (!ffmpeg.stdin.write(img)) await new Promise((r) => ffmpeg.stdin.once('drain', r));
  if (i % (FPS * 5) === 0) console.log(`${Math.round((i / total) * 100)}%`);
}
ffmpeg.stdin.end();
await new Promise((r) => ffmpeg.on('close', r));

// pôster: o quadro de abertura já montado
await pagina.evaluate(() => window.__quadro(2600));
await pagina.screenshot({ path: path.join(SAIDA, 'helpy-demo.jpg'), type: 'jpeg', quality: 85 });
await navegador.close();

// WebM para navegadores sem H.264
await new Promise((r) => spawn('ffmpeg', [
  '-y', '-loglevel', 'error', '-i', mp4,
  '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '38', '-row-mt', '1', '-deadline', 'good', '-cpu-used', '4',
  path.join(SAIDA, 'helpy-demo.webm'),
], { stdio: 'inherit' }).on('close', r));

console.log('pronto:', SAIDA);
