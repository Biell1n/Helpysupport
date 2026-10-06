import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CalendarCheck, Check, MessageSquareText, Sheet, Sparkles } from 'lucide-react';
import Logo from '@/components/Logo';
import { useAuth } from '@/contexts/AuthContext';
import { PLANS, reais } from '@/lib/plans';

// A demonstração do topo: o dono conta, o documento se preenche.
const ROTEIRO = [
  { quem: 'dono', texto: 'Tenho uma barbearia no Centro. Corte é R$ 45, barba R$ 35, os dois saem por R$ 70.' },
  { quem: 'helpy', texto: 'Boa, três serviços anotados. Vocês atendem por ordem de chegada ou com horário marcado?' },
  { quem: 'dono', texto: 'Só com horário. Seg a sáb, das 9h às 19h.' },
  { quem: 'helpy', texto: 'Fechado: ele vai marcar direto na sua agenda. Como você quer que ele se chame?' },
];

const CAMPOS = [
  { rotulo: 'Ramo', valor: 'Barbearia', passo: 1 },
  { rotulo: 'Corte', valor: 'R$ 45 · 40 min', passo: 1 },
  { rotulo: 'Barba', valor: 'R$ 35 · 30 min', passo: 1 },
  { rotulo: 'Corte + barba', valor: 'R$ 70', passo: 1 },
  { rotulo: 'Agenda', valor: 'Seg a sáb, 9h–19h', passo: 3 },
];

function Demo() {
  const reduzido = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const [passo, setPasso] = useState(reduzido ? ROTEIRO.length : 0);

  useEffect(() => {
    if (reduzido) return;
    const t = setInterval(() => setPasso((p) => (p >= ROTEIRO.length + 3 ? 0 : p + 1)), 1700);
    return () => clearInterval(t);
  }, [reduzido]);

  return (
    <div className="lp-demo" aria-label="Exemplo: o dono de uma barbearia conta como funciona e o documento do atendente se preenche">
      <div className="lp-demo-chat">
        {ROTEIRO.slice(0, Math.min(passo, ROTEIRO.length)).map((m, i) => (
          <div key={i} className={`msg ${m.quem === 'dono' ? 'msg-user' : 'msg-bot'}`}>
            <div className="msg-body">{m.texto}</div>
          </div>
        ))}
      </div>
      <div className="lp-demo-doc">
        <p className="eyebrow">O que o atendente sabe</p>
        <ul>
          {CAMPOS.map((c) => (
            <li key={c.rotulo} data-on={passo > c.passo ? 'true' : 'false'}>
              <span>{c.rotulo}</span>
              <b>{passo > c.passo ? c.valor : ''}</b>
            </li>
          ))}
        </ul>
      </div>
      <div className="stub stub-senha lp-demo-stub" data-on={passo > ROTEIRO.length ? 'true' : 'false'}>
        <div className="stub-num">
          <small>Senha</small>
          <b>Nº 0042</b>
        </div>
        <div className="stub-body">
          <b style={{ fontSize: 14 }}>Cliente quer remarcar para sábado</b>
          <p style={{ fontSize: 12.5 }}>Chamado aberto para a sua equipe</p>
        </div>
      </div>
    </div>
  );
}

const RECURSOS = [
  {
    icone: MessageSquareText,
    titulo: 'Montado numa conversa',
    texto: 'Você conta como o negócio funciona, do seu jeito. O Helpy pergunta o que falta e escreve o treinamento ao lado, campo por campo.',
  },
  {
    icone: Sheet,
    titulo: 'Consulta as suas planilhas',
    texto: 'Preço, estoque, cardápio: mude na tabela às 9h e às 9h01 o atendente já responde certo, sem republicar nada.',
  },
  {
    icone: CalendarCheck,
    titulo: 'Marca horário sozinho',
    texto: 'Ele vê os horários livres da sua agenda, confirma com o cliente e já deixa marcado.',
  },
  {
    icone: Sparkles,
    titulo: 'Mostra o que ele não sabia',
    texto: 'Toda pergunta sem resposta vira uma lacuna no painel, para você ensinar uma vez e nunca mais perder o cliente.',
  },
];

const FAQ = [
  ['Preciso saber programar?', 'Não. Você conversa, revisa o documento e publica um link. Dá para colocar o link no Instagram, no site ou mandar pelo WhatsApp.'],
  ['O que é um atendimento?', 'Uma conversa de um cliente com o seu atendente, do começo ao fim, não importa quantas mensagens. É isso que a cota mensal conta.'],
  ['E quando a cota acaba?', 'O atendente não some: ele passa a anotar recados e abrir chamados para a sua equipe, e você pode comprar um pacote extra.'],
  ['Funciona no WhatsApp?', 'Hoje o atendimento é pelo link do Helpy. A integração com WhatsApp está no nosso caminho.'],
];

export default function Landing() {
  const { user } = useAuth();
  const pagos = [PLANS.essencial, PLANS.profissional, PLANS.business];

  return (
    <div className="lp">
      <header className="lp-top">
        <div className="lp-in row">
          <Link to="/" aria-label="Helpy, início">
            <Logo size={30} />
          </Link>
          <span className="spacer" />
          <nav className="row lp-nav" aria-label="Principal">
            <a href="#como">Como funciona</a>
            <a href="#planos">Planos</a>
          </nav>
          {user ? (
            <Link to="/painel" className="btn btn-primary">Ir para o painel</Link>
          ) : (
            <>
              <Link to="/entrar" className="btn btn-quiet">Entrar</Link>
              <Link to="/criar-conta" className="btn btn-primary">Testar grátis</Link>
            </>
          )}
        </div>
      </header>

      <section className="lp-hero">
        <div className="lp-in lp-hero-grid">
          <div className="lp-hero-copy">
            <p className="eyebrow">Atendente virtual para pequenos negócios</p>
            <h1>
              O atendente do seu negócio, <mark>montado numa conversa.</mark>
            </h1>
            <p className="lp-lead">
              Conte como a sua empresa funciona. O Helpy escreve o treinamento, responde seus clientes a qualquer hora,
              marca horários na sua agenda e, quando precisa de gente, abre um chamado para a sua equipe.
            </p>
            <div className="row row-wrap">
              <Link to={user ? '/painel' : '/criar-conta'} className="btn btn-senha btn-lg">
                Testar grátis por 14 dias <ArrowRight />
              </Link>
              <a href="#planos" className="btn btn-ghost btn-lg">Ver planos</a>
            </div>
            <p className="faint" style={{ fontSize: 13 }}>Sem cartão de crédito para testar.</p>
          </div>
          <Demo />
        </div>
      </section>

      <section id="como" className="lp-sec">
        <div className="lp-in">
          <h2 className="lp-h2">Do zero ao atendimento em uma tarde</h2>
          <ol className="lp-passos">
            <li>
              <span className="lp-passo-n">1</span>
              <h3>Conte</h3>
              <p>Fale do negócio como falaria com um funcionário novo: o que vende, quanto custa, como funciona.</p>
            </li>
            <li>
              <span className="lp-passo-n">2</span>
              <h3>Revise</h3>
              <p>Tudo vira um documento que você confere e corrige à mão. Nada é inventado: o que você não disse fica em branco.</p>
            </li>
            <li>
              <span className="lp-passo-n">3</span>
              <h3>Publique</h3>
              <p>Ganhe um link de atendimento. Coloque na bio, no site, no QR code do balcão.</p>
            </li>
          </ol>
        </div>
      </section>

      <section className="lp-sec lp-sec-branca">
        <div className="lp-in lp-recursos">
          {RECURSOS.map(({ icone: Icone, titulo, texto }) => (
            <article key={titulo}>
              <Icone aria-hidden="true" />
              <h3>{titulo}</h3>
              <p>{texto}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="lp-sec">
        <div className="lp-in lp-chamados">
          <div>
            <h2 className="lp-h2">Quando precisa de gente, vira chamado</h2>
            <p className="lp-lead">
              Reclamação, negociação, um caso fora do script: o atendente passa a conversa para a sua equipe com um resumo do
              que aconteceu. Você assume, responde no mesmo chat e encerra. O cliente acompanha tudo e avalia no final.
            </p>
          </div>
          <div className="lp-pilha" aria-hidden="true">
            <div className="stub">
              <div className="stub-num"><small>Senha</small><b>Nº 0118</b></div>
              <div className="stub-body"><span className="badge badge-waiting">Aguardando equipe</span><p style={{ marginTop: 6, fontWeight: 600 }}>Pedido chegou com defeito</p></div>
            </div>
            <div className="stub stub-senha">
              <div className="stub-num"><small>Senha</small><b>Nº 0117</b></div>
              <div className="stub-body"><span className="badge badge-human">Em atendimento</span><p style={{ marginTop: 6, fontWeight: 600 }}>Orçamento para 40 camisetas</p></div>
            </div>
            <div className="stub">
              <div className="stub-num"><small>Senha</small><b>Nº 0116</b></div>
              <div className="stub-body"><span className="badge badge-closed">Encerrado · ★★★★★</span><p style={{ marginTop: 6, fontWeight: 600 }}>Troca de tamanho</p></div>
            </div>
          </div>
        </div>
      </section>

      <section id="planos" className="lp-sec lp-sec-branca">
        <div className="lp-in">
          <h2 className="lp-h2">Planos</h2>
          <p className="lp-lead" style={{ marginBottom: 28 }}>
            Todos começam com 14 dias grátis. Você paga por atendimentos, não por mensagem.
          </p>
          <div className="lp-planos">
            {pagos.map((p) => (
              <article key={p.id} className={`lp-plano${p.id === 'profissional' ? ' lp-plano-destaque' : ''}`}>
                {p.id === 'profissional' && <span className="badge badge-plain lp-plano-tag">Mais escolhido</span>}
                <h3>{p.nome}</h3>
                <p className="lp-preco">
                  {reais(p.preco)}
                  <small>/mês</small>
                </p>
                <ul>
                  <li><Check /> {p.atendimentos.toLocaleString('pt-BR')} atendimentos por mês</li>
                  <li><Check /> {p.assistentes} {p.assistentes > 1 ? 'assistentes' : 'assistente'}</li>
                  <li><Check /> {p.builderIA ? 'Montagem conversando com a IA' : 'Montagem por formulário'}</li>
                  <li><Check /> {p.ticketsAbertos ? `${p.ticketsAbertos} chamados abertos ao mesmo tempo` : 'Chamados sem limite'}</li>
                  <li><Check /> {p.tabelas} tabelas de dados e agenda</li>
                </ul>
                <Link to="/criar-conta" className={`btn btn-block ${p.id === 'profissional' ? 'btn-senha' : 'btn-ghost'}`}>
                  Começar o teste
                </Link>
              </article>
            ))}
          </div>
          <p className="faint" style={{ fontSize: 13, marginTop: 16 }}>
            Precisa de mais? Pacotes de +100 atendimentos por R$ 29, sem trocar de plano.
          </p>
        </div>
      </section>

      <section className="lp-sec">
        <div className="lp-in lp-faq">
          <h2 className="lp-h2">Perguntas que chegam no balcão</h2>
          <div>
            {FAQ.map(([p, r]) => (
              <details key={p}>
                <summary>{p}</summary>
                <p>{r}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <footer className="lp-foot">
        <div className="lp-in row row-wrap">
          <Logo size={24} />
          <span className="spacer" />
          <Link to="/termos">Termos</Link>
          <Link to="/privacidade">Privacidade</Link>
          <span className="faint">© {new Date().getFullYear()} Helpy</span>
        </div>
      </footer>
    </div>
  );
}
