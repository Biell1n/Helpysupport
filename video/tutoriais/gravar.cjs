// node gravar.cjs pagina.html pasta-de-saida  → quadros JPG (30 fps) + eventos.json + duracao.txt
const { chromium } = require('playwright');
const fs = require('fs');
const [, , pagina, saida] = process.argv;
const FPS = 30;
(async () => {
  fs.rmSync(saida, { recursive: true, force: true });
  fs.mkdirSync(`${saida}/f`, { recursive: true });
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  p.on('pageerror', (e) => console.error('ERRO NA PÁGINA', e.message));
  await p.goto('file://' + pagina);
  await p.waitForTimeout(800);
  const dur = await p.evaluate(() => window.DURACAO);
  fs.writeFileSync(`${saida}/eventos.json`, JSON.stringify(await p.evaluate(() => window.EVENTOS)));
  fs.writeFileSync(`${saida}/duracao.txt`, String(dur));
  const n = Math.round(dur * FPS);
  for (let i = 0; i < n; i++) {
    await p.evaluate((t) => window.render(t), i / FPS);
    await p.screenshot({ path: `${saida}/f/${String(i).padStart(5, '0')}.jpg`, type: 'jpeg', quality: 90 });
  }
  console.log('quadros', n, 'duração', dur);
  await b.close();
})();
