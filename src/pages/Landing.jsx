import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Lenis from 'lenis';
import Logo from '@/components/Logo';
import Reveal, { useNaTela } from '@/components/Reveal';
import VideoFundo, { reduzido } from '@/components/VideoFundo';
import { useAuth } from '@/contexts/AuthContext';
import { PLANS, reais } from '@/lib/plans';

/** Rolagem suave só na landing; o painel continua com a rolagem nativa. */
function useRolagemSuave() {
  const lenis = useRef(null);
  useEffect(() => {
    if (reduzido()) return;
    const l = new Lenis({ duration: 1.15, easing: (t) => 1 - Math.pow(1 - t, 4), smoothWheel: true });
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
    if (lenis.current) lenis.current.scrollTo(el, { offset: -64 });
    else el.scrollIntoView({ behavior: reduzido() ? 'auto' : 'smooth' });
  };
}

/** Quanto do elemento já passou pela tela, de 0 a 1. Escreve em --p. */
function useProgresso(ref, { inicio = 1, fim = 0 } = {}) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reduzido()) {
      el.style.setProperty('--p', '1');
      return;
    }
    let pendente = false;
    const medir = () => {
      pendente = false;
      const r = el.getBoundingClientRect();
      const h = window.innerHeight;
      // 0 quando o topo do elemento está em `inicio` da tela, 1 quando chega em `fim`
      const p = (h * inicio - r.top) / (h * inicio - h * fim + r.height * 0.6);
      el.style.setProperty('--p', Math.min(1, Math.max(0, p)).toFixed(3));
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
  }, [ref, inicio, fim]);
}

// ------------------------------------------------------------
// Relógio do hero: o horário de agora, para lembrar que ele atende agora
// ------------------------------------------------------------
function Relogio() {
  const [agora, setAgora] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setAgora(new Date()), 15_000);
    return () => clearInterval(t);
  }, []);
  const hora = agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
  return (
    <span className="lp-relogio">
      <i aria-hidden="true" />
      São Paulo {hora} · atendendo agora
    </span>
  );
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
          <a href="#como" onClick={deslizar}>Como funciona</a>
          <a href="#dados" onClick={deslizar}>Integrações</a>
          <a href="#planos" onClick={deslizar}>Planos</a>
          <a href="#perguntas" onClick={deslizar}>Perguntas</a>
        </nav>
        <div className="lp-top-acoes">
          {user ? (
            <Link to="/painel" className="lp-btn">Ir para o painel</Link>
          ) : (
            <>
              <Link to="/entrar" className="lp-link">Entrar</Link>
              <Link to="/criar-conta" className="lp-btn">Testar grátis</Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

function Hero({ user, deslizar }) {
  const ref = useRef(null);
  useProgresso(ref, { inicio: 0, fim: -1 });

  return (
    <section className="lp-hero" ref={ref}>
      <VideoFundo />
      <div className="lp-hero-veu" aria-hidden="true" />

      <div className="lp-in lp-hero-conteudo">
        <p className="lp-micro lp-entra" style={{ '--d': '0.15s' }}>Helpy · atendente virtual para pequenos negócios</p>
        <h1 className="lp-titulo">
          <span className="lp-mascara"><span style={{ '--d': '0.25s' }}>Seu atendimento</span></span>
          <span className="lp-mascara"><span style={{ '--d': '0.4s' }}><em>nunca</em> fecha.</span></span>
        </h1>
        <p className="lp-lead lp-entra" style={{ '--d': '0.85s' }}>
          Conte como o seu negócio funciona. O Helpy responde seus clientes a qualquer hora, consulta seus preços, marca
          horários e chama você quando precisa de gente.
        </p>
        <div className="lp-hero-acoes lp-entra" style={{ '--d': '1s' }}>
          <Link to={user ? '/painel' : '/criar-conta'} className="lp-btn lp-btn-cheio">
            {user ? 'Ir para o painel' : 'Testar grátis por 14 dias'}
          </Link>
          <a href="#como" className="lp-link lp-link-seta" onClick={deslizar}>Ver como funciona</a>
        </div>
      </div>

      <div className="lp-in lp-hero-rodape lp-entra" style={{ '--d': '1.25s' }}>
        <span className="lp-descer"><i aria-hidden="true" /> Role para descer</span>
        <span className="lp-hero-meio">Sem cartão para testar</span>
        <Relogio />
      </div>
    </section>
  );
}

// ------------------------------------------------------------
// O que é: o texto acende conforme a leitura
// ------------------------------------------------------------
function TextoQueAcende({ partes }) {
  const ref = useRef(null);
  useProgresso(ref, { inicio: 0.85, fim: 0.35 });
  const palavras = partes.flatMap(([texto, enfase]) => texto.split(' ').filter(Boolean).map((p) => [p, enfase]));
  return (
    <p className="lp-manifesto" ref={ref} style={{ '--n': palavras.length }}>
      {palavras.map(([p, enfase], i) => {
        const Tag = enfase ? 'em' : 'span';
        return (
          <Tag key={i} style={{ '--i': i }}>
            {p}{' '}
          </Tag>
        );
      })}
    </p>
  );
}

// ------------------------------------------------------------
// Uma conversa de verdade, às 23h, com o que ele fez à margem
// ------------------------------------------------------------
const CONVERSA = [
  { quem: 'Cliente', hora: '23:12', texto: 'Vocês têm horário sábado de manhã?' },
  { quem: 'Helpy', hora: '23:12', texto: 'Tenho 9h, 9h40 e 10h20. O corte sai por R$ 45. Qual fica melhor?', nota: 'consultou a tabela Serviços' },
  { quem: 'Cliente', hora: '23:13', texto: '9h40. Dá pra pagar no pix?' },
  { quem: 'Helpy', hora: '23:13', texto: 'Dá sim. Marquei sábado, 9h40, corte. Te espero.', nota: 'marcou na agenda' },
  { quem: 'Cliente', hora: '23:15', texto: 'Ah, e o corte da semana passada ficou torto.' },
  { quem: 'Helpy', hora: '23:15', texto: 'Sinto muito por isso. Abri o chamado Nº 0042 e o Gabriel te responde por aqui amanhã cedo.', nota: 'chamou a equipe' },
];

function Transcricao() {
  const [ref, visto] = useNaTela({ threshold: 0.25, rootMargin: '0px 0px -10% 0px' });
  return (
    <div className="lp-conversa" ref={ref} data-visto={visto}>
      <div className="lp-conversa-cab">
        <span>Barbearia do Zé</span>
        <span>Atendimento pelo link · sábado, 23:12</span>
      </div>
      <ol className="lp-transcricao">
        {CONVERSA.map((l, i) => (
          <li key={i} data-quem={l.quem} style={{ '--i': i }}>
            <span className="lp-fala-quem">{l.quem}<small>{l.hora}</small></span>
            <p>{l.texto}</p>
            {l.nota ? <span className="lp-fala-nota">{l.nota}</span> : <span />}
          </li>
        ))}
      </ol>
      <div className="lp-senha" style={{ '--i': CONVERSA.length }}>
        <div className="lp-senha-num">
          <small>Senha</small>
          <b>Nº 0042</b>
        </div>
        <div className="lp-senha-corpo">
          <b>Reclamação do serviço</b>
          <span>Aberto às 23:15 · resumo pronto para a equipe</span>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------
// Conteúdo
// ------------------------------------------------------------
const PASSOS = [
  ['Conte do seu jeito', 'Escreva como falaria com um funcionário novo, ou cole sua tabela de preços. O Helpy pergunta só o que falta.'],
  ['Revise o que ele aprendeu', 'Tudo vira um documento que você corrige à mão. O que você não disse fica em branco: nada é inventado.'],
  ['Publique o link', 'Coloque na bio, no site ou no QR do balcão. A partir daí, ele atende e você acompanha pelo painel.'],
];

const FAZ = [
  ['Responde do jeito da casa', 'Vendedor numa loja, recepção numa clínica, professor para alunos. Sem inventar preço nem prazo.', 'Atendimento'],
  ['Marca horários', 'Vê os horários livres da sua agenda, confirma com o cliente e deixa marcado.', 'Agenda'],
  ['Consulta seus dados', 'Preço, estoque, cardápio, status de pedido: ele lê a tabela antes de responder.', 'Dados'],
  ['Chama você quando precisa', 'Reclamação ou negociação vira chamado numerado, com o resumo do que aconteceu.', 'Chamados'],
  ['Mostra o que não sabia', 'Toda pergunta sem resposta aparece no painel. Você ensina uma vez e pronto.', 'Lacunas'],
  ['Conta o que os clientes querem', 'Assuntos mais perguntados, horários de pico e a nota de cada atendimento.', 'Relatórios'],
];

const FONTES = [
  ['Excel e CSV', 'Envie a planilha e ela vira uma tabela que o atendente consulta.'],
  ['Google Planilhas', 'Ligue a planilha publicada. Mudou lá, ele já responde com o novo.'],
  ['TOTVS Protheus', 'Pelo REST do Protheus: estoque, preço e pedido consultados ao vivo.'],
  ['SAP', 'Por serviço OData do SAP Gateway ou do Service Layer.'],
  ['Seu banco ou ERP', 'Qualquer sistema com uma API em JSON. Banco SQL, com uma API na frente.'],
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

function Intervalo() {
  const ref = useRef(null);
  useProgresso(ref, { inicio: 1, fim: 0 });
  return (
    <section className="lp-intervalo" ref={ref}>
      <VideoFundo className="lp-video-intervalo" />
      <div className="lp-intervalo-veu" aria-hidden="true" />
      <Reveal className="lp-in lp-intervalo-texto">
        <p className="lp-micro">23h de uma sexta-feira</p>
        <h2 className="lp-h2">
          A loja fechou.
          <br />
          <em>O atendimento, não.</em>
        </h2>
      </Reveal>
    </section>
  );
}

export default function Landing() {
  const { user } = useAuth();
  const deslizar = useRolagemSuave();
  const pagos = [PLANS.essencial, PLANS.profissional, PLANS.business];
  const maxAssunto = Math.max(...ASSUNTOS.map((a) => a[1]));
  const destino = user ? '/painel' : '/criar-conta';

  return (
    <div className="lp">
      <Topo user={user} deslizar={deslizar} />
      <Hero user={user} deslizar={deslizar} />

      <section className="lp-sec lp-sec-manifesto">
        <div className="lp-in lp-grade">
          <p className="lp-micro lp-rotulo">O que é</p>
          <TextoQueAcende
            partes={[
              ['Um atendente que aprende o seu negócio numa conversa, responde seus clientes do jeito da casa e'],
              ['sabe a hora de chamar você.', true],
            ]}
          />
        </div>
      </section>

      <section id="como" className="lp-sec">
        <div className="lp-in lp-grade">
          <p className="lp-micro lp-rotulo">Como funciona</p>
          <div>
            <Reveal as="h2" className="lp-h2">Uma tarde para ficar pronto.</Reveal>
            <ol className="lp-passos">
              {PASSOS.map(([t, d], i) => (
                <Reveal as="li" key={t} atraso={i * 120}>
                  <span className="lp-passo-n">{String(i + 1).padStart(2, '0')}</span>
                  <h3>{t}</h3>
                  <p>{d}</p>
                </Reveal>
              ))}
            </ol>
          </div>
        </div>
        <div className="lp-in">
          <Transcricao />
        </div>
      </section>

      <section className="lp-sec">
        <div className="lp-in lp-grade">
          <p className="lp-micro lp-rotulo">O que ele faz</p>
          <ul className="lp-indice">
            {FAZ.map(([t, d, tag], i) => (
              <Reveal as="li" key={t} atraso={i * 60}>
                <h3>{t}</h3>
                <p>{d}</p>
                <span className="lp-micro">{tag}</span>
              </Reveal>
            ))}
          </ul>
        </div>
      </section>

      <Intervalo />

      <section id="dados" className="lp-sec">
        <div className="lp-in lp-grade">
          <p className="lp-micro lp-rotulo">Integrações</p>
          <div className="lp-duas">
            <Reveal>
              <h2 className="lp-h2">Lê o que você <em>já usa.</em></h2>
              <p className="lp-lead">
                O atendente responde com o dado de agora, não com o que estava certo no mês passado. Ele consulta na hora de
                responder.
              </p>
            </Reveal>
            <ul className="lp-fontes">
              {FONTES.map(([n, d], i) => (
                <Reveal as="li" key={n} atraso={i * 80}>
                  <b>{n}</b>
                  <span>{d}</span>
                </Reveal>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="lp-sec">
        <div className="lp-in lp-grade">
          <p className="lp-micro lp-rotulo">Relatórios</p>
          <div className="lp-duas">
            <Reveal>
              <h2 className="lp-h2">Saiba o que os seus clientes <em>querem saber.</em></h2>
              <p className="lp-lead">
                A IA agrupa as perguntas por assunto. Junto vêm os horários de pico, quanto ele resolveu sozinho e a nota que os
                clientes deram.
              </p>
            </Reveal>
            <Reveal className="lp-relatorio" atraso={120} aria-label="Exemplo de relatório: assuntos mais perguntados">
              <div className="lp-relatorio-cab">
                <span>O que mais perguntaram</span>
                <span>Últimos 30 dias</span>
              </div>
              <ul>
                {ASSUNTOS.map(([a, n], i) => (
                  <li key={a} style={{ '--i': i, '--w': n / maxAssunto }}>
                    <span>{a}</span>
                    <b>{n}</b>
                    <i aria-hidden="true" />
                  </li>
                ))}
              </ul>
            </Reveal>
          </div>
        </div>
      </section>

      <section id="planos" className="lp-sec">
        <div className="lp-in lp-grade">
          <p className="lp-micro lp-rotulo">Planos</p>
          <div>
            <Reveal>
              <h2 className="lp-h2">Paga por atendimento, <em>não por mensagem.</em></h2>
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
                  <Link to="/criar-conta" className={`lp-btn lp-btn-bloco${p.id === 'profissional' ? ' lp-btn-cheio' : ''}`}>
                    Começar o teste
                  </Link>
                </Reveal>
              ))}
            </div>
            <p className="lp-nota">Precisa de mais? Pacotes de +100 atendimentos por R$ 29, sem trocar de plano.</p>
          </div>
        </div>
      </section>

      <section id="perguntas" className="lp-sec">
        <div className="lp-in lp-grade">
          <p className="lp-micro lp-rotulo">Perguntas</p>
          <div className="lp-faq">
            {FAQ.map(([p, r], i) => (
              <Reveal as="details" key={p} atraso={i * 60}>
                <summary>
                  {p}
                  <i aria-hidden="true" />
                </summary>
                <p>{r}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="lp-final">
        <div className="lp-in">
          <Reveal as="h2" className="lp-final-titulo">
            Abra o seu balcão
            <br />
            <em>hoje à noite.</em>
          </Reveal>
          <Reveal className="lp-final-acoes" atraso={150}>
            <Link to={destino} className="lp-btn lp-btn-cheio">{user ? 'Ir para o painel' : 'Criar meu atendente'}</Link>
            <span className="lp-micro">14 dias grátis · sem cartão</span>
          </Reveal>
        </div>
      </section>

      <footer className="lp-foot">
        <div className="lp-in lp-foot-in">
          <Logo size={20} />
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
