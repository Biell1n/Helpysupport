import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

const META = 'https://developers.facebook.com/apps';
const NEGOCIOS = 'https://business.facebook.com/settings/system-users';
const DISCORD = 'https://discord.com/developers/applications';

const A = ({ href, children }) => <a href={href} target="_blank" rel="noreferrer">{children}</a>;

/**
 * Passo a passo de cada canal, do jeito que os botões aparecem no painel
 * da Meta e do Discord. Os passos marcados como "depois" são feitos com os
 * endereços que o Helpy mostra quando a conexão dá certo.
 */
export const GUIAS = {
  whatsapp: {
    tempo: 'uns 15 minutos',
    antes: [
      'Uma conta no Facebook com acesso ao Gerenciador de Negócios da empresa (business.facebook.com).',
      'Um número de telefone que não esteja em uso no aplicativo do WhatsApp (pode ser um número novo ou um fixo que recebe SMS ou ligação). Para testar, a Meta dá um número de teste grátis.',
    ],
    passos: [
      {
        titulo: 'Crie o app na Meta',
        itens: [
          <>Abra o <A href={META}>painel de apps da Meta</A> e clique em <b>Criar app</b>.</>,
          <>Em "O que você quer que o app faça", escolha <b>Outro</b> e depois o tipo <b>Empresa</b>. Dê o nome da sua empresa e vincule ao seu Gerenciador de Negócios.</>,
          <>Na tela do app, encontre <b>WhatsApp</b> na lista de produtos e clique em <b>Configurar</b>.</>,
        ],
      },
      {
        titulo: 'Coloque o número da empresa',
        itens: [
          <>No menu da esquerda, abra <b>WhatsApp → Configuração da API</b>.</>,
          <>Em <b>Etapa 5</b> (ou "Adicionar número de telefone"), cadastre o número e confirme com o código que chega por SMS ou ligação. Se for só testar, use o número de teste que já aparece.</>,
          <>Copie a <b>Identificação do número de telefone</b> e a <b>Identificação da conta do WhatsApp Business</b> que aparecem logo abaixo do número. Você vai colar as duas aqui.</>,
        ],
      },
      {
        titulo: 'Gere o token que não vence',
        itens: [
          <>Abra as <A href={NEGOCIOS}>configurações do negócio → Usuários do sistema</A> e clique em <b>Adicionar</b>. Nome: "Helpy", função: <b>Administrador</b>.</>,
          <>Com o usuário criado, clique em <b>Atribuir ativos</b>, escolha o seu app e marque <b>Controle total</b>.</>,
          <>Clique em <b>Gerar novo token</b>, escolha o app, em validade marque <b>Nunca</b> e selecione as permissões <i>whatsapp_business_messaging</i> e <i>whatsapp_business_management</i>.</>,
          <>Copie o token (ele só aparece uma vez) e cole no campo <b>Token de acesso</b> aqui ao lado.</>,
        ],
      },
      {
        titulo: 'Copie a chave secreta do app',
        itens: [
          <>De volta ao app, abra <b>Configurações do app → Básico</b>, clique em <b>Mostrar</b> na <b>Chave secreta do app</b> e cole em "Usa um app próprio da Meta?". É com ela que o Helpy confere que a mensagem veio mesmo do WhatsApp.</>,
          <>Ainda em Básico, preencha a <b>URL da Política de Privacidade</b> com <code>https://helpysupport.com/privacidade</code> (a Meta pede para o app sair do modo de teste).</>,
        ],
      },
      {
        titulo: 'Clique em Conectar',
        itens: [<>O Helpy confere o número e o token na Meta na hora. Se algo estiver errado, ele diz o quê.</>],
      },
      {
        depois: true,
        titulo: 'Ligue os avisos de mensagem nova',
        itens: [
          <>No app, abra <b>WhatsApp → Configuração</b> e, em Webhook, clique em <b>Editar</b>.</>,
          <>Cole a <b>URL de callback</b> e o <b>Verificar token</b> que o Helpy mostrar depois de conectar e clique em <b>Verificar e salvar</b>.</>,
          <>Em <b>Campos do webhook</b>, clique em <b>Gerenciar</b> e assine <b>messages</b>.</>,
          <>No topo do app, troque o <b>Modo do app</b> de Desenvolvimento para <b>Ao vivo</b>. Pronto: mande um "oi" para o número e veja a resposta.</>,
        ],
      },
    ],
    erros: [
      ['"Passaram mais de 24 horas"', 'Regra do WhatsApp: depois de 24 h sem o cliente escrever, só dá para mandar modelo aprovado. Quando ele escrever de novo, a conversa reabre.'],
      ['Mensagem chega mas ninguém responde', 'Confira se o campo "messages" está assinado, se o app está Ao vivo e se a chave secreta do app foi colada.'],
      ['"Token venceu ou foi revogado"', 'O token gerado direto na Configuração da API vale 24 h. Use o do usuário do sistema, com validade "Nunca".'],
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
    tempo: 'uns 5 minutos',
    antes: ['Ser administrador (ou ter permissão de "Gerenciar servidor") no servidor do Discord onde o bot vai ficar.'],
    passos: [
      {
        titulo: 'Crie o aplicativo',
        itens: [
          <>Abra o <A href={DISCORD}>Discord Developer Portal</A> e clique em <b>New Application</b>. O nome pode ser qualquer um: ao conectar, o Helpy troca o nome e a foto do bot pelos do assistente.</>,
        ],
      },
      {
        titulo: 'Pegue o token do bot',
        itens: [
          <>No menu da esquerda, abra <b>Bot</b> e clique em <b>Reset Token</b> (confirme com a senha ou o código).</>,
          <>Copie o token e cole no campo <b>Token do bot</b> aqui ao lado. Não precisa ligar nenhuma opção de "Intents".</>,
        ],
      },
      {
        titulo: 'Clique em Conectar',
        itens: [<>O Helpy confere o token, cria o comando <b>/helpy</b>, dá ao bot o nome e a foto do assistente e cadastra sozinho o endereço das interações no Discord.</>],
      },
      {
        depois: true,
        titulo: 'Convide o bot para o servidor',
        itens: [
          <>No Helpy, clique em <b>Convidar o bot para um servidor</b> e escolha o servidor.</>,
          <>Só se o Helpy avisar que não conseguiu cadastrar o endereço: no Developer Portal, abra <b>General Information</b>, cole em <b>Interactions Endpoint URL</b> o endereço que o Helpy mostrar e clique em <b>Save Changes</b>.</>,
          <>Teste no servidor: digite <b>/helpy</b>, escreva a pergunta e envie. A resposta aparece só para quem perguntou.</>,
        ],
      },
    ],
    erros: [
      ['O Discord não aceita o endereço', 'Conecte no Helpy primeiro e só depois cole o endereço: ele precisa da chave pública que o Helpy guarda ao conectar.'],
      ['O nome do bot não mudou', 'O Discord deixa trocar o nome de um bot só duas vezes por hora. Espere um pouco e troque o assistente de novo em Canais, ou mude o nome em Bot → Username.'],
      ['/helpy não aparece', 'O comando pode levar alguns minutos para aparecer. Confira se o bot foi convidado com o botão do Helpy (ele já pede a permissão de comandos).'],
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

  return (
    <div className="tutorial">
      {!soDepois && (
        <div className="tutorial-antes">
          <b>Antes de começar</b> <span className="faint">· leva {g.tempo}</span>
          <ul>{g.antes.map((t) => <li key={t}>{t}</li>)}</ul>
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
