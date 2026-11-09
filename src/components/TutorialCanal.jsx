import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Clock, Play, Smartphone, UserRound, X } from 'lucide-react';

const ICONES = { conta: <UserRound size={18} />, chip: <Smartphone size={18} />, tempo: <Clock size={18} /> };

const META = 'https://developers.facebook.com/apps';
const NEGOCIOS = 'https://business.facebook.com/settings/system-users';
const GERENCIADOR = 'https://business.facebook.com/wa/manage/phone-numbers';
const CONTAS_WA = 'https://business.facebook.com/settings/whatsapp-business-accounts';

const A = ({ href, children }) => <a href={href} target="_blank" rel="noreferrer">{children}</a>;

/**
 * Passo a passo de cada canal, do jeito que os botões aparecem no painel
 * da Meta e do Discord. Os passos marcados como "depois" são feitos com os
 * endereços que o Helpy mostra quando a conexão dá certo.
 */
export const GUIAS = {
  whatsapp: {
    tempo: 'uns 20 minutos',
    video: '/videos/conectar-whatsapp-1.mp4',
    duracaoVideo: 'parte 1 de 2 · 2 min e 17 s',
    videoDepois: '/videos/conectar-whatsapp-2.mp4',
    duracaoDepois: 'parte 2 de 2 · 1 min',
    antes: [
      { icone: 'conta', titulo: 'Uma conta no Facebook', texto: 'A que administra a página ou o portfólio da empresa na Meta.' },
      {
        icone: 'chip',
        destaque: true,
        titulo: 'Um chip só do atendimento',
        texto: 'Um número que receba SMS e que não seja o seu pessoal. Se ele já teve WhatsApp (comum ou Business), apague a conta antes: o número sai do aplicativo e passa a responder pelo Helpy.',
      },
      { icone: 'tempo', titulo: 'Uns 20 minutos', texto: 'É feito uma vez só. Depois o assistente atende sozinho, 24 horas.' },
    ],
    passos: [
      {
        titulo: 'Tire o chip do WhatsApp',
        itens: [
          <>Se o chip nunca teve WhatsApp, pule este passo.</>,
          <>No celular com o chip, abra o WhatsApp: <b>⋮ → Configurações → Conta → Apagar conta</b>. Confirme o número e espere uns 3 minutos. Sem isso, a Meta não deixa cadastrar o número.</>,
        ],
      },
      {
        titulo: 'Crie o app na Meta',
        itens: [
          <>Abra o <A href={META}>painel de apps da Meta</A> e clique em <b>Criar app</b>. Se aparecer "Começar", faça antes o cadastro de desenvolvedor (entre com o Facebook e escolha "Desenvolvedor").</>,
          <>Nome do app: o da sua empresa (não use as palavras "WhatsApp", "Meta" ou "Facebook", a Meta recusa). O cliente não vê esse nome.</>,
          <>Em <b>Casos de uso</b>, marque só <b>Conectar-se com clientes pelo WhatsApp</b>. Em <b>Empresa</b>, escolha o portfólio da sua empresa (ou crie um) e conclua com <b>Criar app</b>.</>,
          <>Se a Meta pedir um <b>site</b> e a empresa não tiver, use o Instagram da empresa (<code>https://instagram.com/sua_conta</code>) ou o link do chat do assistente (em <b>Assistentes</b>, "Copiar link").</>,
        ],
      },
      {
        titulo: 'Cadastre o chip',
        itens: [
          <>Abra o <A href={GERENCIADOR}>WhatsApp Manager → Números de telefone</A>. No topo, confira se está selecionada a <b>mesma empresa do app</b>.</>,
          <>Clique em <b>Adicionar telefone</b>. Preencha o <b>nome de exibição</b> (o que o cliente vê; a Meta aprova em algumas horas) e o número do chip, com +55 e DDD. Confirme o código do SMS.</>,
          <>Se a Meta pedir "dados da empresa para os novos ativos" ou der erro de política, você está criando uma empresa nova sem querer. Feche e adicione pelo WhatsApp Manager, na empresa do app.</>,
        ],
      },
      {
        titulo: 'Copie os dois números',
        itens: [
          <><b>Identificação do número:</b> no WhatsApp Manager, em <b>Números de telefone</b>, clique no número: a <b>Identificação do número de telefone</b> aparece logo embaixo dele. Cole em "Identificação do número", aqui ao lado.</>,
          <><b>Identificação da conta:</b> abra as <A href={CONTAS_WA}>configurações do negócio</A> → <b>Contas → Contas de mensagens</b>, clique na conta onde o chip entrou e copie a <b>Identificação</b>, embaixo do nome. Cole em "Identificação da conta".</>,
        ],
      },
      {
        titulo: 'Gere o token que não vence',
        itens: [
          <>Abra as <A href={NEGOCIOS}>configurações do negócio → Usuários do sistema</A> e clique em <b>Adicionar</b>. Nome: "Helpy", função: <b>Administrador</b>.</>,
          <>Clique em <b>Atribuir ativos</b> e dê <b>Controle total</b> em dois: o seu <b>app</b> e a <b>conta do WhatsApp onde o chip entrou</b>. Se você criar outra conta depois, atribua essa também.</>,
          <>Clique em <b>Gerar novo token</b>: escolha o app, validade <b>Nunca</b> e as permissões <i>whatsapp_business_messaging</i> e <i>whatsapp_business_management</i>. Copie na hora (ele só aparece uma vez) e cole em <b>Token de acesso</b> aqui ao lado.</>,
          <>Não use o botão "Gerar token" do painel do app: aquele vale só 24 horas.</>,
        ],
      },
      {
        titulo: 'Copie a chave secreta do app',
        itens: [
          <>No app, na barra da esquerda, clique na engrenagem: <b>Configurações do app → Básico</b>.</>,
          <>Em <b>Chave Secreta do Aplicativo</b>, clique em <b>Mostrar</b> e cole no campo <b>Chave secreta do app</b> aqui ao lado. É com ela que o Helpy confere que a mensagem veio mesmo do WhatsApp.</>,
        ],
      },
      {
        titulo: 'Clique em Conectar',
        itens: [
          <>O Helpy confere o número e o token na Meta, ativa o número e põe a foto do assistente no perfil. Se algo estiver errado, ele diz o quê.</>,
          <>Conta do WhatsApp nova? O canal aparece como <b>Aguardando a Meta</b> enquanto ela analisa (de algumas horas a 2 dias). Quando aprovar, o número começa a responder sozinho.</>,
        ],
      },
      {
        depois: true,
        titulo: 'Ligue os avisos de mensagem nova',
        itens: [
          <>No app, abra <b>Casos de uso → Personalizar</b> (ao lado do WhatsApp) <b>→ Etapa 2. Configuração de produção → Configurar webhooks</b>.</>,
          <>Cole a <b>URL de callback</b> e o <b>Verificar token</b> que o Helpy mostra em <b>Canais → Configurar</b> e clique em <b>Verificar e salvar</b>.</>,
          <>Logo abaixo, em <b>Campos do webhook</b>, assine <b>messages</b>.</>,
        ],
      },
      {
        depois: true,
        titulo: 'Publique o app',
        itens: [
          <>Sem publicar, as mensagens dos seus clientes não chegam.</>,
          <>Em <b>Configurações do app → Básico</b>, preencha a <b>URL da Política de Privacidade</b> e a de <b>Exclusão de dados</b>: as duas podem ser a política que o Helpy gera para a sua empresa (o link aparece em <b>Canais → Configurar</b>). Escolha também um <b>ícone</b> e a <b>categoria</b>. Clique em <b>Salvar alterações</b>, no fim da página.</>,
          <>No menu da esquerda, clique em <b>Publicar</b> e confirme. Pronto: mande um "oi" para o número de outro celular e veja a resposta.</>,
        ],
      },
    ],
    erros: [
      ['"Aguardando a Meta"', 'A conta do WhatsApp é nova e a Meta ainda está analisando. Não precisa fazer nada: quando ela aprovar, o número liga sozinho.'],
      ['A Meta não deixa cadastrar o número', 'O chip ainda tem WhatsApp. Apague a conta no celular (Configurações → Conta → Apagar conta), espere uns minutos e tente de novo.'],
      ['Erro de política ao adicionar o número', 'Você estava criando uma empresa nova. Feche, abra o WhatsApp Manager na empresa do app e adicione o número por lá.'],
      ['"O token não tem acesso a este número"', 'Em Usuários do sistema → Helpy → Atribuir ativos, dê Controle total na conta do WhatsApp onde o chip entrou. Não precisa gerar outro token.'],
      ['Mensagem chega mas ninguém responde', 'Confira se o campo "messages" está assinado, se o app está publicado e se a chave secreta do app foi colada.'],
      ['"Passaram mais de 24 horas"', 'Regra do WhatsApp: depois de 24 h sem o cliente escrever, só dá para responder quando ele escrever de novo.'],
    ],
  },

  instagram: {
    tempo: 'uns 10 minutos',
    video: '/videos/conectar-instagram-1.mp4',
    duracaoVideo: 'parte 1 de 2 · 1 min e 25 s',
    videoDepois: '/videos/conectar-instagram-2.mp4',
    duracaoDepois: 'parte 2 de 2 · 1 min',
    antes: [
      'A conta do Instagram precisa ser profissional (Comercial ou Criador de conteúdo). Dá para mudar em Configurações → Tipo de conta e ferramentas.',
      'No app do Instagram: Configurações → Mensagens e respostas ao story → Ferramentas conectadas → ative "Permitir acesso às mensagens".',
    ],
    passos: [
      {
        titulo: 'Crie o app na Meta',
        itens: [
          <>Abra o <A href={META}>painel de apps da Meta</A> e clique em <b>Criar app</b>. Dê o nome da empresa e clique em <b>Avançar</b>.</>,
          <>Em <b>Casos de uso</b>, filtre por <b>Gerenciamento de conteúdo</b> e marque <b>Gerenciar mensagens e conteúdo no Instagram</b>. Escolha o portfólio da empresa e conclua com <b>Criar app</b>.</>,
          <>No painel do app, clique em <b>Personalizar</b> no caso de uso do Instagram e abra <b>Configuração da API com login do Instagram</b>. Se aparecer <b>Adicionar todas as permissões necessárias</b>, clique.</>,
        ],
      },
      {
        titulo: 'Gere o token da conta',
        itens: [
          <>Em <b>Gerar tokens de acesso</b>, clique em <b>Adicionar conta</b> e entre com o Instagram da empresa.</>,
          <>Clique em <b>Gerar token</b> ao lado da conta e copie. Cole no campo <b>Token de acesso</b> aqui ao lado.</>,
        ],
      },
      {
        titulo: 'Copie a chave secreta',
        itens: [
          <>No topo da mesma página, clique em <b>Mostrar</b> na <b>Chave secreta do app do Instagram</b>, copie e cole no campo de mesmo nome aqui ao lado. (É diferente da chave em Configurações do app.)</>,
        ],
      },
      {
        titulo: 'Clique em Conectar',
        itens: [<>O Helpy confere a conta e já liga os avisos de mensagem do Direct.</>],
      },
      {
        depois: true,
        titulo: 'Ligue os avisos no app',
        itens: [
          <>Na mesma página do Instagram no app, em <b>Configurar webhooks</b>, cole a <b>URL de callback</b> e o <b>Verificar token</b> que o Helpy mostra em <b>Canais → Configurar</b> e clique em <b>Verificar e salvar</b>.</>,
          <>Assine o campo <b>messages</b>.</>,
        ],
      },
      {
        depois: true,
        titulo: 'Peça a liberação e publique',
        itens: [
          <>Em <b>Configurações do app → Básico</b>, cole a política que o Helpy gera para a sua empresa (em <b>Canais → Configurar</b>) na <b>URL da Política de Privacidade</b> e na de <b>Exclusão de dados</b>. Salve.</>,
          <>Em <b>Revisão do app</b>, solicite <i>instagram_business_manage_messages</i>. A Meta pede a <b>verificação da empresa</b> e uma gravação de tela do atendimento; a análise leva alguns dias.</>,
          <>Quando aprovar, clique em <b>Publicar</b>, no menu da esquerda. Até lá, o assistente já responde quem está em <b>Funções do app → Testadores</b>: dá para testar com a sua própria conta.</>,
        ],
      },
    ],
    erros: [
      ['Mensagem não chega no Helpy', 'Confira "Permitir acesso às mensagens" no app do Instagram e se o campo "messages" está assinado no webhook.'],
      ['Só responde para mim', 'A Meta ainda não liberou a permissão de mensagens ou o app não foi publicado. Até lá, só quem é testador do app recebe resposta.'],
    ],
  },

  discord: {
    tempo: 'uns 2 minutos',
    video: '/videos/conectar-discord.mp4',
    duracaoVideo: '1 min e 12 s',
    antes: ['Ser administrador (ou ter "Gerenciar servidor") no servidor do Discord onde o assistente vai atender.'],
    passos: [
      { titulo: 'Escolha o assistente', itens: [<>Ele vai atender no servidor com o próprio nome.</>] },
      { titulo: 'Adicione o bot do Helpy', itens: [<>O Discord abre: escolha o servidor e clique em <b>Autorizar</b>.</>] },
      {
        depois: true,
        titulo: 'Configure os tickets no Discord',
        itens: [
          <>No servidor, digite <b>/helpy-config</b> (só quem administra vê esse comando).</>,
          <>Jeito mais rápido: clique em <b>⚡ Montar tudo pra mim</b>. O bot mostra o que vai criar: a categoria <b>Atendimento</b>, o canal <b>#abrir-atendimento</b> (com o botão), o canal <b>#equipe-atendimento</b> (só a equipe vê os avisos) e o cargo <b>Equipe de atendimento</b>.</>,
          <>Se ele pedir, clique em <b>Dar permissões para montar</b> e autorize no Discord. Depois clique em <b>⚡ Criar agora</b>: ele cria tudo com as permissões certas e já publica o botão <b>Abrir atendimento</b>.</>,
          <>Por fim, dê o cargo <b>Equipe de atendimento</b> para quem atende: clique no nome da pessoa, no <b>+</b> e escolha o cargo.</>,
          <>Prefere do seu jeito? Escolha nos menus o canal do atendimento, o cargo da equipe e o canal de avisos, ou abra o <b>📋 Passo a passo</b>, que explica o que criar e quais permissões marcar.</>,
          <>Montando do seu jeito, o menu mostra com ✅ e ❌ o que está faltando. Quando estiver tudo certo, clique em <b>Publicar o botão</b>: o cliente clica em <b>Abrir atendimento</b> e conversa com o assistente num tópico privado.</>,
        ],
      },
    ],
    erros: [
      ['/helpy-config não aparece', 'Da primeira vez os comandos podem levar alguns minutos. Ele só aparece para quem tem "Gerenciar servidor".'],
      ['"Falta permissão para criar tópicos privados"', 'Abra o /helpy-config e clique em "Dar permissões ao bot", ou libere "Criar tópicos privados" e "Gerenciar tópicos" para o bot no canal.'],
      ['A equipe não vê os tickets', 'O cargo da equipe precisa de "Gerenciar tópicos" no canal do atendimento para ver todos os tópicos privados.'],
      ['O servidor não aparece na lista do Discord', 'Você precisa ser administrador do servidor (ou ter "Gerenciar servidor").'],
    ],
  },
};

function Passo({ n, passo, aberto, onAlternar }) {
  return (
    <li className="tutorial-passo" data-aberto={aberto || undefined} data-depois={passo.depois || undefined}>
      <button type="button" className="tutorial-passo-topo" onClick={onAlternar} aria-expanded={aberto}>
        <span className="tutorial-n">{n}</span>
        <span className="tutorial-titulo">{passo.titulo}</span>
        {passo.depois && <span className="tutorial-depois">depois de conectar</span>}
        <ChevronDown size={16} className="tutorial-seta" />
      </button>
      {aberto && (
        <ul className="tutorial-itens">
          {passo.itens.map((it, i) => <li key={i}>{it}</li>)}
        </ul>
      )}
    </li>
  );
}

/** O guia completo de um canal: o que ter antes, os passos e os erros mais comuns. */
/**
 * O vídeo do passo a passo. Abre grande, por cima de tudo (dentro da janela de
 * conectar ele ficaria pequeno demais para ler as legendas).
 */
export function VideoTutorial({ tipo, depois = false }) {
  const g = GUIAS[tipo];
  const src = depois ? g?.videoDepois : g?.video;
  const duracao = depois ? g?.duracaoDepois : g?.duracaoVideo;
  const [video, setVideo] = useState(false);
  useEffect(() => {
    if (!video) return undefined;
    const esc = (e) => e.key === 'Escape' && setVideo(false);
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [video]);
  if (!src) return null;
  return (
    <>
      <button type="button" className="tutorial-video-btn" onClick={() => setVideo(true)}>
        <span className="tutorial-play" aria-hidden="true"><Play size={14} fill="currentColor" /></span>
        Ver o passo a passo em vídeo <span className="faint">· {duracao}</span>
      </button>
      {video && createPortal(
        <div className="video-grande" role="dialog" aria-modal="true" aria-label="Vídeo do passo a passo" onMouseDown={(e) => e.target === e.currentTarget && setVideo(false)}>
          <div className="video-grande-caixa">
            <button type="button" className="video-grande-x" aria-label="Fechar o vídeo" onClick={() => setVideo(false)}><X size={20} /></button>
            <video src={src} poster={src.replace('.mp4', '.jpg')} controls autoPlay playsInline />
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

export default function TutorialCanal({ tipo, soDepois = false }) {
  const g = GUIAS[tipo];
  const passos = g.passos.map((p, i) => ({ ...p, n: i + 1 })).filter((p) => !soDepois || p.depois);
  const [aberto, setAberto] = useState(() => new Set([passos[0]?.n]));
  const alternar = (n) => setAberto((s) => {
    const novo = new Set(s);
    if (novo.has(n)) novo.delete(n);
    else novo.add(n);
    return novo;
  });

  const itensAntes = g.antes.map((a) => (typeof a === 'string' ? { texto: a } : a));

  return (
    <div className="tutorial">
      {!soDepois && (
        <div className="tutorial-precisa">
          <div className="tutorial-precisa-topo">
            <b>Antes de começar, separe</b>
            <span className="faint">leva {g.tempo}</span>
          </div>
          <ul>
            {itensAntes.map((a) => (
              <li key={a.titulo ?? a.texto} data-destaque={a.destaque || undefined}>
                {a.icone && <span className="tutorial-precisa-ico" aria-hidden="true">{ICONES[a.icone]}</span>}
                <span>{a.titulo && <b>{a.titulo}</b>}{a.texto}</span>
              </li>
            ))}
          </ul>
          <VideoTutorial tipo={tipo} />
        </div>
      )}
      {soDepois && g.videoDepois && <div style={{ marginBottom: 12 }}><VideoTutorial tipo={tipo} depois /></div>}
      <ol className="tutorial-passos">
        {passos.map((p) => <Passo key={p.n} n={p.n} passo={p} aberto={aberto.has(p.n)} onAlternar={() => alternar(p.n)} />)}
      </ol>
      {!soDepois && (
        <details className="tutorial-erros">
          <summary>Deu algum erro?</summary>
          <dl>
            {g.erros.map(([t, d]) => (
              <div key={t}><dt>{t}</dt><dd>{d}</dd></div>
            ))}
          </dl>
        </details>
      )}
    </div>
  );
}
