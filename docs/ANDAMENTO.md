# Helpy — andamento da reconstrução

Notas de trabalho para quem continuar (pessoa ou sessão do Claude).

## Decisões tomadas

- **Saímos do Hostinger Horizons.** Os plugins do editor visual e o export
  zipado foram removidos. O projeto passa a viver na raiz do repositório.
- **Segredo vazado:** o `.env.local` do export tinha a chave da OpenAI.
  Ela continua no histórico do Git — **revogue no painel da OpenAI**.
- **IA:** Claude. Builder (montar o assistente) em `claude-sonnet-5-5`;
  atendimento em `claude-haiku-4-5`. Troca por variável de ambiente
  (`HELPY_MODEL_BUILDER`, `HELPY_MODEL_ATENDIMENTO`).
- **Planos** (`supabase/functions/_shared/plans.ts`, espelhado em `src/lib/plans.js`):

  | Plano        | R$/mês | Assistentes | Builder com IA | Atendimentos/mês | Tickets abertos |
  |--------------|-------:|------------:|:--------------:|-----------------:|----------------:|
  | Teste (14 d) | 0      | 1           | sim            | 50               | 10              |
  | Essencial    | 79     | 1           | não (formulário) | 200            | 20              |
  | Profissional | 197    | 3           | sim            | 600              | 100             |
  | Business     | 497    | 10          | sim            | 1.500            | sem limite      |

  Cota estourada → o atendente entra em modo "deixe seu recado" (abre
  chamado, custo zero de IA). Cada chamada de IA grava tokens e custo em
  `usage_events`.

- **Auth:** Supabase Auth nativo (e-mail/senha, Google, recuperação de
  senha). As funções `send-*` de código por e-mail do Horizons saem.

## Identidade visual (plano)

- Conceito: a **senha de atendimento** — o papelzinho numerado do balcão.
  Cada conversa ganha um número (Nº 0042) e os chamados aparecem como
  canhotos picotados.
- Cores: tinta `#12302E`, papel `#EEF1EC`, senha `#FFCF33`, folha `#1E7A5A`,
  brasa `#E4572E`, linha `#D6DDD6`.
- Tipos: Bricolage Grotesque (títulos), Onest (texto), Martian Mono (números e rótulos).
- Logo: balão de conversa com os recortes laterais de um canhoto.

## Feito

- [x] Esquema do banco: `supabase/migrations/20261005000000_helpy_schema.sql`
- [x] `_shared/` (cors, db, ai, plans, schema do documento, agenda)
- [x] `assistant-builder-chat` reescrita com Claude + ferramentas

## Falta

- [ ] `public-chat` (atendimento com ferramentas: consultar dados, ver
      horários, agendar, abrir chamado, registrar contato; recado quando
      a cota acaba; modo teste para o dono)
- [ ] Frontend novo: landing com planos, auth, painel, builder (chat +
      formulário), atendimentos (fluxo de chamado com assumir/encerrar/
      reabrir), dados, agenda, plano, conta, chat público
- [ ] README com passo a passo para rodar local e publicar
- [ ] Comparar com as funções que estão hoje no Supabase do Horizons
      (principalmente o prompt do builder) e aproveitar o que for melhor

## Próximos canais (estudo)

WhatsApp (Cloud API da Meta), Telegram e Discord entram como funções de
webhook que chamam o mesmo núcleo de atendimento do `public-chat`.
