import { useEffect, useRef, useState } from 'react';
import { useNaTela } from '@/components/Reveal';

const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const HORAS = Array.from({ length: 16 }, (_, i) => i + 7); // 7h às 22h

/** Conversas por dia e hora de um mês de exemplo: picos no almoço e à noite, sábado cheio de manhã. */
function exemplo() {
  return DIAS.map((_, d) =>
    HORAS.map((h) => {
      const almoco = Math.exp(-((h - 12) ** 2) / 3);
      const noite = Math.exp(-((h - 20) ** 2) / 2.5) * 1.15;
      const manha = d === 6 ? Math.exp(-((h - 9.5) ** 2) / 2.2) * 1.4 : 0;
      const peso = d === 0 ? 0.35 : d === 6 ? 0.8 : 0.75 + d * 0.04;
      const ruido = ((d * 31 + h * 17) % 7) / 28;
      return Math.round((0.12 + almoco + noite + manha + ruido) * peso * 14);
    }),
  );
}

// azul em degraus, do céu claro ao azul da senha
const RAMPA = ['#dbe8f4', '#b9d1ee', '#8fb4ec', '#5f93ef', '#3577f2', '#1f66f4', '#154fc4'];

function cor(v, max) {
  return RAMPA[Math.min(RAMPA.length - 1, Math.floor((v / max) * (RAMPA.length - 0.01)))];
}

function escurecer(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const c = (s) => Math.round(((n >> s) & 255) * f);
  return `rgb(${c(16)}, ${c(8)}, ${c(0)})`;
}

/**
 * Horários de pico como uma cidade vista de cima, em perspectiva isométrica:
 * cada prédio é uma hora de um dia da semana, mais alto quanto mais conversas.
 */
export default function SkylineHorarios() {
  const [ref, visto] = useNaTela({ threshold: 0.3 });
  const canvas = useRef(null);
  const geo = useRef(null);
  const [dica, setDica] = useState(null);
  const dados = useRef(exemplo());

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const valores = dados.current;
    const max = Math.max(...valores.flat());
    let raf;
    let inicio;

    const desenhar = (prog) => {
      const larg = el.clientWidth;
      const dpr = window.devicePixelRatio || 1;
      const nH = HORAS.length;
      const nD = DIAS.length;
      const w = (2 * larg) / (nH + nD); // largura do losango de cada célula
      const alturaMax = w * 2.3;
      // espaço em cima só o que o prédio mais alto do fundo precisa
      let folga = 0;
      valores.forEach((linha, d) => linha.forEach((v, h) => {
        folga = Math.max(folga, (v / max) * alturaMax - (h + d) * (w / 4));
      }));
      const alt = (nH + nD) * (w / 4) + folga + 12;
      el.width = Math.round(larg * dpr);
      el.height = Math.round(alt * dpr);
      el.style.height = `${alt}px`;
      const ctx = el.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, larg, alt);

      const x0 = nD * (w / 2);
      const y0 = folga + 4;
      geo.current = { w, x0, y0, nH, nD };
      const ponto = (h, d) => [x0 + (h - d) * (w / 2), y0 + (h + d) * (w / 4)];

      // de trás para a frente, para os prédios da frente cobrirem os de trás
      const ordem = [];
      for (let d = 0; d < nD; d++) for (let h = 0; h < nH; h++) ordem.push([h, d]);
      ordem.sort((a, b) => a[0] + a[1] - (b[0] + b[1]));

      for (const [h, d] of ordem) {
        const v = valores[d][h];
        const atraso = (h + d) / (nH + nD);
        const p = Math.max(0, Math.min(1, (prog - atraso * 0.5) / 0.5));
        const subida = 1 - (1 - p) ** 3;
        const z = Math.max(1.5, (v / max) * alturaMax * subida);
        const [cx, cy] = ponto(h, d);
        const g = 1.2; // respiro entre prédios
        const top = [
          [cx, cy - z + g],
          [cx + w / 2 - g, cy + w / 4 - z],
          [cx, cy + w / 2 - z - g],
          [cx - w / 2 + g, cy + w / 4 - z],
        ];
        const base = cor(v, max);
        const face = (pts, fill) => {
          ctx.beginPath();
          pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
          ctx.closePath();
          ctx.fillStyle = fill;
          ctx.fill();
        };
        // lado esquerdo e direito, depois o teto
        face([top[3], top[2], [top[2][0], top[2][1] + z], [top[3][0], top[3][1] + z]], escurecer(base, 0.86));
        face([top[2], top[1], [top[1][0], top[1][1] + z], [top[2][0], top[2][1] + z]], escurecer(base, 0.72));
        face(top, base);
      }
    };

    const anima = (t) => {
      if (!inicio) inicio = t;
      const prog = Math.min(1, (t - inicio) / 1400);
      desenhar(prog * 1.5);
      if (prog < 1) raf = requestAnimationFrame(anima);
    };

    const reduzir = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (!visto) desenhar(0);
    else if (reduzir) desenhar(2);
    else raf = requestAnimationFrame(anima);

    const ro = new ResizeObserver(() => {
      if (!raf || inicio) desenhar(visto ? 2 : 0);
    });
    ro.observe(el);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [visto]);

  // passa o mouse: acha a célula pelo chão do losango
  const mover = (e) => {
    const g = geo.current;
    if (!g) return;
    const r = canvas.current.getBoundingClientRect();
    const x = e.clientX - r.left - g.x0;
    const y = e.clientY - r.top - g.y0;
    const a = x / (g.w / 2);
    const b = y / (g.w / 4);
    const h = Math.floor((a + b) / 2);
    const d = Math.floor((b - a) / 2);
    if (h < 0 || d < 0 || h >= g.nH || d >= g.nD) return setDica(null);
    setDica({ x: e.clientX - r.left, y: e.clientY - r.top, texto: `${DIAS[d]}, ${HORAS[h]}h`, n: dados.current[d][h] });
  };

  return (
    <div className="skyline" ref={ref}>
      <canvas
        ref={canvas}
        className="skyline-canvas"
        role="img"
        aria-label="Exemplo de horários de pico: mais conversas no almoço, à noite e no sábado de manhã."
        onPointerMove={mover}
        onPointerLeave={() => setDica(null)}
      />
      {dica && (
        <span className="skyline-dica" style={{ left: dica.x, top: dica.y }}>
          <b>{dica.n}</b> conversas · {dica.texto}
        </span>
      )}
      <div className="skyline-legenda" aria-hidden="true">
        <span>menos</span>
        {RAMPA.map((c) => <i key={c} style={{ background: c }} />)}
        <span>mais</span>
      </div>
    </div>
  );
}
