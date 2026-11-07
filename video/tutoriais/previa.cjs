// node previa.cjs pagina.html pasta t1 t2 ... → um PNG por instante (simula os quadros anteriores para o cursor)
const { chromium } = require('playwright');
const [, , pagina, pasta, ...ts] = process.argv;
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  p.on('pageerror', (e) => console.error('ERRO', e.message));
  p.on('console', (m) => { if (m.type() === 'error') console.error('CONSOLE', m.text()); });
  await p.goto('file://' + pagina); await p.waitForTimeout(600);
  console.log('duração', await p.evaluate(() => window.DURACAO), 'eventos', await p.evaluate(() => window.EVENTOS.length));
  let ant = 0;
  for (const t of ts.map(Number)) {
    // caminha em passos de 1/10 s até t, como a gravação faria
    for (let x = ant; x < t; x += 0.1) await p.evaluate((v) => window.render(v), x);
    await p.evaluate((v) => window.render(v), t); ant = t;
    await p.screenshot({ path: `${pasta}/p-${t}.png` });
  }
  await b.close();
})();
