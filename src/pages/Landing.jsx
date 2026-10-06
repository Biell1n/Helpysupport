import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Lenis from 'lenis';
import {
  ArrowRight, CalendarCheck, ChartColumn, Database, FileSpreadsheet, Link2, MessageSquareText, Plus, PlugZap, Sparkles, Ticket,
} from 'lucide-react';
import Logo, { Marca } from '@/components/Logo';
import Reveal from '@/components/Reveal';
import VideoDemo, { reduzido } from '@/components/VideoDemo';
import { useAuth } from '@/contexts/AuthContext';
import { PLANS, reais } from '@/lib/plans';

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
// Hero: o título se abre em volta do vídeo, e o vídeo cresce ao rolar
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
        <span className="lp-ponto lp-ponto-a"><i /><b>Responde às 23h</b></span>
        <span className="lp-ponto lp-ponto-b"><i /><b>Marca na sua agenda</b></span>
        <span className="lp-ponto lp-ponto-c"><i /><b>Chama você quando precisa</b></span>
      </div>

      <p className="lp-robo-lado">
        <span className="lp-entra" style={{ '--d': '0.6s' }}>
          Conte como o seu negócio funciona. O Helpy monta um atendente que responde seus clientes, consulta seus preços e chama
          você quando precisa de gente.
        </span>
      </p>

      <div className="lp-robo-acoes lp-entra" style={{ '--d': '0.75s' }}>
        <Link to={user ? '/painel' : '/criar-conta'} className="lp-btn lp-btn-cheio">
          {user ? 'Ir para o painel' : 'Testar grátis por 14 dias'} <ArrowRight />
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

const RECURSOS = [
  { icone: MessageSquareText, titulo: 'Responde do jeito da casa', texto: 'Vendedor numa loja, recepção numa clínica, professor para alunos. Sem inventar preço nem prazo.' },
  { icone: CalendarCheck, titulo: 'Marca horários', texto: 'Vê os horários livres da sua agenda, confirma com o cliente e deixa marcado.' },
  { icone: Database, titulo: 'Consulta seus dados', texto: 'Preço, estoque, cardápio, status de pedido: ele lê a tabela antes de responder.' },
  { icone: Ticket, titulo: 'Chama você quando precisa', texto: 'Reclamação ou negociação vira chamado numerado, com o resumo do que aconteceu.' },
  { icone: Sparkles, titulo: 'Mostra o que não sabia', texto: 'Toda pergunta sem resposta aparece no painel. Você ensina uma vez e pronto.' },
  { icone: ChartColumn, titulo: 'Conta o que querem', texto: 'Assuntos mais perguntados, horários de pico e a nota de cada atendimento.' },
];

const FONTES = [
  { icone: FileSpreadsheet, nome: 'Excel e CSV' },
  { icone: Link2, nome: 'Google Planilhas' },
  { icone: PlugZap, nome: 'TOTVS Protheus' },
  { icone: PlugZap, nome: 'SAP' },
  { icone: Database, nome: 'Seu banco, por API' },
];

const ASSUNTOS = [
  ['Preço e formas de pagamento', 58],
  ['Horário livre no sábado', 41],
  ['Remarcar horário', 27],
  ['Estacionamento', 19],
];

const FAQ = [
  ['Preciso saber programar?', 'Não. Você conversa, revisa o documento e publica um link. Dá para colocar na bio, no site ou mandar pelo WhatsApp.'],
  ['O que conta como atendimento?', 'Uma conversa de um cliente com o seu atendente, do começo ao fim, com quantas mensagens precisar. É isso que a cota mensal conta.'],
  ['E quando a cota acaba?', 'O atendente não some: ele passa a anotar recados e abrir chamados para a sua equipe, e você pode comprar um pacote extra.'],
  ['Consigo ligar no meu sistema?', 'Sim, por API. Funciona com sistemas que expõem uma API REST, como TOTVS Protheus e SAP. Para banco SQL, coloque uma API na frente: é mais seguro do que abrir o banco para a internet.'],
  ['Funciona no WhatsApp?', 'Hoje o atendimento é pelo link do Helpy. A integração com WhatsApp está no nosso caminho.'],
];

export default function Landing() {
  const { user } = useAuth();
  const deslizar = useRolagemSuave();
  const pagos = [PLANS.essencial, PLANS.profissional, PLANS.business];
  const destino = user ? '/painel' : '/criar-conta';

  return (
    <div className="lp">
      <Topo user={user} deslizar={deslizar} />
      <Hero user={user} deslizar={deslizar} />
      <Filme />

      <section id="como" className="lp-sec">
        <div className="lp-in">
          <Reveal className="lp-cab">
            <span className="lp-etiqueta">Como funciona</span>
            <h2 className="lp-h2">Uma tarde para<br />ficar pronto.</h2>
          </Reveal>
          <ol className="lp-passos">
            {PASSOS.map((p, i) => (
              <Reveal as="li" key={p.titulo} atraso={i * 120} className="lp-passo">
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
          <div className="lp-recursos">
            {RECURSOS.map(({ icone: Icone, titulo, texto }, i) => (
              <Reveal as="article" key={titulo} atraso={(i % 3) * 90}>
                <span className="lp-recurso-icone"><Icone aria-hidden="true" /></span>
                <h3>{titulo}</h3>
                <p>{texto}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

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

      <section id="dados" className="lp-sec">
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
            <span className="lp-fontes-centro"><Marca size={52} /></span>
            {FONTES.map(({ icone: Icone, nome }, i) => (
              <span key={nome} className={`lp-fonte lp-fonte-${i + 1}`}>
                <Icone aria-hidden="true" /> {nome}
              </span>
            ))}
          </Reveal>
        </div>
      </section>

      <section className="lp-sec">
        <div className="lp-in lp-duas lp-duas-inverte">
          <Reveal className="lp-relatorio" aria-label="Exemplo de relatório: assuntos mais perguntados">
            <div className="lp-relatorio-cab">
              <b>O que mais perguntaram</b>
              <span>Últimos 30 dias</span>
            </div>
            <ul>
              {ASSUNTOS.map(([a, n], i) => (
                <li key={a} style={{ '--i': i, '--w': n / ASSUNTOS[0][1] }}>
                  <span>{a}</span>
                  <b>{n}</b>
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

      <section id="planos" className="lp-sec">
        <div className="lp-in">
          <Reveal className="lp-cab lp-cab-centro">
            <span className="lp-etiqueta">Planos</span>
            <h2 className="lp-h2">Paga por atendimento,<br />não por mensagem.</h2>
            <p className="lp-lead">Todos começam com 14 dias grátis, sem cartão.</p>
          </Reveal>
          <div className="lp-planos">
            {pagos.map((p, i) => (
              <Reveal as="article" key={p.id} atraso={i * 100} className={`lp-plano${p.id === 'profissional' ? ' lp-plano-destaque' : ''}`}>
                <div className="lp-plano-topo">
                  <h3>{p.nome}</h3>
                  {p.id === 'profissional' && <span className="lp-plano-tag">Mais escolhido</span>}
                </div>
                <p className="lp-preco">{reais(p.preco)}<small>/mês</small></p>
                <ul>
                  <li>{p.atendimentos.toLocaleString('pt-BR')} atendimentos por mês</li>
                  <li>{p.assistentes} {p.assistentes > 1 ? 'assistentes' : 'assistente'}</li>
                  <li>{p.builderIA ? 'Montagem conversando com a IA' : 'Montagem por formulário'}</li>
                  <li>{p.ticketsAbertos ? `${p.ticketsAbertos} chamados abertos ao mesmo tempo` : 'Chamados sem limite'}</li>
                  <li>{p.tabelas} tabelas, agenda e relatórios</li>
                </ul>
                <Link to="/criar-conta" className={`lp-btn lp-btn-bloco ${p.id === 'profissional' ? 'lp-btn-claro' : 'lp-btn-cheio'}`}>
                  Começar o teste
                </Link>
              </Reveal>
            ))}
          </div>
          <p className="lp-nota">Precisa de mais? Pacotes de +100 atendimentos por R$ 29, sem trocar de plano.</p>
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
            <h2>Teste grátis<br />por 14 dias.</h2>
            <p>Em uma tarde o seu atendente está no ar. Sem cartão para testar.</p>
            <Link to={destino} className="lp-btn lp-btn-claro">
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
          <span>© {new Date().getFullYear()} Helpy</span>
        </div>
      </footer>
    </div>
  );
}
