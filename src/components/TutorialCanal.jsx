import { useState } from 'react';
import { ChevronDown, Clock, Play, Smartphone, UserRound } from 'lucide-react';

const ICONES = { conta: <UserRound size={18} />, chip: <Smartphone size={18} />, tempo: <Clock size={18} /> };

const META = 'https://developers.facebook.com/apps';
const NEGOCIOS = 'https://business.facebook.com/settings/system-users';

const A = ({ href, children }) => <a href={href} target="_blank" rel="noreferrer">{children}</a>;

/**
 * Passo a passo de cada canal, do jeito que os botões aparecem no painel
 * da Meta e do Discord. Os passos marcados como "depois" são feitos com os
 * endereços que o Helpy mostra quando a conexão dá certo.
 */
export const GUIAS = {
  whatsapp: {
    tempo: 'uns 15 minutos',
    video: '/videos/conectar-whatsapp.mp4',
    antes: [
      { icone: 'conta', titulo: 'Uma conta no Facebook', texto: 'Com acesso ao portfólio da empresa (business.facebook.com).' },
      {
        icone: 'chip',
        destaque: true,
        titulo: 'Um número só do atendimento',
        texto: 'Chip novo ou telefone fixo que receba SMS ou ligação. Ele não pode estar no WhatsApp do celular: o número que vai para o Helpy sai do aplicativo. Não use o seu número pessoal.',
      },
      { icone: 'tempo', titulo: 'Uns 15 minutos', texto: 'É feito uma vez só. Depois o assistente atende sozinho, 24 horas.' },
    ],
    passos: [
      {
        titulo: 'Crie o app na Meta',
        itens: [
          <>Abra o <A href={META}>painel de apps da Meta</A> e clique em <b>Criar app</b>. Se aparecer "Começar", faça antes o cadastro de desenvolvedor (entre com o Facebook e escolha "Desenvolvedor").</>,
          <>Nome do app: o da sua empresa (não use as palavras "WhatsApp", "Meta" ou "Facebook", a Meta recusa). O cliente não vê esse nome.</>,
          <>Em <b>Casos de uso</b>, marque só <b>Conectar-se com clientes pelo WhatsApp</b>. Em <b>Empresa</b>, escolha o portfólio da sua empresa (ou crie um) e conclua com <b>Criar app</b>.</>,
        ],
      },
      {
        titulo: 'Pegue os dois números do WhatsApp',
        itens: [
          <>No app, clique no lápis (<b>Casos de uso</b>) e em <b>Personalizar</b> ao lado de "Conectar-se com clientes pelo WhatsApp".</>,
          <>Para testar: em <b>Etapa 1. Experimente</b> aparece o número de teste. Copie o <b>Phone Number ID</b> (vai em "Identificação do número") e a <b>Identificação da conta de mensagens</b> (vai em "Identificação da conta").</>,
          <>Para o número da empresa: em <b>Etapa 2 → Registre seu número de telefone</b>, cadastre o número, escolha o <b>nome de exibição</b> (o nome que o cliente vê, a Meta aprova) e confirme o código. Depois copie os dois números dele.</>,
        ],
      },
      {
        titulo: 'Gere o token que não vence',
        itens: [
          <>Não use o botão "Gerar token" da Etapa 1: aquele vale só 24 horas e cai quando você gera outro.</>,
          <>Abra as <A href={NEGOCIOS}>configurações do negócio → Usuários do sistema</A> e clique em <b>Adicionar</b>. Nome: "Helpy", função: <b>Administrador</b>.</>,
          <>Clique em <b>Atribuir ativos</b> e dê <b>Controle total</b> em dois: o seu <b>app</b> e a sua <b>conta do WhatsApp</b>.</>,
          <>Clique em <b>Gerar novo token</b>: escolha o app, validade <b>Nunca</b> e as permissões <i>whatsapp_business_messaging</i> e <i>whatsapp_business_management</i>. Copie na hora (ele só aparece uma vez) e cole em <b>Token de acesso</b> aqui ao lado.</>,
        ],
      },
      {
        titulo: 'Copie a chave secreta do app',
        itens: [
          <>Na barra de ícones da esquerda do app, clique na engrenagem: <b>Configurações do app → Básico</b>.</>,
          <>Em <b>Chave Secreta do Aplicativo</b>, clique em <b>Mostrar</b> e cole no campo <b>Chave secreta do app</b> aqui ao lado. É com ela que o Helpy confere que a mensagem veio mesmo do WhatsApp.</>,
        ],
      },
      {
        titulo: 'Clique em Conectar',
        itens: [<>O Helpy confere o número e o token na Meta na hora e põe a foto do assistente no perfil do número. Se algo estiver errado, ele diz o quê.</>],
      },
      {
        depois: true,
        titulo: 'Ligue os avisos de mensagem nova',
        itens: [
          <>No app, volte em <b>Casos de uso → Personalizar → Etapa 2. Configuração da produção → Configurar webhooks</b>.</>,
          <>Cole a <b>URL de callback</b> e o <b>Verificar token</b> que o Helpy mostra (botões de copiar) e clique em <b>Verificar e salvar</b>.</>,
          <>Logo abaixo, em <b>Campos do webhook</b>, assine <b>messages</b>.</>,
        ],
      },
      {
        depois: true,
        titulo: 'Publique o app',
        itens: [
          <>Sem publicar, a Meta só manda mensagens de teste e as dos seus clientes não chegam.</>,
          <>Em <b>Configurações do app → Básico</b>, preencha a <b>URL da Política de Privacidade</b> e a dos <b>Termos de Serviço</b> (as do seu site; se não tiver, use <code>https://helpysupport.com/privacidade</code> e <code>https://helpysupport.com/termos</code>), a <b>exclusão de dados</b> (a mesma URL da política), um <b>ícone</b> e a <b>categoria</b>. Clique em <b>Salvar alterações</b>, no fim da página.</>,
          <>No menu da esquerda, clique em <b>Publicar</b> e confirme. Pronto: mande um "oi" para o número e veja a resposta.</>,
        ],
      },
    ],
    erros: [
      ['"Passaram mais de 24 horas"', 'Regra do WhatsApp: depois de 24 h sem o cliente escrever, só dá para mandar modelo aprovado. Quando ele escrever de novo, a conversa reabre.'],
      ['Mensagem chega mas ninguém responde', 'Confira se o campo "messages" está assinado, se o app está publicado e se a chave secreta do app foi colada.'],
      ['"Token venceu ou foi revogado"', 'Foi usado o token de 24 horas da Etapa 1. Gere o do usuário do sistema, com validade "Nunca", e conecte de novo com ele (os mesmos números atualizam o canal que já existe).'],
      ['"Restricted from messaging users in this country"', 'O número de teste da Meta não começa conversa com números do Brasil. Não atrapalha o Helpy: é o cliente que manda a primeira mensagem.'],
    ],
  },

  instagram: {
    tempo: 'uns 10 minutos',
    antes: [
      'A conta do Instagram precisa ser profissional (Comercial ou Criador de conteúdo). Dá para mudar em Configurações → Tipo de conta e ferramentas.',
      'No app do Instagram: Configurações → Mensagens e respostas ao story → Ferramentas conectadas → ative "Permitir acesso às mensagens".',
    ],
    passos: [
      {
        titulo: 'Crie o app na Meta',
        itens: [
          <>Abra o <A href={META}>painel de apps da Meta</A>, clique em <b>Criar app</b>, escolha <b>Outro</b> e o tipo <b>Empresa</b>. (Se já criou um para o WhatsApp, pode usar o mesmo.)</>,
          <>Na lista de produtos, clique em <b>Configurar</b> no <b>Instagram</b> e escolha <b>API com login do Instagram</b>.</>,
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
          <>Na mesma página (Configuração da API com login do Instagram), copie a <b>Chave secreta do app do Instagram</b> e cole em "Usa um app próprio da Meta?".</>,
          <>Em <b>Configurações do app → Básico</b>, preencha a URL da Política de Privacidade com <code>https://helpysupport.com/privacidade</code>.</>,
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
          <>Na página do Instagram no app, em <b>Configurar webhooks</b>, cole a <b>URL de callback</b> e o <b>Verificar token</b> que o Helpy mostrar e clique em <b>Verificar e salvar</b>.</>,
          <>Assine o campo <b>messages</b>.</>,
          <>Troque o <b>Modo do app</b> para <b>Ao vivo</b>. Para atender qualquer pessoa (não só quem é testador do app), a Meta pede a revisão da permissão <i>instagram_business_manage_messages</i>; enquanto ela não sai, teste com a sua própria conta.</>,
        ],
      },
    ],
    erros: [
      ['Mensagem não chega no Helpy', 'Confira "Permitir acesso às mensagens" no app do Instagram e se o campo "messages" está assinado no webhook.'],
      ['Só responde para mim', 'O app ainda está em modo de teste ou sem a revisão da permissão de mensagens. Peça a revisão na Meta.'],
    ],
  },

  discord: {
    tempo: 'uns 2 minutos',
    antes: ['Ser administrador (ou ter "Gerenciar servidor") no servidor do Discord onde o assistente vai atender.'],
    passos: [
      { titulo: 'Escolha o assistente', itens: [<>Ele vai atender no servidor com o próprio nome.</>] },
      { titulo: 'Adicione o bot do Helpy', itens: [<>O Discord abre: escolha o servidor e clique em <b>Autorizar</b>.</>] },
      {
        depois: true,
        titulo: 'Configure os tickets no Discord',
        itens: [
          <>No servidor, digite <b>/helpy-config</b> (só quem administra vê esse comando).</>,
          <>Jeito mais rápido: clique em <b>⚡ Montar tudo pra mim</b>. O bot cria a categoria <b>Atendimento</b>, o canal <b>#abrir-atendimento</b> (com o botão), o canal <b>#equipe-atendimento</b> (só a equipe vê os avisos) e o cargo <b>Equipe de atendimento</b>, tudo com as permissões certas. Depois é só dar o cargo para quem atende.</>,
          <>Prefere do seu jeito? Escolha nos menus o canal do atendimento, o cargo da equipe e o canal de avisos, ou abra o <b>📋 Passo a passo</b>, que explica o que criar e quais permissões marcar.</>,
          <>O menu mostra com ✅ e ❌ o que está faltando. Quando estiver tudo certo, clique em <b>Publicar o botão</b>: o cliente clica em <b>Abrir atendimento</b> e conversa com o assistente num tópico privado.</>,
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

  const [video, setVideo] = useState(false);
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
          {g.video && (
            video ? (
              <video className="tutorial-video" src={g.video} poster={g.video.replace('.mp4', '.jpg')} controls autoPlay playsInline />
            ) : (
              <button type="button" className="tutorial-video-btn" onClick={() => setVideo(true)}>
                <span className="tutorial-play" aria-hidden="true"><Play size={14} fill="currentColor" /></span>
                Ver o passo a passo em vídeo <span className="faint">· 1 min e meio</span>
              </button>
            )
          )}
        </div>
      )}
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
