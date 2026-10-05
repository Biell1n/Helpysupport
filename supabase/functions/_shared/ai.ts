// ============================================================
// Cliente do Claude, escolha de modelo e cálculo de custo.
//
// Trocar de modelo é mudar uma linha aqui (ou as variáveis de ambiente
// HELPY_MODEL_BUILDER / HELPY_MODEL_ATENDIMENTO).
// ============================================================

import Anthropic from 'npm:@anthropic-ai/sdk@^0.131.0';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

export const MODELS = {
  // Montar o assistente pede qualidade e acontece poucas vezes.
  builder: Deno.env.get('HELPY_MODEL_BUILDER') ?? 'claude-sonnet-5-5',
  // Atendimento é o grosso do volume: modelo rápido e barato.
  atendimento: Deno.env.get('HELPY_MODEL_ATENDIMENTO') ?? 'claude-haiku-4-5',
};

// US$ por milhão de tokens: entrada, saída, leitura de cache, escrita de cache (5 min)
const PRICES: Record<string, [number, number, number, number]> = {
  'claude-haiku-4-5': [1, 5, 0.1, 1.25],
  'claude-sonnet-5-5': [2, 10, 0.2, 2.5],
  'claude-opus-5-5': [4, 20, 0.2, 5],
};

export const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') });

export interface UsageTotals {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

export const emptyUsage = (): UsageTotals => ({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });

export function addUsage(t: UsageTotals, u: Anthropic.Usage | Anthropic.Beta.BetaUsage | undefined) {
  if (!u) return;
  t.input += u.input_tokens ?? 0;
  t.output += u.output_tokens ?? 0;
  t.cacheRead += u.cache_read_input_tokens ?? 0;
  t.cacheWrite += u.cache_creation_input_tokens ?? 0;
}

export function costUsd(model: string, t: UsageTotals): number {
  const p = PRICES[model] ?? PRICES['claude-sonnet-5-5'];
  return (t.input * p[0] + t.output * p[1] + t.cacheRead * p[2] + t.cacheWrite * p[3]) / 1_000_000;
}

export async function logUsage(
  db: SupabaseClient,
  ownerId: string,
  assistantId: string | null,
  kind: 'builder' | 'atendimento',
  model: string,
  t: UsageTotals,
) {
  const { error } = await db.from('usage_events').insert({
    owner_id: ownerId,
    assistant_id: assistantId,
    kind,
    model,
    input_tokens: t.input,
    output_tokens: t.output,
    cache_read_tokens: t.cacheRead,
    cache_write_tokens: t.cacheWrite,
    cost_usd: costUsd(model, t),
  });
  if (error) console.error('[usage]', error.message);
}

export const textOf = (content: Array<{ type: string; text?: string }>) =>
  content
    .filter((b) => b.type === 'text')
    .map((b) => b.text ?? '')
    .join('\n')
    .trim();
