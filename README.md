# Helpy

Plataforma para pequenos negócios montarem um **atendente virtual conversando**. O atendente responde clientes por um link, consulta planilhas do negócio, marca horários na agenda e abre chamados para a equipe quando precisa de gente.

- **Frontend:** React + Vite (pasta `src/`)
- **Backend:** Supabase — banco Postgres com RLS (`supabase/migrations/`) e edge functions em Deno (`supabase/functions/`)
- **IA:** Claude (Anthropic). Montagem em `claude-sonnet-5-5`, atendimento em `claude-haiku-4-5`

## Rodar no seu computador

Você precisa do [Node.js 20 ou mais novo](https://nodejs.org/) instalado.

```bash
# 1. baixar o projeto
git clone https://github.com/biell1n/helpysupport.git
cd helpysupport

# 2. instalar as dependências
npm install

# 3. criar o arquivo de configuração
cp .env.example .env.local      # no Windows: copy .env.example .env.local
```

Abra o `.env.local` e preencha com os dados do Supabase (Supabase → Project Settings → API):

```
VITE_SUPABASE_URL=https://cdscurcwcyzeagincjdv.supabase.co
VITE_SUPABASE_ANON_KEY=a chave "anon" ou "publishable"
```

```bash
# 4. rodar
npm run dev
```

Abra **http://localhost:5173**. O site roda no seu computador e conversa com o banco e as funções que estão no Supabase.

## Configurar o Supabase (uma vez)

1. **Banco:** rode `supabase/migrations/20261005000000_helpy_schema.sql` no SQL Editor (no projeto atual isto já foi feito; as tabelas antigas do Horizons estão guardadas no esquema `legado`).
2. **Chave da IA:** em Supabase → Edge Functions → Secrets, adicione `ANTHROPIC_API_KEY` com a sua chave de https://console.anthropic.com.
3. **Funções:** publique `assistant-builder-chat` e `public-chat`:
   ```bash
   npx supabase login
   npx supabase link --project-ref cdscurcwcyzeagincjdv
   npx supabase functions deploy assistant-builder-chat
   npx supabase functions deploy public-chat --no-verify-jwt
   ```
4. **Login:** em Authentication → URL Configuration, coloque `http://localhost:5173` (e depois o seu domínio) em *Site URL* e *Redirect URLs*. Para "Entrar com Google", ative o provedor Google em Authentication → Providers.

## Planos e limites

Definidos em `supabase/functions/_shared/plans.ts` e espelhados em `src/lib/plans.js` (mude os dois juntos). Para mudar o plano de um cliente enquanto o pagamento não está integrado:

```sql
update profiles set plan = 'profissional' where id = 'ID-DO-USUARIO';
-- pacote extra de atendimentos
update profiles set creditos_extra = creditos_extra + 100 where id = 'ID-DO-USUARIO';
```

O custo real de IA de cada cliente fica em `usage_events` (tokens e US$ por chamada).

## Trocar o modelo de IA

Variáveis de ambiente das funções (Edge Functions → Secrets):

- `HELPY_MODEL_BUILDER` — padrão `claude-sonnet-5-5`
- `HELPY_MODEL_ATENDIMENTO` — padrão `claude-haiku-4-5`

## Estrutura

```
src/
  pages/            telas (Landing, Painel, builder/, Atendimentos, Dados, Agenda, Plano, ChatPublico…)
  components/       Logo, AppShell (barra lateral), Modal, Toasts
  lib/              cliente Supabase, planos, cálculo do documento
  styles/           base.css (identidade), app.css (painel), landing.css
supabase/
  migrations/       esquema do banco
  functions/
    _shared/        núcleo: IA, planos, documento do assistente, agenda, atendimento
    assistant-builder-chat/   monta o assistente conversando
    public-chat/              atende os clientes pelo link /c/:token
docs/ANDAMENTO.md   decisões e próximos passos
```
