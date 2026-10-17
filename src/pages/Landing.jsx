import { lazy, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Lenis from 'lenis';
import { ArrowRight, Check, Cloud, Database, FileSpreadsheet, Link2, Plus, PlugZap, QrCode, X } from 'lucide-react';
import { IconeDoCanal } from '@/components/IconesCanais';
import Logo, { Marca } from '@/components/Logo';
import IntroLogo, { deveMostrarAbertura } from '@/components/IntroLogo';
import SkylineHorarios from '@/components/SkylineHorarios';
import Contador from '@/components/Contador';
import { EMPRESA } from '@/lib/empresa';
import Reveal from '@/components/Reveal';
import { useEfeitosDoMouse } from '@/lib/efeitosDoMouse';
import VideoDemo, { reduzido } from '@/components/VideoDemo';
import { useAuth } from '@/contexts/AuthContext';
import { DIAS_DE_TESTE, PLANS, reais, recursosDoPlano } from '@/lib/plans';
import Perto from '@/components/efeitos/Perto';
import { MARCAS } from '@/components/efeitos/marcas';

// efeitos pesados (WebGL e animações) só carregam quando chegam perto da tela
const LightRays = lazy(() => import('@/components/efeitos/LightRays'));
const DotGrid = lazy(() => import('@/components/efeitos/DotGrid'));
const LineWaves = lazy(() => import('@/components/efeitos/LineWaves'));
const Silk = lazy(() => import('@/components/efeitos/Silk'));
const LogoLoop = lazy(() => import('@/components/efeitos/LogoLoop'));
const RotatingText = lazy(() => import('@/components/efeitos/RotatingText'));
const ScrollVelocity = lazy(() => import('@/components/efeitos/ScrollVelocity').then((m) => ({ default: m.ScrollVelocity ?? m.default })));
const ParedeDeTelas = lazy(() => import('@/components/efeitos/ParedeDeTelas'));

const VENDAS_LP = import.meta.env.VITE_CONTATO_VENDAS;

/** Rolagem suave só na landing; o painel continua com a rolagem nativa. */
function useRolagemSuave() {
  const lenis = useRef(null);
  useEffect(() => {
    if (reduzido()) return;
    const l = new Lenis({ duration: 1.1, easing: (t) => 1 - Math.pow(1 - t, 4), smoothWheel: true });
    lenis.current = l;
    let raf = requestAnimationFrame(function quadro(t) {
      l.raf(t);
      raf = requestAnimationFrame(quadro);
    });
    return () => {
      cancelAnimationFrame(raf);
      l.destroy();
      lenis.current = null;
    };
  }, []);

  // links "#secao" deslizam em vez de pular
  return (e) => {
    const alvo = e.currentTarget.getAttribute('href');
    if (!alvo?.startsWith('#')) return;
    e.preventDefault();
    const el = document.querySelector(alvo);
    if (!el) return;
    if (lenis.current) lenis.current.scrollTo(el, { offset: -80 });
    else el.scrollIntoView({ behavior: reduzido() ? 'auto' : 'smooth' });
  };
}

/**
 * Quanto a seção já rolou, de 0 a 1, escrito em --p.
 * "preso": para seções altas com conteúdo sticky (0 no topo, 1 quando o fim chega).
 * "saida": para uma seção da altura da tela (0 no topo, 1 quando ela sai por cima).
 */
function useProgresso(ref, modo = 'preso') {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reduzido()) {
      el.style.setProperty('--p', '0');
      return;
    }
    let pendente = false;
    const medir = () => {
      pendente = false;
      const r = el.getBoundingClientRect();
      const curso = modo === 'saida' ? Math.max(1, r.height) : Math.max(1, r.height - window.innerHeight);
      const p = Math.min(1, Math.max(0, -r.top / curso));
      el.style.setProperty('--p', p.toFixed(4));
    };
    const pedir = () => {
      if (!pendente) {
        pendente = true;
        requestAnimationFrame(medir);
      }
    };
    medir();
    window.addEventListener('scroll', pedir, { passive: true });
    window.addEventListener('resize', pedir);
    return () => {
      window.removeEventListener('scroll', pedir);
      window.removeEventListener('resize', pedir);
    };
  }, [ref, modo]);
}

/** O mouse mexe as camadas do hero um pouco, para dar profundidade. */
function useParallaxDoMouse(ref) {
  useEffect(() => {
    const el = ref.current;
    if (!el || reduzido() || !window.matchMedia('(hover: hover)').matches) return;
    let raf = 0;
    const mover = (e) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        el.style.setProperty('--mx', (((e.clientX - r.left) / r.width) * 2 - 1).toFixed(3));
        el.style.setProperty('--my', (((e.clientY - r.top) / r.height) * 2 - 1).toFixed(3));
      });
    };
    el.addEventListener('pointermove', mover);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener('pointermove', mover);
    };
  }, [ref]);
}

// ------------------------------------------------------------
// Topo
// ------------------------------------------------------------
function Topo({ user, deslizar }) {
  const [rolou, setRolou] = useState(false);
  useEffect(() => {
    const f = () => setRolou(window.scrollY > 24);
    f();
    window.addEventListener('scroll', f, { passive: true });
    return () => window.removeEventListener('scroll', f);
  }, []);

  return (
    <header className="lp-top" data-rolou={rolou}>
      <div className="lp-in lp-top-in">
        <Link to="/" aria-label="Helpy, início" className="lp-top-marca">
          <Logo size={26} />
        </Link>
        <nav className="lp-nav" aria-label="Principal">
          <a href="#filme" onClick={deslizar}>Como funciona</a>
          <a href="#recursos" onClick={deslizar}>Recursos</a>
          <a href="#dados" onClick={deslizar}>Integrações</a>
          <a href="#planos" onClick={deslizar}>Planos</a>
        </nav>
        <div className="lp-top-acoes">
          {user ? (
            <Link to="/painel" className="lp-btn lp-btn-contorno">Ir para o painel</Link>
          ) : (
            <>
              <Link to="/entrar" className="lp-link">Entrar</Link>
              <Link to="/criar-conta" className="lp-btn lp-btn-contorno">Testar grátis</Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

// ------------------------------------------------------------
// Hero: o título se abre em volta do robô, que acompanha o mouse
// ------------------------------------------------------------
function Hero({ user, deslizar }) {
  const ref = useRef(null);
  useProgresso(ref, 'saida');
  useParallaxDoMouse(ref);

  return (
    <section className="lp-robo" ref={ref}>
      <div className="lp-robo-ceu" aria-hidden="true" />

      <h1 className="lp-robo-titulo" aria-label="Seu atendimento nunca fecha.">
        <span className="lp-robo-a" aria-hidden="true"><span className="lp-entra" style={{ '--d': '0.15s' }}>Seu atendimento</span></span>
        <span className="lp-robo-b" aria-hidden="true"><span className="lp-entra" style={{ '--d': '0.3s' }}>nunca fecha.</span></span>
      </h1>

      <div className="lp-robo-figura">
        <div className="lp-robo-flutua lp-entra" style={{ '--d': '0.2s' }}>
          <img src="/img/robo.webp" alt="O Helpy, um robozinho branco com fones de ouvido, acenando" width="1328" height="1184" />
        </div>
      </div>

      <p className="lp-robo-lado">
        <span className="lp-entra" style={{ '--d': '0.6s' }}>
          Conte como o seu negócio funciona. O Helpy monta um atendente que responde seus clientes, consulta seus preços e chama
          você quando precisa de gente.
        </span>
      </p>

      <div className="lp-robo-acoes lp-entra" style={{ '--d': '0.75s' }}>
        <Link to={user ? '/painel' : '/criar-conta'} className="lp-btn lp-btn-cheio" data-ima="">
          {user ? 'Ir para o painel' : `Testar grátis por ${DIAS_DE_TESTE} dias`} <ArrowRight />
        </Link>
        <a href="#filme" className="lp-btn lp-btn-vidro" onClick={deslizar}>Ver funcionando</a>
      </div>
    </section>
  );
}

/** O vídeo de demonstração: começa como cartão e cresce até a largura da tela ao rolar. */
function Filme() {
  const ref = useRef(null);
  useProgresso(ref);
  return (
    <section id="filme" className="lp-filme" ref={ref}>
      <div className="lp-filme-preso">
        <div className="lp-filme-cab">
          <span className="lp-etiqueta">Como funciona</span>
          <h2 className="lp-h2">Veja o Helpy trabalhando.</h2>
        </div>
        <div className="lp-filme-midia">
          <VideoDemo className="lp-filme-video" />
        </div>
        <div className="lp-filme-passos" aria-hidden="true">
          <span>Conte</span>
          <span>Publique</span>
          <span>Chamados</span>
          <span>Relatórios</span>
          <span>Planos</span>
        </div>
      </div>
    </section>
  );
}

// ------------------------------------------------------------
// Conteúdo
// ------------------------------------------------------------
const PASSOS = [
  {
    titulo: 'Conte do seu jeito',
    texto: 'Escreva como falaria com um funcionário novo, ou cole sua tabela de preços. O Helpy pergunta só o que falta.',
    tela: (
      <div className="lp-mini-chat">
        <span className="eu">Corte R$ 45, barba R$ 35.</span>
        <span className="ele">Anotado! Atendem só com horário?</span>
        <span className="eu">Só com horário.</span>
      </div>
    ),
  },
  {
    titulo: 'Revise o que ele sabe',
    texto: 'Tudo vira um documento que você corrige à mão. O que você não disse fica em branco: nada é inventado.',
    tela: (
      <ul className="lp-mini-doc">
        <li><span>Corte</span><b>R$ 45</b></li>
        <li><span>Barba</span><b>R$ 35</b></li>
        <li><span>Horário</span><b>9h–19h</b></li>
      </ul>
    ),
  },
  {
    titulo: 'Publique o link',
    texto: 'Coloque na bio, no site ou no QR do balcão. A partir daí ele atende, e você acompanha pelo painel.',
    tela: (
      <div className="lp-mini-link">
        <Link2 aria-hidden="true" />
        <span>…/c/barbearia-do-ze</span>
        <b>No ar</b>
      </div>
    ),
  },
];

// cada recurso vem com uma prova pequena do que ele faz, em vez de ícone
const RECURSOS = [
  {
    titulo: 'Responde do jeito da casa',
    texto: 'Vendedor numa loja, recepção numa clínica, professor para alunos. Sem inventar preço nem prazo.',
    prova: <q className="lp-prova-fala">Opa! O degradê sai R$ 45. Quer que eu marque?</q>,
  },
  {
    titulo: 'Marca horários',
    texto: 'Vê os horários livres da sua agenda, confirma com o cliente e deixa marcado.',
    prova: (
      <span className="lp-prova-linha">
        <i className="lp-prova-ok" /> sáb 09:40 · corte · confirmado
      </span>
    ),
  },
  {
    titulo: 'Consulta seus dados',
    texto: 'Preço, estoque, cardápio, status de pedido: ele lê a tabela antes de responder.',
    prova: <span className="lp-prova-linha">estoque › óleo 5W30 › <b>12 un.</b></span>,
  },
  {
    titulo: 'Chama você quando precisa',
    texto: 'Reclamação ou negociação vira chamado numerado, com o resumo do que aconteceu.',
    prova: <span className="lp-prova-senha"><b>Nº 0042</b> aberto 23:15</span>,
  },
  {
    titulo: 'Mostra o que não sabia',
    texto: 'Toda pergunta sem resposta aparece no painel. Você ensina uma vez e pronto.',
    prova: <span className="lp-prova-linha"><b>3</b> perguntas novas · ensinar →</span>,
  },
  {
    titulo: 'Conta o que querem',
    texto: 'Assuntos mais perguntados, horários de pico e a nota de cada atendimento.',
    prova: (
      <span className="lp-prova-barras" aria-hidden="true">
        {[30, 52, 44, 70, 96, 62, 38].map((a, i) => <i key={i} style={{ '--a': `${a}%`, '--i': i }} />)}
      </span>
    ),
  },
];

// x, y em % da área: as mesmas posições das pílulas no CSS (.lp-fonte-N)
const FONTES = [
  { icone: FileSpreadsheet, nome: 'Excel e CSV', x: 50, y: 12 },
  { icone: Cloud, nome: 'OneDrive e SharePoint', x: 88, y: 40 },
  { icone: Link2, nome: 'Google Planilhas', x: 76, y: 84 },
  { icone: Database, nome: 'Banco SQL', x: 24, y: 84 },
  { icone: PlugZap, nome: 'SAP, TOTVS e APIs', x: 12, y: 40 },
];

/** Curva de uma fonte até o centro, puxada um pouco para o lado. */
const CANAIS = [
  { icone: Link2, nome: 'Link e site', x: 50, y: 12 },
  { icone: (p) => <IconeDoCanal.whatsapp {...p} />, nome: 'WhatsApp', x: 88, y: 40, canal: 'whatsapp' },
  { icone: (p) => <IconeDoCanal.instagram {...p} />, nome: 'Instagram', x: 76, y: 84, canal: 'instagram' },
  { icone: (p) => <IconeDoCanal.discord {...p} />, nome: 'Discord', x: 24, y: 84, canal: 'discord' },
  { icone: QrCode, nome: 'QR code', x: 12, y: 40 },
];

function feixe({ x, y }) {
  const mx = (x + 50) / 2 + (50 - y) * 0.18;
  const my = (y + 50) / 2 - (50 - x) * 0.18;
  return `M${x} ${y} Q${mx} ${my} 50 50`;
}


const ASSUNTOS = [
  ['Preço e formas de pagamento', 58],
  ['Horário livre no sábado', 41],
  ['Remarcar horário', 27],
  ['Estacionamento', 19],
];

const SEGMENTOS = ['barbearias', 'lojas', 'clínicas', 'escolas', 'restaurantes', 'oficinas', 'academias', 'pet shops'];

const Marca_ = ({ d }) => <svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor" aria-hidden="true"><path d={d} /></svg>;
const LOGOS = [
  { ...MARCAS.whatsapp, cor: '#25D366' },
  { ...MARCAS.instagram, cor: '#E4405F' },
  { ...MARCAS.discord, cor: '#5865F2' },
  { nome: 'Excel', icone: FileSpreadsheet, cor: '#217346' },
  { ...MARCAS.googlesheets, cor: '#34A853' },
  { nome: 'OneDrive e SharePoint', icone: Cloud, cor: '#0F6CBD' },
  { ...MARCAS.postgresql, cor: '#4169E1' },
  { ...MARCAS.mysql, cor: '#4479A1' },
  { nome: 'SQL Server', icone: Database, cor: '#CC2927' },
  { ...MARCAS.sap, cor: '#0FAAFF' },
  { ...MARCAS.totvs, cor: '#00B2E2' },
  { ...MARCAS.pix, cor: '#32BCAD' },
].map((m) => ({
  title: m.nome,
  hoverColor: m.cor,
  node: m.icone ? <m.icone width="1em" height="1em" aria-hidden="true" /> : <Marca_ d={m.d} />,
}));

const COM_HELPY = [
  'Responde na hora, de madrugada e no fim de semana',
  'Consulta preço e estoque de verdade antes de responder',
  'Marca horário e fecha a venda com link de Pix',
  'O mesmo atendente no site, WhatsApp, Instagram e Discord',
  'Chama você só quando precisa, com o resumo pronto',
  'Mostra o que os clientes mais perguntam',
];
const SEM_HELPY = [
  'O cliente espera até alguém ver a mensagem',
  'Preço e estoque respondidos de cabeça',
  'Horário marcado no papel ou no "vou ver e te falo"',
  'Cada canal com um celular e uma pessoa diferente',
  'Toda conversa depende de alguém da equipe',
  'Ninguém sabe o que os clientes mais perguntam',
];

const TELAS = [
  ['painel', 'Painel com chamados na fila e o que os clientes perguntaram'],
  ['atendimentos', 'Atendimentos: a conversa do cliente e o resumo do chamado'],
  ['relatorios', 'Relatórios: conversas por dia, resolvidas sozinho e nota'],
  ['quadro', 'Quadro de chamados por situação'],
  ['builder', 'Montagem do assistente conversando'],
  ['canais', 'Canais: link, WhatsApp, Instagram e Discord'],
  ['dados', 'Dados: tabela de preços que o assistente consulta'],
  ['agenda', 'Agenda da semana com os horários marcados'],
  ['pedidos', 'Pedidos vendidos pelo chat'],
  ['carteira', 'Carteira com saldo e extrato'],
  ['plano', 'Plano e uso do mês'],
].map(([f, alt]) => ({ src: `/img/telas/${f}.jpg`, alt }));

const FAQ = [
  ['Preciso saber programar?', 'Não. Você conversa, revisa o documento e publica um link. Dá para colocar na bio, no site ou mandar pelo WhatsApp.'],
  ['O que conta como atendimento?', 'Uma conversa de um cliente com o seu atendente, do começo ao fim. Cada plano tem uma cota de atendimentos e um total de mensagens de clientes no mês, que folga para conversas de todos os tamanhos.'],
  ['E quando a cota acaba?', 'O atendente não some: as conversas passam a virar recados e chamados para a sua equipe até a cota renovar, e você recebe um aviso no painel antes de chegar lá.'],
  ['Consigo ligar no meu sistema?', 'Sim. Ele lê planilhas do Excel (inclusive no OneDrive e no SharePoint), Google Planilhas, bancos PostgreSQL, MySQL e SQL Server direto, e sistemas com API REST, como SAP e TOTVS Protheus. Sempre só leitura, e só com a sua autorização.'],
  ['Funciona no WhatsApp?', 'Funciona. Do plano Profissional em diante, o mesmo assistente responde no WhatsApp e no Instagram pela API oficial da Meta (sem chip no celular e sem risco de bloqueio), e o painel mostra o passo a passo para conectar. Em qualquer plano dá para usar o link do chat, o QR code e um bot no Discord.'],
];

export default function Landing() {
  const { user } = useAuth();
  const deslizar = useRolagemSuave();
  useEfeitosDoMouse();
  const pagos = [PLANS.essencial, PLANS.profissional, PLANS.business];
  const destino = user ? '/painel' : '/criar-conta';
  const [abertura, setAbertura] = useState(deveMostrarAbertura);
  const [esperando, setEsperando] = useState(abertura);

  return (
    <div className="lp" data-abertura={esperando ? 'on' : 'off'} data-logo-voando={abertura ? 'sim' : 'nao'}>
      {abertura && <IntroLogo onSaindo={() => setEsperando(false)} onFim={() => setAbertura(false)} />}
      <Topo user={user} deslizar={deslizar} />
      <Hero user={user} deslizar={deslizar} />
      <Filme />

      <section className="lp-faixa" aria-label="Para quem é o Helpy e com o que ele funciona">
        <p className="lp-faixa-frase">
          Feito para{' '}
          <span className="sr-only">{SEGMENTOS.join(', ')}</span>
          <Perto as="span" className="lp-faixa-gira" reserva={<span className="lp-gira-palavra">{SEGMENTOS[0]}</span>}>
            <RotatingText
              texts={SEGMENTOS}
              mainClassName="lp-gira-palavra"
              splitBy="characters"
              staggerDuration={0.02}
              staggerFrom="last"
              rotationInterval={2200}
              transition={{ type: 'spring', damping: 30, stiffness: 400 }}
              initial={{ y: '100%', opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: '-120%', opacity: 0 }}
            />
          </Perto>
        </p>
        <p className="lp-faixa-sub">e conversa com o que você já usa</p>
        <Perto className="lp-faixa-logos" decorativo={false} reserva={<div style={{ height: 40 }} />}>
          <LogoLoop logos={LOGOS} speed={55} logoHeight={26} gap={48} labels="inline" pauseOnHover fadeOut fadeOutWidth={0.14} ariaLabel="Com o que o Helpy funciona" />
        </Perto>
      </section>

      <section id="como" className="lp-sec lp-sec-pontos">
        <Perto className="lp-fundo-efeito">
          <DotGrid dotSize={4} gap={22} baseColor="#cfdaea" activeColor="#1f66f4" proximity={130} shockRadius={260} shockStrength={4} intro={false} fade={0.35} />
        </Perto>
        <div className="lp-in">
          <Reveal className="lp-cab">
            <span className="lp-etiqueta">Como funciona</span>
            <h2 className="lp-h2">Uma tarde para<br />ficar pronto.</h2>
          </Reveal>
          <ol className="lp-passos">
            {PASSOS.map((p, i) => (
              <Reveal as="li" key={p.titulo} atraso={i * 120} className="lp-passo" data-luz="">
                <div className="lp-passo-tela">{p.tela}</div>
                <span className="lp-passo-n">{String(i + 1).padStart(2, '0')}</span>
                <h3>{p.titulo}</h3>
                <p>{p.texto}</p>
              </Reveal>
            ))}
          </ol>
        </div>
      </section>

      <section id="recursos" className="lp-sec lp-sec-24">
        <span className="lp-gigante" aria-hidden="true">24h</span>
        <div className="lp-in">
          <Reveal className="lp-cab">
            <span className="lp-etiqueta">O que ele faz</span>
            <h2 className="lp-h2">Atende a noite toda.<br />Sem robô engessado.</h2>
          </Reveal>
          <ol className="lp-recursos">
            {RECURSOS.map(({ titulo, texto, prova }, i) => (
              <Reveal as="li" key={titulo} atraso={i * 70} className="lp-recurso">
                <span className="lp-recurso-n">{String(i + 1).padStart(2, '0')}</span>
                <h3>{titulo}</h3>
                <p>{texto}</p>
                <div className="lp-recurso-prova">{prova}</div>
              </Reveal>
            ))}
          </ol>
        </div>
      </section>

      <div className="lp-velocidade" aria-hidden="true">
        <Perto reserva={<div style={{ height: 120 }} />}>
          <ScrollVelocity
            texts={['Responde · Marca horário · Vende pelo chat · Consulta o estoque ·', 'Chama a equipe · Atende no WhatsApp · Ensina com o que não sabia ·']}
            velocity={40}
            numCopies={4}
            parallaxClassName="lp-vel-linha"
            scrollerClassName="lp-vel-texto"
          />
        </Perto>
      </div>

      <section className="lp-sec">
        <div className="lp-in lp-chamado">
          <Reveal className="lp-chamado-texto">
            <span className="lp-etiqueta">Chamados</span>
            <h2 className="lp-h2">Quando precisa de gente, chama você.</h2>
            <p className="lp-lead">
              Reclamação, negociação ou um pedido fora do comum vira um chamado com número e resumo do que aconteceu. Você
              assume e responde na mesma conversa.
            </p>
          </Reveal>
          <Reveal className="lp-chamado-arte" atraso={150}>
            <div className="lp-senha">
              <div className="lp-senha-num">
                <small>Senha</small>
                <b>Nº 0042</b>
              </div>
              <div className="lp-senha-corpo">
                <b>Reclamação do serviço</b>
                <span>Aberto às 23:15 · resumo pronto para a equipe</span>
              </div>
            </div>
            <div className="lp-chamado-caixa">
              <small>Resumo do atendente</small>
              <p>Cliente marcou corte sábado às 9h40 e reclamou do corte anterior. Pediu retorno da equipe.</p>
            </div>
          </Reveal>
        </div>
      </section>

      <section id="dados" className="lp-sec lp-sec-ondas">
        <Perto className="lp-fundo-efeito lp-fundo-ondas">
          <LineWaves color1="#1f66f4" color2="#7fb0ff" color3="#b9d0ff" lightMode intro={false} speed={0.22} lineCount={60} glow={0.4} brightness={0.85} rotation={-28} enableMouseInteraction mouseInfluence={1.4} edgeFade={0.25} />
        </Perto>
        <div className="lp-in lp-duas">
          <Reveal>
            <span className="lp-etiqueta">Integrações</span>
            <h2 className="lp-h2">Lê o que você já usa.</h2>
            <p className="lp-lead">
              O atendente responde com o dado de agora. Suba uma planilha, ligue uma planilha online ou conecte o seu sistema: ele
              consulta na hora de responder.
            </p>
          </Reveal>
          <Reveal className="lp-fontes" atraso={120}>
            <svg className="lp-feixes" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              {FONTES.map((f, i) => (
                <g key={f.nome}>
                  <path d={feixe(f)} className="lp-feixe-base" />
                  <path d={feixe(f)} className="lp-feixe-luz" pathLength="1" style={{ '--i': i }} />
                </g>
              ))}
            </svg>
            <span className="lp-fontes-centro"><Marca size={52} /></span>
            {FONTES.map(({ icone: Icone, nome }, i) => (
              <span key={nome} className={`lp-fonte lp-fonte-${i + 1}`}>
                <Icone aria-hidden="true" /> {nome}
              </span>
            ))}
          </Reveal>
        </div>
      </section>

      <section id="canais" className="lp-sec">
        <div className="lp-in lp-duas lp-duas-inverte">
          <Reveal className="lp-fontes lp-canais" atraso={120}>
            <svg className="lp-feixes" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              {CANAIS.map((f, i) => (
                <g key={f.nome}>
                  <path d={feixe(f)} className="lp-feixe-base" />
                  <path d={feixe(f)} className="lp-feixe-luz lp-feixe-sai" pathLength="1" style={{ '--i': i }} />
                </g>
              ))}
            </svg>
            <span className="lp-fontes-centro"><Marca size={52} /></span>
            {CANAIS.map(({ icone: Icone, nome, canal }, i) => (
              <span key={nome} className={`lp-fonte lp-fonte-${i + 1}${canal ? ` canal-${canal}` : ''}`}>
                <Icone aria-hidden="true" width={18} height={18} /> {nome}
              </span>
            ))}
          </Reveal>
          <Reveal>
            <span className="lp-etiqueta">Canais</span>
            <h2 className="lp-h2">Um assistente, todos os canais.</h2>
            <p className="lp-lead">
              O mesmo atendente responde no link do chat, no WhatsApp, no Instagram e no Discord. Preços, regras e agenda são os
              mesmos em todo lugar, e as conversas caem todas no mesmo painel.
            </p>
          </Reveal>
        </div>
      </section>

      <section className="lp-sec">
        <div className="lp-in lp-duas lp-duas-inverte">
          <Reveal className="lp-relatorio" aria-label="Exemplo de relatório: horários de pico e assuntos mais perguntados">
            <div className="lp-relatorio-cab">
              <b>Horários de pico</b>
              <span>Últimos 30 dias</span>
            </div>
            <SkylineHorarios />
            <div className="lp-relatorio-cab lp-relatorio-sub">
              <b>Assuntos mais perguntados</b>
            </div>
            <ul>
              {ASSUNTOS.map(([a, n], i) => (
                <li key={a} style={{ '--i': i, '--w': n / ASSUNTOS[0][1] }}>
                  <span>{a}</span>
                  <b><Contador valor={n} atraso={i * 120} /></b>
                  <i aria-hidden="true" />
                </li>
              ))}
            </ul>
          </Reveal>
          <Reveal atraso={120}>
            <span className="lp-etiqueta">Relatórios</span>
            <h2 className="lp-h2">Saiba o que seus clientes querem.</h2>
            <p className="lp-lead">
              A IA agrupa as perguntas por assunto. Junto vêm os horários de pico, quanto ele resolveu sozinho e a nota que os
              clientes deram.
            </p>
          </Reveal>
        </div>
      </section>

      <section className="lp-sec lp-sec-telas">
        <div className="lp-in">
          <Reveal className="lp-cab lp-cab-centro">
            <span className="lp-etiqueta">O painel</span>
            <h2 className="lp-h2">Tudo num lugar só.</h2>
            <p className="lp-lead">Chamados, agenda, pedidos, carteira e relatórios: as telas de verdade do Helpy, com dados de exemplo.</p>
          </Reveal>
        </div>
        <Perto className="lp-telas" reserva={<div className="parede" />}>
          <ParedeDeTelas telas={TELAS} />
        </Perto>
      </section>

      <section className="lp-sec">
        <div className="lp-in">
          <Reveal className="lp-cab lp-cab-centro">
            <span className="lp-etiqueta">Por que o Helpy</span>
            <h2 className="lp-h2">O mesmo atendimento,<br />sem depender de alguém online.</h2>
          </Reveal>
          <div className="lp-compara">
            <Reveal as="article" className="lp-compara-col lp-compara-sim" data-luz="">
              <div className="lp-compara-cab">
                <Marca size={26} />
                <b>Com o Helpy</b>
                <span className="lp-plano-tag">Recomendado</span>
              </div>
              <ul>
                {COM_HELPY.map((t) => <li key={t}><span className="lp-compara-ico"><Check aria-hidden="true" /></span>{t}</li>)}
              </ul>
              <Link to={destino} className="lp-btn lp-btn-cheio lp-btn-bloco">Testar grátis por {DIAS_DE_TESTE} dias <ArrowRight /></Link>
            </Reveal>
            <Reveal as="article" atraso={120} className="lp-compara-col lp-compara-nao">
              <div className="lp-compara-cab">
                <b>Do jeito de sempre</b>
              </div>
              <ul>
                {SEM_HELPY.map((t) => <li key={t}><span className="lp-compara-ico"><X aria-hidden="true" /></span>{t}</li>)}
              </ul>
            </Reveal>
          </div>
        </div>
      </section>

      <section id="planos" className="lp-sec">
        <div className="lp-in">
          <Reveal className="lp-cab lp-cab-centro">
            <span className="lp-etiqueta">Planos</span>
            <h2 className="lp-h2">Um preço fixo por mês,<br />sem surpresa na fatura.</h2>
            <p className="lp-lead">Todos começam com {DIAS_DE_TESTE} dias grátis, sem cartão. Preço de lançamento: quem assina agora mantém.</p>
          </Reveal>
          <div className="lp-planos">
            {pagos.map((p, i) => (
              <Reveal as="article" key={p.id} atraso={i * 100} className={`lp-plano${p.destaque ? ' lp-plano-destaque' : ''}`} data-luz="">
                {p.destaque && (
                  <Perto className="lp-plano-seda">
                    <Silk color="#173a80" sheenColor="#9ec0ff" speed={3} scale={1.1} noiseIntensity={0.9} sheen={0.45} glow={0.25} intro={false} />
                  </Perto>
                )}
                <div className="lp-plano-topo">
                  <h3>{p.nome}</h3>
                  {p.destaque && <span className="lp-plano-tag">Mais escolhido</span>}
                </div>
                <p className="lp-preco">
                  {p.precoCheio && <s className="lp-preco-cheio">{reais(p.precoCheio)}</s>}
                  {reais(p.preco)}<small>/mês</small>
                </p>
                <ul>
                  {recursosDoPlano(p).map((r) => <li key={r}>{r}</li>)}
                </ul>
                <Link to="/criar-conta" className={`lp-btn lp-btn-bloco ${p.destaque ? 'lp-btn-claro' : 'lp-btn-cheio'}`}>
                  Começar o teste
                </Link>
              </Reveal>
            ))}
          </div>
          <p className="lp-nota">Precisa de algo do tamanho da sua empresa? {VENDAS_LP ? <a href={VENDAS_LP.startsWith('mailto:') ? `${VENDAS_LP}?subject=${encodeURIComponent('Plano personalizado do Helpy')}` : VENDAS_LP} target="_blank" rel="noreferrer">Fale com a gente sobre um plano personalizado.</a> : 'Fale com a gente sobre um plano personalizado.'}</p>
        </div>
      </section>

      <section id="perguntas" className="lp-sec">
        <div className="lp-in lp-duas">
          <Reveal>
            <span className="lp-etiqueta">Perguntas</span>
            <h2 className="lp-h2">O que perguntam pra gente.</h2>
          </Reveal>
          <div className="lp-faq">
            {FAQ.map(([p, r], i) => (
              <Reveal as="details" key={p} atraso={i * 60}>
                <summary>
                  {p}
                  <Plus aria-hidden="true" />
                </summary>
                <p>{r}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="lp-sec lp-sec-final">
        <div className="lp-in">
          <Reveal className="lp-final">
            <Perto className="lp-final-raios">
              <LightRays raysColor="#9ec0ff" raysOrigin="top-center" lightSpread={0.9} rayLength={2.4} raysSpeed={0.8} glow={0.7} haze={0.3} followMouse mouseInfluence={0.08} intro={false} />
            </Perto>
            <h2>Teste grátis<br />por {DIAS_DE_TESTE} dias.</h2>
            <p>Em uma tarde o seu atendente está no ar. Sem cartão para testar.</p>
            <Link to={destino} className="lp-btn lp-btn-claro" data-ima="">
              {user ? 'Ir para o painel' : 'Criar meu atendente'} <ArrowRight />
            </Link>
          </Reveal>
        </div>
      </section>

      <footer className="lp-foot">
        <div className="lp-in lp-foot-in">
          <Logo size={22} />
          <nav aria-label="Rodapé">
            <a href="#como" onClick={deslizar}>Como funciona</a>
            <a href="#planos" onClick={deslizar}>Planos</a>
            <Link to="/termos">Termos</Link>
            <Link to="/privacidade">Privacidade</Link>
          </nav>
          <span>
            © {new Date().getFullYear()} {EMPRESA.marca} · {EMPRESA.responsavel} · {EMPRESA.documento} · {EMPRESA.cidade}/{EMPRESA.uf}
          </span>
        </div>
      </footer>
    </div>
  );
}
