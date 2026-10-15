# Canais: WhatsApp, Instagram e Discord

O mesmo assistente do link do chat responde nos três canais. As conversas
caem em **Atendimentos** (com o selo do canal), contam no mesmo limite do
plano e seguem as mesmas regras de chamado. Quando alguém da equipe responde
no painel, a resposta sai pelo canal de onde o cliente escreveu.

| Canal     | Plano                     | Como o cliente fala                          |
|-----------|---------------------------|----------------------------------------------|
| Link/site | todos                     | link do chat, QR code                        |
| Discord   | todos                     | comando `/helpy` no servidor ou na DM do bot |
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
  - Discord: `…/functions/v1/public-chat?discord=<id do canal>`
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
   (Configurações do app → Básico).
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

1. discord.com/developers/applications → novo aplicativo.
2. Bot → Reset Token → copiar.
3. Colar em Canais → Conectar Discord. O Helpy confere o token, pega a chave
   pública e registra o comando `/helpy`.
4. General Information → **Interactions Endpoint URL**: colar o endereço que
   a tela mostra e salvar (o Discord testa na hora).
5. Convidar o bot pelo botão da tela.

O cliente usa `/helpy mensagem:...`; a resposta aparece só para ele. Quando
a equipe responde pelo painel, o bot manda mensagem direta.
