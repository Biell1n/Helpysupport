import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Download, Printer } from 'lucide-react';
import { Modal } from '@/components/Modal';
import { balaoEm, CONTORNO, CORES, OLHOS_CONTORNO } from '@/components/marcaDesenho';

/** O balãozinho do Helpy no meio do QR (o código aguenta até ~30% coberto com correção "H"). */
function marcaNoMeio(tam) {
  const lado = tam * 0.22;
  const x0 = (tam - lado) / 2;
  const esc = lado / 200;
  const { x, s, rc, traco } = CONTORNO;
  const olhos = OLHOS_CONTORNO.map((o) => `<rect x="${o.cx - o.w / 2}" y="${o.cy - o.h / 2}" width="${o.w}" height="${o.h}" rx="${o.w / 2}" fill="${CORES.azul}"/>`).join('');
  return (
    `<rect x="${x0 - lado * 0.08}" y="${x0 - lado * 0.08}" width="${lado * 1.16}" height="${lado * 1.16}" rx="${lado * 0.28}" fill="#fff"/>` +
    `<g transform="translate(${x0} ${x0}) scale(${esc})"><path d="${balaoEm(x, s, rc)}" fill="none" stroke="${CORES.azul}" stroke-width="${traco}"/>${olhos}</g>`
  );
}

/** SVG do QR com a marca no meio, em unidades de "tam" px. */
async function qrSvg(link, tam = 1000) {
  const base = await QRCode.toString(link, {
    type: 'svg', errorCorrectionLevel: 'H', margin: 2, width: tam, color: { dark: CORES.marinho, light: '#ffffff' },
  });
  // o qrcode gera viewBox pequeno; a marca entra na mesma escala dele
  const vb = base.match(/viewBox="0 0 (\d+) (\d+)"/);
  const n = vb ? Number(vb[1]) : tam;
  return base.replace('</svg>', `${marcaNoMeio(n)}</svg>`);
}

const baixar = (url, nome) => {
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
};

const nomeDoArquivo = (nome) => `qr-${(nome || 'assistente').toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;

/** Desenha o cartaz (para imprimir ou baixar): título, QR e instrução. */
async function cartazPng(link, nome) {
  const svg = await qrSvg(link, 1000);
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await img.decode();
  const W = 1200, H = 1600;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, W, H);
  g.fillStyle = CORES.marinho;
  g.textAlign = 'center';
  g.font = '700 64px system-ui, -apple-system, "Segoe UI", sans-serif';
  g.fillText('Fale com a gente', W / 2, 190);
  g.font = '500 44px system-ui, -apple-system, "Segoe UI", sans-serif';
  g.fillStyle = CORES.azul;
  g.fillText(nome || 'Atendimento', W / 2, 260);
  g.drawImage(img, 150, 340, 900, 900);
  g.fillStyle = '#5b6878';
  g.font = '400 38px system-ui, -apple-system, "Segoe UI", sans-serif';
  g.fillText('Aponte a câmera do celular para o código', W / 2, 1340);
  g.fillText('e converse na hora, 24 horas por dia.', W / 2, 1395);
  return c.toDataURL('image/png');
}

/** Janela com o QR code do link do assistente: baixar em PNG/SVG ou imprimir um cartaz. */
export default function QrAssistente({ assistente, link, onFechar }) {
  const [svg, setSvg] = useState('');

  useEffect(() => {
    if (!link) return undefined;
    let vivo = true;
    qrSvg(link, 600).then((s) => vivo && setSvg(s));
    return () => {
      vivo = false;
    };
  }, [link]);

  const baixarPng = async () => {
    // só o código, grande, para usar em arte própria
    const img = new Image();
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(await qrSvg(link, 1200))}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = 1200;
    c.height = 1200;
    c.getContext('2d').drawImage(img, 0, 0, 1200, 1200);
    baixar(c.toDataURL('image/png'), `${nomeDoArquivo(assistente?.name)}.png`);
  };

  const baixarSvg = async () => {
    const url = URL.createObjectURL(new Blob([await qrSvg(link, 1000)], { type: 'image/svg+xml' }));
    baixar(url, `${nomeDoArquivo(assistente?.name)}.svg`);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  const baixarCartaz = async () => baixar(await cartazPng(link, assistente?.name), `${nomeDoArquivo(assistente?.name)}-cartaz.png`);

  const imprimir = async () => {
    // abre a janela já no clique (senão o navegador bloqueia) e depois coloca o cartaz
    const w = window.open('', '_blank', 'width=700,height=900');
    if (!w) return;
    const png = await cartazPng(link, assistente?.name);
    w.document.write(
      '<!doctype html><title>QR code</title><style>@page{margin:12mm}body{margin:0;display:grid;place-items:center;min-height:100vh}img{width:100%;max-width:150mm}</style>',
    );
    const img = w.document.createElement('img');
    img.onload = () => setTimeout(() => w.print(), 150);
    img.src = png;
    w.document.body.appendChild(img);
    w.document.close();
  };

  return (
    <Modal aberto={!!assistente} onFechar={onFechar} largura={460}>
      <h2>QR code de {assistente?.name}</h2>
      <p className="muted" style={{ marginBottom: 14 }}>
        Imprima no balcão, na vitrine, no cardápio ou no cartão de visita. Quem apontar a câmera do celular cai direto na conversa.
      </p>
      <div className="qr-caixa" aria-label="QR code do link do assistente" role="img" dangerouslySetInnerHTML={{ __html: svg }} />
      <code className="mono faint qr-link">{link}</code>
      <div className="row row-wrap" style={{ marginTop: 14 }}>
        <button type="button" className="btn btn-primary btn-sm" onClick={imprimir} disabled={!svg}><Printer /> Imprimir cartaz</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={baixarCartaz} disabled={!svg}><Download /> Cartaz (PNG)</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={baixarPng} disabled={!svg}><Download /> Só o código (PNG)</button>
        <button type="button" className="btn btn-quiet btn-sm" onClick={baixarSvg} disabled={!svg}><Download /> SVG</button>
      </div>
    </Modal>
  );
}
