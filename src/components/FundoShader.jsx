import { useEffect, useRef } from 'react';

/*
 * Fundo vivo em WebGL: manchas de luz nos azuis da marca, misturando
 * devagar como seda, e puxadas de leve na direção do mouse. Sem
 * biblioteca: um único shader de tela cheia.
 *
 * Desenha em meia resolução (é tudo desfocado, ninguém vê a diferença),
 * para quando sai da tela ou a aba fica escondida e, com "reduzir
 * movimento", desenha um quadro só. Sem WebGL, fica o gradiente do CSS.
 */

const VERTICE = `
attribute vec2 p;
void main() { gl_Position = vec4(p, 0.0, 1.0); }
`;

const FRAGMENTO = `
precision mediump float;
uniform vec2 r;      // tamanho do canvas
uniform float t;     // tempo em segundos
uniform vec2 m;      // mouse, de -1 a 1 (suavizado)

// ruído suave (value noise) e fbm para a "seda"
float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(h(i), h(i + vec2(1, 0)), u.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int k = 0; k < 4; k++) { v += a * n(p); p = p * 2.03 + 7.1; a *= 0.5; }
  return v;
}

void main() {
  vec2 uv = gl_FragCoord.xy / r;
  vec2 q = uv * vec2(r.x / r.y, 1.0);
  float tt = t * 0.045;

  // distorção do espaço: dá o movimento de tecido
  vec2 w = vec2(fbm(q * 1.6 + tt + m * 0.25), fbm(q * 1.6 - tt + 3.7 - m * 0.2));
  vec2 s = q + (w - 0.5) * 0.9;

  vec3 papel = vec3(0.949, 0.965, 0.980);   // #F2F6FA
  vec3 ceu   = vec3(0.765, 0.847, 0.925);   // #C3D8EC
  vec3 azul  = vec3(0.122, 0.400, 0.957);   // #1F66F4
  vec3 lilas = vec3(0.780, 0.800, 0.980);

  // três manchas que passeiam
  vec2 c1 = vec2(0.35 + 0.18 * sin(tt * 3.1), 0.78 + 0.10 * cos(tt * 2.3)) + m * 0.05;
  vec2 c2 = vec2(0.95 + 0.15 * cos(tt * 2.7), 0.35 + 0.12 * sin(tt * 3.3)) - m * 0.04;
  vec2 c3 = vec2(0.15 + 0.12 * cos(tt * 1.9), 0.18 + 0.10 * sin(tt * 2.1));
  float a1 = smoothstep(0.75, 0.0, distance(s, c1 * vec2(r.x / r.y, 1.0)));
  float a2 = smoothstep(0.65, 0.0, distance(s, c2 * vec2(r.x / r.y, 1.0)));
  float a3 = smoothstep(0.60, 0.0, distance(s, c3 * vec2(r.x / r.y, 1.0)));

  vec3 cor = mix(papel, ceu, 0.55 + 0.35 * (fbm(s * 2.2) - 0.5));
  cor = mix(cor, azul, a1 * 0.42);
  cor = mix(cor, lilas, a2 * 0.55);
  cor = mix(cor, vec3(1.0), a3 * 0.7);
  // brilho fino nas dobras
  cor += 0.06 * smoothstep(0.55, 0.75, fbm(s * 3.0 + tt * 2.0));
  // granulado de papel, bem leve
  cor += (h(gl_FragCoord.xy + fract(t)) - 0.5) * 0.018;
  gl_FragColor = vec4(cor, 1.0);
}
`;

const quieto = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export default function FundoShader({ className = '' }) {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    const gl = canvas?.getContext('webgl', { antialias: false, premultipliedAlpha: false, powerPreference: 'low-power' });
    if (!gl) return undefined;

    const shader = (tipo, src) => {
      const s = gl.createShader(tipo);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (gl.getShaderParameter(s, gl.COMPILE_STATUS)) return s;
      console.warn('[fundo]', gl.getShaderInfoLog(s));
      return null;
    };
    const vs = shader(gl.VERTEX_SHADER, VERTICE);
    const fs = shader(gl.FRAGMENT_SHADER, FRAGMENTO);
    if (!vs || !fs) return undefined;
    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return undefined;
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const uR = gl.getUniformLocation(prog, 'r');
    const uT = gl.getUniformLocation(prog, 't');
    const uM = gl.getUniformLocation(prog, 'm');

    const ESCALA = 0.5;
    const medir = () => {
      const w = Math.max(1, Math.round(canvas.clientWidth * ESCALA));
      const h = Math.max(1, Math.round(canvas.clientHeight * ESCALA));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        gl.viewport(0, 0, w, h);
      }
    };

    let alvo = [0, 0];
    let mouse = [0, 0];
    const mover = (e) => {
      const r = canvas.getBoundingClientRect();
      alvo = [((e.clientX - r.left) / r.width) * 2 - 1, -(((e.clientY - r.top) / r.height) * 2 - 1)];
    };

    const desenhar = (agora) => {
      medir();
      mouse = [mouse[0] + (alvo[0] - mouse[0]) * 0.03, mouse[1] + (alvo[1] - mouse[1]) * 0.03];
      gl.uniform2f(uR, canvas.width, canvas.height);
      gl.uniform1f(uT, agora / 1000 + 40);
      gl.uniform2f(uM, mouse[0], mouse[1]);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      canvas.dataset.pronto = '';
    };

    if (quieto()) {
      desenhar(0);
      const r = () => desenhar(0);
      window.addEventListener('resize', r);
      return () => window.removeEventListener('resize', r);
    }

    let quadro = 0;
    let visivel = true;
    const laco = (agora) => {
      if (visivel && !document.hidden) desenhar(agora);
      quadro = requestAnimationFrame(laco);
    };
    const obs = new IntersectionObserver(([e]) => (visivel = e.isIntersecting));
    obs.observe(canvas);
    window.addEventListener('pointermove', mover, { passive: true });
    quadro = requestAnimationFrame(laco);
    return () => {
      cancelAnimationFrame(quadro);
      obs.disconnect();
      window.removeEventListener('pointermove', mover);
    };
  }, []);

  return <canvas ref={ref} className={`fundo-shader ${className}`} aria-hidden="true" />;
}
