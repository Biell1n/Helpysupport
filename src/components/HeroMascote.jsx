import { useEffect, useRef, useState } from 'react';
import { OLHOS, senha } from '@/components/marcaDesenho';
import { IconeDoCanal } from '@/components/IconesCanais';
import { Link2 } from 'lucide-react';

const CORPO = senha();
const quieto = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * Mensagens chegando por todos os canais. Cada uma aparece num ponto em
 * volta do mascote; ele olha para ela e ela fica respondida.
 */
const MENSAGENS = [
  {
    canal: 'whatsapp',
    nome: 'WhatsApp',
    texto: 'Vocês abrem sábado?',
    lugar: 'a',
  },
  {
    canal: 'instagram',
    nome: 'Instagram',
    texto: 'Tem o 42 em preto?',
    lugar: 'b',
  },
  {
    canal: 'site',
    nome: 'Site',
    texto: 'Quero remarcar para as 15h',
    lugar: 'c',
  },
  {
    canal: 'discord',
    nome: 'Discord',
    texto: '/helpy qual o prazo de entrega?',
    lugar: 'd',
  },
  { canal: 'whatsapp', nome: 'WhatsApp', texto: 'Aceita Pix?', lugar: 'b' },
  {
    canal: 'site',
    nome: 'Site',
    texto: 'Quanto fica o corte + barba?',
    lugar: 'a',
  },
  {
    canal: 'instagram',
    nome: 'Instagram',
    texto: 'Entrega em Campinas?',
    lugar: 'd',
  },
  {
    canal: 'discord',
    nome: 'Discord',
    texto: '/helpy o evento começa que horas?',
    lugar: 'c',
  },
];

const CADA = 2300; // ms entre uma mensagem e a próxima
const VIVE = 5600; // quanto tempo cada uma fica na tela
const DIGITA = 650; // os três pontinhos antes do texto
const RESPONDE = 1500; // quando aparece o "respondido"

function Icone({ canal }) {
  if (canal === 'site') return <Link2 width={14} height={14} strokeWidth={2} aria-hidden="true" />;
  const I = IconeDoCanal[canal];
  return <I width={14} height={14} aria-hidden="true" />;
}

/**
 * O mascote do Helpy: a própria marca, grande. Os olhos seguem o mouse (ou
 * o dedo), piscam de vez em quando e correm para cada mensagem nova.
 */
export default function HeroMascote() {
  const caixa = useRef(null);
  const corpo = useRef(null);
  const olhos = useRef([]);
  const chips = useRef({});
  const [visiveis, setVisiveis] = useState([]); // { id, i, nasceu }
  const alvoChip = useRef(null); // { el, ate }
  const pulo = useRef(null);
  const feliz = useRef(-1e9); // quando respondeu: os olhos sorriem por um instante

  // sequência das mensagens
  useEffect(() => {
    if (quieto()) {
      setVisiveis([0, 1, 2, 3].map((i) => ({ id: i, i, nasceu: -1e9 })));
      return undefined;
    }
    let n = 0;
    let vivo = true;
    const timers = [];
    const proxima = () => {
      if (!vivo) return;
      const id = n++;
      const i = id % MENSAGENS.length;
      setVisiveis((v) => [...v.filter((x) => performance.now() - x.nasceu < VIVE), { id, i, nasceu: performance.now() }]);
      // o olhar corre para a mensagem nova assim que ela aparece
      timers.push(
        setTimeout(() => {
          const el = chips.current[id];
          if (el) alvoChip.current = { el, ate: performance.now() + 1300 };
          // um pulinho de quem percebeu: sobe, estica e assenta
          pulo.current?.animate(
            [
              { transform: 'translateY(0) scale(1, 1)' },
              {
                transform: 'translateY(-10px) scale(0.97, 1.04)',
                offset: 0.35,
              },
              { transform: 'translateY(0) scale(1.03, 0.97)', offset: 0.7 },
              { transform: 'translateY(0) scale(1, 1)' },
            ],
            { duration: 520, easing: 'cubic-bezier(.3,.7,.2,1)' },
          );
        }, 60),
      );
      timers.push(setTimeout(() => (feliz.current = performance.now()), RESPONDE));
      timers.push(setTimeout(proxima, CADA));
    };
    timers.push(setTimeout(proxima, 900));
    const limpa = setInterval(() => setVisiveis((v) => v.filter((x) => performance.now() - x.nasceu < VIVE)), 600);
    return () => {
      vivo = false;
      timers.forEach(clearTimeout);
      clearInterval(limpa);
    };
  }, []);

  // olhar, piscada e corpo
  useEffect(() => {
    const svg = caixa.current;
    if (!svg || quieto()) return undefined;
    let mouse = null;
    let atual = { x: 0, y: 0 };
    let incl = 0;
    let piscando = -1e9;
    let proxPiscada = performance.now() + 2200;
    let quadro = 0;

    const mover = (e) => {
      mouse = { x: e.clientX, y: e.clientY, t: performance.now() };
    };

    const direcao = (px, py) => {
      const r = svg.getBoundingClientRect();
      const dx = px - (r.left + r.width / 2);
      const dy = py - (r.top + r.height * 0.46);
      const dist = Math.hypot(dx, dy) || 1;
      const forca = Math.min(1, dist / (r.width * 0.9));
      return { x: (dx / dist) * 11 * forca, y: (dy / dist) * 8 * forca };
    };

    const passo = (agora) => {
      let alvo = { x: 0, y: 0 };
      let rapido = false;
      const c = alvoChip.current;
      if (c && agora < c.ate && c.el.isConnected) {
        const r = c.el.getBoundingClientRect();
        alvo = direcao(r.left + r.width / 2, r.top + r.height / 2);
        rapido = true;
      } else if (mouse && agora - mouse.t < 6000) {
        alvo = direcao(mouse.x, mouse.y);
      } else {
        // sem ninguém mexendo: olha em volta devagar
        alvo = {
          x: Math.sin(agora / 2100) * 6,
          y: Math.sin(agora / 1700) * 2.5,
        };
      }
      // movimento sacádico: o olho "pula" para a mensagem e segue o mouse com calma
      const k = rapido ? 0.3 : 0.12;
      atual = {
        x: atual.x + (alvo.x - atual.x) * k,
        y: atual.y + (alvo.y - atual.y) * k,
      };
      incl += (atual.x * 0.18 - incl) * 0.08;

      if (agora > proxPiscada) {
        piscando = agora;
        // às vezes pisca duas vezes seguidas
        proxPiscada = agora + (Math.random() < 0.2 ? 260 : 2800 + Math.random() * 3600);
      }
      const p = (agora - piscando) / 170;
      // sorriso: os olhos achatam de leve por meio segundo depois de responder
      const q = (agora - feliz.current) / 520;
      const sorri = q >= 0 && q <= 1 ? Math.sin(Math.PI * q) * 0.42 : 0;
      const fecha = Math.max(p >= 0 && p <= 1 ? Math.sin(Math.PI * p) : 0, sorri);
      olhos.current.forEach((el, i) => {
        if (!el) return;
        const o = OLHOS[i];
        const h = o.h * (1 - 0.88 * fecha);
        el.setAttribute('x', o.cx - o.w / 2 + atual.x);
        el.setAttribute('y', o.cy - h / 2 + atual.y + fecha * 3);
        el.setAttribute('height', h);
      });
      if (corpo.current) {
        corpo.current.style.transform = `translate(${atual.x * 0.35}px, ${atual.y * 0.25}px) rotate(${incl}deg)`;
      }
      quadro = requestAnimationFrame(passo);
    };

    window.addEventListener('pointermove', mover, { passive: true });
    window.addEventListener('pointerdown', mover, { passive: true });
    quadro = requestAnimationFrame(passo);
    return () => {
      window.removeEventListener('pointermove', mover);
      window.removeEventListener('pointerdown', mover);
      cancelAnimationFrame(quadro);
    };
  }, []);

  return (
    <div className="mascote">
      <div className="mascote-sombra" aria-hidden="true" />
      <div className="mascote-flutua">
        <div ref={pulo} className="mascote-pulo">
          <svg
            ref={caixa}
            className="mascote-svg"
            viewBox="0 0 200 200"
            role="img"
            aria-label="O Helpy: um balão de conversa azul com dois olhinhos"
          >
            <defs>
              <linearGradient id="mascote-luz" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#3a7bff" />
                <stop offset="0.55" stopColor="#1f66f4" />
                <stop offset="1" stopColor="#1857d8" />
              </linearGradient>
            </defs>
            <g
              ref={corpo}
              style={{
                transformOrigin: '100px 120px',
                transformBox: 'view-box',
              }}
            >
              <path d={CORPO} fill="url(#mascote-luz)" />
              {OLHOS.map((o, i) => (
                <rect
                  key={o.cx}
                  ref={(el) => (olhos.current[i] = el)}
                  x={o.cx - o.w / 2}
                  y={o.cy - o.h / 2}
                  width={o.w}
                  height={o.h}
                  rx={o.w / 2}
                  fill="#fff"
                />
              ))}
            </g>
          </svg>
        </div>
      </div>

      <ul className="mascote-msgs" aria-label="Mensagens chegando por vários canais">
        {visiveis.map(({ id, i, nasceu }) => {
          const m = MENSAGENS[i];
          return (
            <li
              key={id}
              ref={(el) => (chips.current[id] = el)}
              className={`mascote-msg mascote-${m.lugar} canal-${m.canal === 'site' ? 'link' : m.canal}`}
              style={{
                '--vive': `${VIVE}ms`,
                '--digita': `${DIGITA}ms`,
                '--responde': `${RESPONDE}ms`,
              }}
              data-estatico={nasceu < 0 ? '' : undefined}
            >
              <span className="mascote-msg-canal">
                <Icone canal={m.canal} /> {m.nome}
              </span>
              <span className="mascote-msg-texto">
                <span className="mascote-msg-pontos" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>
                <span className="mascote-msg-frase">{m.texto}</span>
              </span>
              <span className="mascote-msg-ok">respondido</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
