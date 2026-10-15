# Servidor do Discord no Oracle Cloud (grátis)

O Discord só entrega as mensagens digitadas livremente nos tickets para um
bot que fica **conectado o tempo todo**. As funções do Supabase acordam a
cada chamada e desligam, então esse pedaço roda numa máquina pequena,
sempre ligada, no plano **Always Free** da Oracle.

A máquina não guarda nada do cliente: ela só repassa a mensagem do ticket
para o Helpy (a mesma função do chat), que responde e registra tudo em
Atendimentos. O programa é `gateway/discord-gateway.mjs` e o instalador é
`gateway/instalar-oracle.sh`.

## Antes de começar

- No Supabase (Edge Functions → Secrets) precisam existir:
  - `DISCORD_BOT_TOKEN`: o token do bot (Discord Developer Portal → Bot → Reset Token);
  - `DISCORD_CLIENT_SECRET`: OAuth2 → Client Secret;
  - `DISCORD_GATEWAY_KEY`: uma chave longa e aleatória (a mesma que vai no
    script abaixo). Gere com `openssl rand -hex 32`.
- No Discord Developer Portal → Bot: **Message Content Intent** ligado.

## 1. Criar a conta

1. Acesse **signup.cloud.oracle.com** e crie a conta.
2. Em **Região inicial (Home Region)**, escolha **Brazil East (São Paulo)**
   ou **Brazil Southeast (Vinhedo)**. Não dá para trocar depois.
3. A Oracle pede um cartão só para confirmar a identidade (pode aparecer
   uma cobrança de teste que é devolvida). Os recursos **Always Free** não
   são cobrados.

> **Importante:** na conta só Free, a Oracle pode desligar máquinas que
> ficam "paradas" (pouco uso de processador por 7 dias), e esse bot usa
> quase nada. Para evitar, em **Faturamento → Atualizar conta**, passe para
> **Pay As You Go**. Continua grátis enquanto você usar só o que é Always
> Free; a diferença é que a máquina não é recolhida.

## 2. Criar a máquina

1. Menu ☰ → **Computação → Instâncias → Criar instância**.
2. **Nome:** `helpy-discord`.
3. **Imagem e forma:**
   - Imagem: **Canonical Ubuntu 24.04**.
   - Forma: **VM.Standard.E2.1.Micro** (AMD, "Sempre gratuito"). Se não
     aparecer, use **VM.Standard.A1.Flex** com 1 OCPU e 6 GB (também
     grátis). As duas servem.
4. **Rede:** deixe o padrão (cria a rede com IP público). Não precisa abrir
   porta: a máquina só faz conexões de saída.
5. **Chaves SSH:** escolha **Gerar par de chaves** e baixe a chave privada
   (só é usada se um dia precisar entrar na máquina).
6. Clique em **Mostrar opções avançadas → Gerenciamento → Colar script
   cloud-init** e cole o conteúdo de `gateway/instalar-oracle.sh` com a
   chave no lugar de `COLE_A_CHAVE_AQUI`.
7. **Criar.** Em uns 3 a 5 minutos a máquina liga e instala tudo sozinha.

## 3. Conferir

- No painel do Helpy, em **Canais → Discord**, aparece **"Conversa livre
  ligada"**.
- No servidor do Discord, o `/helpy-config` mostra ✅ na conversa livre.

Se não ligar em 10 minutos, entre na máquina (Instância → **Conectar** pelo
Cloud Shell, ou `ssh -i chave.key ubuntu@IP`) e veja:

```
sudo journalctl -u helpy-gateway -n 50
```

| O que aparece | O que fazer |
|---|---|
| `Helpy ainda sem o token do bot` | Falta `DISCORD_BOT_TOKEN` no Supabase. |
| `O Helpy recusou a chave` | A chave do script é diferente de `DISCORD_GATEWAY_KEY`. Corrija em `/etc/helpy-gateway.env` e rode `sudo systemctl restart helpy-gateway`. |
| `Falta ligar "Message Content Intent"` | Ligue na página Bot do Developer Portal. |

## Como se mantém

- O serviço `helpy-gateway` liga com a máquina e volta sozinho se cair.
- Toda madrugada (04:00 UTC) ele reinicia e baixa a versão mais nova do
  programa do branch `main` do repositório.
- Se a máquina ficar fora do ar, os tickets continuam funcionando pelo
  `/helpy` dentro do tópico, e o painel mostra "Conversa livre desligada".
