import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDown, ArrowRight, CalendarCheck, Check, ChartColumn, FileSpreadsheet, Link2, MessageSquareText, PlugZap, Sparkles, Ticket } from 'lucide-react';
import Logo, { Marca } from '@/components/Logo';
import Reveal from '@/components/Reveal';
import { useAuth } from '@/contexts/AuthContext';
import { PLANS, reais } from '@/lib/plans';

// O vídeo de fundo fica no Storage do Supabase (bucket landing-videos).
// Para trocar, suba outro arquivo com o mesmo nome ou defina VITE_VIDEO_FUNDO.
const VIDEO =
  import.meta.env.VITE_VIDEO_FUNDO ||
  `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/landing-videos/videofundo.mp4`;

const reduzido = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// ------------------------------------------------------------
// Topo
// ------------------------------------------------------------

function Topo({ user }) {
  const [rolou, setRolou] = useState(false);
  useEffect(() => {
    const f = () => setRolou(window.scrollY > 40);
    f();
    window.addEventListener('scroll', f, { passive: true });
    return () => window.removeEventListener('scroll', f);
  }, []);

  return (
    <header className="lp-top" data-rolou={rolou}>
      <div className="lp-in row">
        <Link to="/" aria-label="Helpy, início">
          <Logo size={28} />
        </Link>
        <span className="spacer" />
        <nav className="row lp-nav" aria-label="Principal">
          <a href="#como">Como funciona</a>
          <a href="#dados">Integrações</a>
          <a href="#planos">Planos</a>
        </nav>
        {user ? (
          <Link to="/painel" className="btn btn-senha">Ir para o painel</Link>
        ) : (
          <>
            <Link to="/entrar" className="btn btn-quiet">Entrar</Link>
            <Link to="/criar-conta" className="btn btn-senha">Testar grátis</Link>
          </>
        )}
      </div>
    </header>
  );
}

function Hero({ user }) {
  const video = useRef(null);
  const [falhou, setFalhou] = useState(false);

  useEffect(() => {
    if (reduzido()) video.current?.pause();
  }, []);

  return (
    <section className="lp-hero">
      <div className="lp-hero-midia" aria-hidden="true">
        {!falhou && (
          <video ref={video} src={VIDEO} autoPlay muted loop playsInline preload="auto" onError={() => setFalhou(true)} />
        )}
      </div>
      <div className="lp-in lp-hero-conteudo">
        <h1 className="lp-titulo">
          <span>Seu atendimento</span>
          <span>
            nunca mais <em>fecha.</em>
          </span>
        </h1>
        <p className="lp-lead">
          Conte como o seu negócio funciona. O Helpy monta um atendente que responde seus clientes a qualquer hora, consulta
          seus dados, marca horários e chama a sua equipe quando precisa de gente.
        </p>
        <div className="row row-wrap lp-hero-acoes">
          <Link to={user ? '/painel' : '/criar-conta'} className="btn btn-senha btn-lg">
            Testar grátis por 14 dias <ArrowRight />
          </Link>
          <a href="#como" className="btn btn-ghost btn-lg">Ver como funciona</a>
        </div>
      </div>
      <a href="#como" className="lp-descer" aria-label="Rolar para conhecer">
        <span>Role para conhecer</span>
        <ArrowDown />
      </a>
    </section>
  );
}

// ------------------------------------------------------------
// Como funciona: os passos rolam, a tela ao lado acompanha
// ------------------------------------------------------------

const PASSOS = [
  {
    titulo: 'Conte do seu jeito',
    texto: 'Escreva como falaria com um funcionário novo, ou cole sua tabela de preços. O Helpy pergunta só o que falta, uma coisa por vez.',
  },
  {
    titulo: 'Confira o que ele aprendeu',
    texto: 'Tudo vira um documento que você vê se preenchendo na hora e corrige à mão. O que você não disse fica em branco: nada é inventado.',
  },
  {
    titulo: 'Publique e acompanhe',
    texto: 'Você ganha um link de atendimento para a bio, o site ou o QR do balcão. Quando precisa de alguém, a conversa vira chamado com número.',
  },
];

function TelaConversa() {
  return (
    <div className="lp-tela-chat">
      <div className="msg msg-user"><div className="msg-body">Tenho uma barbearia no Centro. Corte R$ 45, barba R$ 35, os dois por R$ 70.</div></div>
      <div className="msg msg-bot"><span className="msg-who">Helpy</span><div className="msg-body">Boa, três serviços anotados. Vocês atendem só com horário marcado?</div></div>
      <div className="msg msg-user"><div className="msg-body">Só com horário, seg a sáb das 9h às 19h.</div></div>
      <div className="msg msg-bot"><span className="msg-who">Helpy</span><div className="msg-body">Fechado: ele vai marcar direto na sua agenda. Como ele se chama?</div></div>
    </div>
  );
}

function TelaDocumento() {
  const linhas = [
    ['Nome do assistente', 'Zeca'],
    ['Ramo', 'Barbearia'],
    ['Corte', 'R$ 45 · 40 min'],
    ['Barba', 'R$ 35 · 30 min'],
    ['Corte + barba', 'R$ 70'],
    ['Horário', 'Seg a sáb, 9h–19h'],
    ['Marca horário sozinho', 'Sim'],
  ];
  return (
    <div className="lp-tela-doc">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <b>O que o Zeca sabe</b>
        <span className="lp-progresso"><span style={{ width: '86%' }} /></span>
      </div>
      <ul>
        {linhas.map(([r, v], i) => (
          <li key={r} style={{ '--i': i }}>
            <span>{r}</span>
            <b>{v}</b>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TelaLink() {
  return (
    <div className="lp-tela-link">
      <div className="lp-celular">
        <div className="lp-celular-top">
          <span className="publico-avatar" style={{ width: 30, height: 30, fontSize: 14 }}>Z</span>
          <b>Zeca</b>
        </div>
        <div className="msg msg-user"><div className="msg-body">Tem horário sábado de manhã?</div></div>
        <div className="msg msg-bot"><div className="msg-body">Tenho 9h, 9h40 e 10h20. Qual fica melhor?</div></div>
        <div className="msg msg-user"><div className="msg-body">9h40, pode ser</div></div>
        <div className="msg msg-bot"><div className="msg-body">Marcado! Sábado, 9h40, corte. Te espero 😉</div></div>
      </div>
      <div className="stub stub-senha lp-tela-stub">
        <div className="stub-num"><small>Senha</small><b>Nº 0042</b></div>
        <div className="stub-body">
          <b style={{ fontSize: 14 }}>Cliente quer remarcar</b>
          <p style={{ fontSize: 12.5 }}>Chamado aberto para a equipe</p>
        </div>
      </div>
    </div>
  );
}

const TELAS = [TelaConversa, TelaDocumento, TelaLink];

function ComoFunciona() {
  const [ativo, setAtivo] = useState(0);
  const passos = useRef([]);

  useEffect(() => {
    if (!('IntersectionObserver' in window)) return;
    const obs = new IntersectionObserver(
      (entradas) => {
        for (const e of entradas) if (e.isIntersecting) setAtivo(Number(e.target.dataset.i));
      },
      { rootMargin: '-45% 0px -45% 0px' },
    );
    passos.current.forEach((p) => p && obs.observe(p));
    return () => obs.disconnect();
  }, []);

  return (
    <section id="como" className="lp-sec">
      <div className="lp-in">
        <Reveal>
          <h2 className="lp-h2">Da conversa ao atendimento<br />em uma tarde.</h2>
        </Reveal>
        <div className="lp-historia">
          <ol className="lp-passos">
            {PASSOS.map((p, i) => (
              <li key={p.titulo} ref={(el) => (passos.current[i] = el)} data-i={i} data-ativo={ativo === i}>
                <span className="lp-passo-n">{i + 1}</span>
                <h3>{p.titulo}</h3>
                <p>{p.texto}</p>
                <div className="lp-tela lp-tela-inline">{TELAS[i]()}</div>
              </li>
            ))}
          </ol>
          <div className="lp-palco" aria-hidden="true">
            <div className="lp-tela">
              {TELAS.map((T, i) => (
                <div key={i} className="lp-tela-camada" data-ativo={ativo === i}>
                  <T />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ------------------------------------------------------------
// O resto da página
// ------------------------------------------------------------

const RECURSOS = [
  { icone: MessageSquareText, titulo: 'Fala como gente', texto: 'Vendedor numa loja, recepção numa clínica, professor para alunos. Ele atende do jeito do seu negócio, sem inventar preço nem prazo.' },
  { icone: CalendarCheck, titulo: 'Marca horário sozinho', texto: 'Vê os horários livres da sua agenda, confirma com o cliente e deixa marcado. Você só aparece na hora.' },
  { icone: Ticket, titulo: 'Chama a equipe quando precisa', texto: 'Reclamação ou negociação vira chamado numerado, com resumo do que aconteceu. Você assume e responde no mesmo chat.' },
  { icone: Sparkles, titulo: 'Mostra o que ele não sabia', texto: 'Toda pergunta sem resposta vira uma lacuna no painel. Você ensina uma vez e nunca mais perde aquele cliente.' },
];

const FONTES = [
  { icone: FileSpreadsheet, nome: 'Excel e CSV', texto: 'Suba a planilha e ela vira uma tabela que o atendente consulta.' },
  { icone: Link2, nome: 'Planilha online', texto: 'Ligue um Google Planilhas publicado: mudou lá, ele já responde certo.' },
  { icone: PlugZap, nome: 'Seu sistema, por API', texto: 'TOTVS Protheus, SAP, ERP próprio ou banco SQL com uma API na frente: ele consulta estoque e pedido ao vivo.' },
];

const ASSUNTOS = [
  ['Preço e formas de pagamento', 34],
  ['Horários disponíveis', 27],
  ['Estacionamento', 14],
  ['Corte infantil', 9],
  ['Promoções', 6],
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
  const pagos = [PLANS.essencial, PLANS.profissional, PLANS.business];
  const maxAssunto = Math.max(...ASSUNTOS.map((a) => a[1]));

  return (
    <div className="lp">
      <Topo user={user} />
      <Hero user={user} />
      <ComoFunciona />

      <section className="lp-sec lp-sec-faixa">
        <div className="lp-in">
          <Reveal>
            <h2 className="lp-h2">Não é um robô de perguntas<br />e respostas.</h2>
          </Reveal>
          <div className="lp-recursos">
            {RECURSOS.map(({ icone: Icone, titulo, texto }, i) => (
              <Reveal as="article" key={titulo} atraso={i * 90}>
                <Icone aria-hidden="true" />
                <h3>{titulo}</h3>
                <p>{texto}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section id="dados" className="lp-sec">
        <div className="lp-in lp-duas">
          <Reveal>
            <h2 className="lp-h2">Ligado no que você já usa.</h2>
            <p className="lp-lead">
              O atendente responde com o dado de agora, não com o que estava certo no mês passado. Preço, estoque, cardápio,
              status de pedido: ele consulta na hora de responder.
            </p>
          </Reveal>
          <div className="stack">
            {FONTES.map(({ icone: Icone, nome, texto }, i) => (
              <Reveal key={nome} atraso={i * 110} className="lp-fonte">
                <Icone aria-hidden="true" />
                <div>
                  <b>{nome}</b>
                  <p>{texto}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="lp-sec lp-sec-faixa">
        <div className="lp-in lp-duas">
          <Reveal className="lp-relatorio" aria-hidden="true">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <b>O que mais perguntaram</b>
              <span className="faint" style={{ fontSize: 13 }}>últimos 30 dias</span>
            </div>
            <ul>
              {ASSUNTOS.map(([a, n], i) => (
                <li key={a} style={{ '--i': i }}>
                  <span>{a}</span>
                  <span className="lp-barra"><span style={{ width: `${(n / maxAssunto) * 100}%` }} /></span>
                  <b className="num">{n}</b>
                </li>
              ))}
            </ul>
          </Reveal>
          <Reveal atraso={120}>
            <ChartColumn className="lp-icone-grande" aria-hidden="true" />
            <h2 className="lp-h2">Saiba o que seus clientes querem.</h2>
            <p className="lp-lead">
              Assuntos mais perguntados, horários de pico, quanto o atendente resolveu sozinho e a nota que os clientes deram.
              Tudo num painel, sem planilha.
            </p>
          </Reveal>
        </div>
      </section>

      <section id="planos" className="lp-sec">
        <div className="lp-in">
          <Reveal>
            <h2 className="lp-h2">Planos</h2>
            <p className="lp-lead" style={{ marginBottom: 32 }}>
              Todos começam com 14 dias grátis. Você paga por atendimento, não por mensagem.
            </p>
          </Reveal>
          <div className="lp-planos">
            {pagos.map((p, i) => (
              <Reveal as="article" key={p.id} atraso={i * 100} className={`lp-plano${p.id === 'profissional' ? ' lp-plano-destaque' : ''}`}>
                {p.id === 'profissional' && <span className="lp-plano-tag">Mais escolhido</span>}
                <h3>{p.nome}</h3>
                <p className="lp-preco">{reais(p.preco)}<small>/mês</small></p>
                <ul>
                  <li><Check /> {p.atendimentos.toLocaleString('pt-BR')} atendimentos por mês</li>
                  <li><Check /> {p.assistentes} {p.assistentes > 1 ? 'assistentes' : 'assistente'}</li>
                  <li><Check /> {p.builderIA ? 'Montagem conversando com a IA' : 'Montagem por formulário'}</li>
                  <li><Check /> {p.ticketsAbertos ? `${p.ticketsAbertos} chamados abertos ao mesmo tempo` : 'Chamados sem limite'}</li>
                  <li><Check /> {p.tabelas} tabelas, agenda e relatórios</li>
                </ul>
                <Link to="/criar-conta" className={`btn btn-block ${p.id === 'profissional' ? 'btn-senha' : 'btn-ghost'}`}>
                  Começar o teste
                </Link>
              </Reveal>
            ))}
          </div>
          <p className="faint" style={{ fontSize: 13.5, marginTop: 18 }}>
            Precisa de mais? Pacotes de +100 atendimentos por R$ 29, sem trocar de plano.
          </p>
        </div>
      </section>

      <section className="lp-sec lp-sec-faixa">
        <div className="lp-in lp-faq">
          <Reveal>
            <h2 className="lp-h2">Perguntas que chegam no balcão</h2>
          </Reveal>
          <div>
            {FAQ.map(([p, r], i) => (
              <Reveal as="details" key={p} atraso={i * 60}>
                <summary>{p}</summary>
                <p>{r}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="lp-final">
        <div className="lp-in">
          <Reveal className="lp-final-in">
            <Marca size={56} />
            <h2>Pegue sua senha.</h2>
            <p className="lp-lead">Em uma tarde o seu atendente está no ar. Sem cartão para testar.</p>
            <Link to={user ? '/painel' : '/criar-conta'} className="btn btn-senha btn-lg">
              Criar meu atendente <ArrowRight />
            </Link>
          </Reveal>
        </div>
      </section>

      <footer className="lp-foot">
        <div className="lp-in row row-wrap">
          <Logo size={22} />
          <span className="spacer" />
          <Link to="/termos">Termos</Link>
          <Link to="/privacidade">Privacidade</Link>
          <span className="faint">© {new Date().getFullYear()} Helpy</span>
        </div>
      </footer>
    </div>
  );
}
