# Canais: WhatsApp, Instagram e Discord

O mesmo assistente do link do chat responde nos três canais. As conversas
caem em **Atendimentos** (com o selo do canal), contam no mesmo limite do
plano e seguem as mesmas regras de chamado. Quando alguém da equipe responde
no painel, a resposta sai pelo canal de onde o cliente escreveu.

| Canal     | Plano                     | Como o cliente fala                          |
|-----------|---------------------------|----------------------------------------------|
| Link/site | todos                     | link do chat, QR code                        |
| Discord   | todos                     | ticket privado no servidor (botão "Abrir atendimento") ou `/helpy` |
| WhatsApp  | Profissional (2) e Business (20) | mensagem para o número da empresa     |
| Instagram | Profissional e Business (mesmo limite) | Direct da conta profissional    |

## Como funciona por dentro

- `public.canais`: um registro por conta conectada (assistente, tipo,
  status, id do lado do serviço). O token fica no **Vault**; a tabela só
  guarda o id do segredo. O navegador lê só as colunas públicas.
- `public.canal_eventos`: ids de mensagens já atendidas (a Meta reenvia
  quando a resposta demora). O servidor apaga o que tem mais de 3 dias.
- `supabase/functions/canais`: conectar (confere o token no serviço),
  testar, pausar, trocar de assistente, desconectar e **enviar** (resposta
  da equipe pelo canal).
- Os avisos de mensagem nova chegam no mesmo endereço do chat público:
  - Meta (WhatsApp e Instagram): `…/functions/v1/public-chat?canal=meta`
  - Discord (bot do Helpy): `…/functions/v1/public-chat?discord=helpy`
  - Discord (servidor ligado, mensagens dos tickets): `…?discord=gateway`
  - Discord (bot próprio da empresa, jeito antigo): `…?discord=<id do canal>`
  Cada aviso tem a assinatura conferida (HMAC da Meta / Ed25519 do Discord)
  antes de qualquer coisa. O código está em `_shared/canal-webhook.ts`,
  `_shared/canal-atender.ts` e `_shared/canais.ts`.

## WhatsApp (API oficial da Meta)

Hoje cada empresa conecta com o **próprio app da Meta** (passo a passo na
tela Canais):

1. developers.facebook.com → criar app → produto **WhatsApp**.
2. Copiar a *Identificação do número de telefone* e a da conta do WhatsApp
   Business; gerar um **token permanente** (usuário do sistema com
   `whatsapp_business_messaging` e `whatsapp_business_management`).
3. Colar em Canais → Conectar WhatsApp, junto com a **chave secreta do app**
   (Configurações do app → Básico). A chave é obrigatória enquanto o Helpy
   não tiver o próprio app aprovado: sem ela não dá para conferir a
   assinatura dos avisos.
4. Em WhatsApp → Configuração: URL de callback e "Verificar token" que a tela
   mostra; assinar o campo `messages`.

Regra da Meta: depois de 24 h sem mensagem do cliente, só dá para escrever
para ele com modelo de mensagem aprovado. O painel avisa quando isso
acontece.

### Mais tarde: app do próprio Helpy (Tech Provider)

Para o cliente conectar com um clique ("Entrar com Facebook" / Embedded
Signup), o Helpy precisa do seu próprio app aprovado pela Meta (verificação
da empresa + revisão do app). Quando existir:

- guardar o segredo do app nas variáveis das funções:
  `META_APP_SECRET` (e `INSTAGRAM_APP_SECRET`, se for outro app);
- opcional: `META_VERIFY_TOKEN`, um token fixo para o endereço do webhook;
- configurar o webhook uma vez no app do Helpy com
  `…/functions/v1/public-chat?canal=meta`.

O código já aceita os dois jeitos ao mesmo tempo.

## Instagram

1. A conta precisa ser profissional.
2. No app da Meta: produto **Instagram → API com login do Instagram** →
   gerar token da conta.
3. Colar em Canais → Conectar Instagram (+ chave secreta do app).
4. Configurar webhooks com a URL e o token mostrados; campo `messages`.

## Discord

O Helpy tem **um bot só** para todas as empresas. Em Canais → Conectar
Discord, a empresa escolhe o assistente, adiciona o bot ao servidor e volta
com tudo ligado. No servidor, o bot usa o nome (e a foto) do assistente.

**Comandos**

| Comando | Quem usa | O que faz |
|---|---|---|
| `/helpy-config` | quem tem "Gerenciar servidor" | menu: canal do atendimento, cargo da equipe, o que falta (✅/❌) e publicar o botão |
| botão **Abrir atendimento** ou `/atendimento` | clientes | cria um tópico privado só do cliente, da equipe e do bot |
| `/helpy mensagem:…` | clientes | dúvida rápida (fora do ticket); dentro do ticket vale como mensagem |
| botões **Assumir**, **Devolver ao assistente**, **Encerrar** | equipe (Encerrar: todos) | no topo de cada ticket |

**Permissões que o bot pede** (sem Administrador): ver canais, enviar
mensagens (também em tópicos), criar tópicos privados, gerenciar tópicos,
inserir links, anexar arquivos, ver histórico, gerenciar webhooks e mudar o
próprio apelido.

**Sincronia com o painel**

- Cada ticket é uma conversa em Atendimentos (`contato_externo =
  ticket:<id do tópico>`; tabela `discord_tickets`).
- O cliente escreve no tópico → o assistente responde ali (mesmo cérebro,
  agenda e chamado). Quando o assistente chama a equipe, o cargo é marcado.
- Alguém da equipe escreve no tópico → entra em Atendimentos com o nome
  dela e o assistente para.
- A equipe responde pelo painel → sai no tópico pelo webhook do canal, com
  o nome e a foto de quem respondeu (sem webhook: pelo bot, com o nome em
  negrito).
- Assumir, devolver, encerrar e reabrir pelo painel (lista ou quadro)
  aparecem no tópico; encerrar fecha e tranca o tópico.

**Mensagens livres** precisam do servidor que fica ligado no Discord
(`gateway/`), instalado no Oracle Cloud grátis: veja
[discord/ORACLE.md](discord/ORACLE.md). Sem ele, no ticket o cliente fala
com `/helpy`.

Variáveis das funções: `DISCORD_BOT_TOKEN`, `DISCORD_CLIENT_SECRET`,
`DISCORD_GATEWAY_KEY` (e, opcionais, `DISCORD_APP_ID`,
`DISCORD_PUBLIC_KEY`, `SITE_URL`).

### Bot próprio da empresa (jeito antigo)

Ainda funciona para quem já conectou: token do bot colado em Canais e
endereço `…?discord=<id do canal>`. O cliente usa `/helpy`; a resposta da
equipe vai por mensagem direta.

## Instagram: resposta pelo app

Se alguém da empresa responder direto pelo app do Instagram, a Meta manda
um "eco" da mensagem. O Helpy separa o que ele mesmo mandou (marca o id ao
enviar) do que foi escrito no app: o que veio do app entra em Atendimentos
como "Equipe (pelo app do Instagram)" e o assistente para de responder.
