// ============================================================
// Fontes de dados externas e relatórios.
//
//   previa_url      → baixa a planilha do link e mostra as primeiras linhas
//   sincronizar_url → copia a planilha do link para a tabela
//   testar_api      → chama a API do sistema e mostra o que veio
//   assuntos        → agrupa o que os clientes perguntaram (IA, guardado por 6 h)
// ============================================================

import { corsHeaders, json, UserError } from '../_shared/cors.ts';
import { admin, requireUser } from '../_shared/db.ts';
import { addUsage, anthropic, emptyUsage, logUsage, MODELS } from '../_shared/ai.ts';
import { type ApiConfig, baixarCsv, consultarApi, sincronizarUrl } from '../_shared/fontes.ts';

const VALIDADE_ASSUNTOS_MS = 6 * 60 * 60 * 1000;

async function tabelaDoDono(userId: string, tabelaId: string) {
  const { data } = await admin.from('tabelas').select('id').eq('id', tabelaId).eq('owner_id', userId).maybeSingle();
  if (!data) throw new UserError('Tabela não encontrada.', 404);
}

function configDe(bruta: unknown): ApiConfig {
  const c = (bruta ?? {}) as Record<string, unknown>;
  const s = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max);
  return {
    url: s(c.url, 2000),
    header_nome: s(c.header_nome, 60),
    header_valor: String(c.header_valor ?? '').slice(0, 4000),
    param_busca: s(c.param_busca, 60),
    caminho: s(c.caminho, 120),
  };
}

interface Assunto {
  assunto: string;
  exemplo: string;
  vezes: number;
}

async function agruparAssuntos(userId: string, dias: number): Promise<{ assuntos: Assunto[]; amostra: number }> {
  const { data, error } = await admin.rpc('helpy_primeiras_perguntas', { dono: userId, dias });
  if (error) throw error;
  const perguntas = (data ?? []) as Array<{ conversa: string; texto: string }>;
  if (perguntas.length < 3) return { assuntos: [], amostra: perguntas.length };

  const lista = perguntas.map((p, i) => `${i + 1}. ${p.texto.replace(/\s+/g, ' ')}`).join('\n');
  const usage = emptyUsage();
  const res = await anthropic.messages.create({
    model: MODELS.atendimento,
    max_tokens: 4000,
    system:
      'Você organiza o que clientes perguntaram a um atendente virtual. Agrupe as mensagens por assunto ' +
      '(o que a pessoa queria saber ou resolver), em português do Brasil. Nomes de assunto curtos e concretos, ' +
      'como "Preço do corte masculino" ou "Prazo de entrega", nunca genéricos como "Dúvidas". ' +
      'Entre 3 e 12 assuntos. Mensagens sem assunto claro ficam de fora. Cada número entra em no máximo um assunto.',
    tools: [{
      name: 'registrar_assuntos',
      description: 'Registra os assuntos e quais mensagens (pelos números) pertencem a cada um.',
      input_schema: {
        type: 'object',
        properties: {
          assuntos: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                assunto: { type: 'string' },
                mensagens: { type: 'array', items: { type: 'integer' } },
              },
              required: ['assunto', 'mensagens'],
            },
          },
        },
        required: ['assuntos'],
      },
    }],
    tool_choice: { type: 'tool', name: 'registrar_assuntos' },
    messages: [{ role: 'user', content: `Mensagens dos clientes:\n\n${lista}` }],
  });
  addUsage(usage, res.usage);
  await logUsage(admin, userId, null, 'atendimento', MODELS.atendimento, usage);

  const bloco = res.content.find((b) => b.type === 'tool_use');
  const brutos = ((bloco?.type === 'tool_use' ? bloco.input : {}) as { assuntos?: Array<{ assunto: string; mensagens: number[] }> })
    .assuntos ?? [];
  const usados = new Set<number>();
  const assuntos: Assunto[] = [];
  for (const a of brutos) {
    const nums = [...new Set((a.mensagens ?? []).map(Number))]
      .filter((n) => Number.isInteger(n) && n >= 1 && n <= perguntas.length && !usados.has(n));
    nums.forEach((n) => usados.add(n));
    if (!nums.length || !String(a.assunto ?? '').trim()) continue;
    assuntos.push({ assunto: String(a.assunto).trim().slice(0, 80), exemplo: perguntas[nums[0] - 1].texto, vezes: nums.length });
  }
  assuntos.sort((a, b) => b.vezes - a.vezes);
  return { assuntos: assuntos.slice(0, 12), amostra: perguntas.length };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const user = await requireUser(req);
    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? '');

    if (action === 'previa_url') {
      const { cabecalho, linhas } = await baixarCsv(String(body.url ?? ''));
      return json({ cabecalho, linhas: linhas.slice(0, 8), total: linhas.length });
    }

    if (action === 'sincronizar_url') {
      const tabelaId = String(body.tabela_id ?? '');
      await tabelaDoDono(user.id, tabelaId);
      return json(await sincronizarUrl(admin, tabelaId));
    }

    if (action === 'testar_api') {
      let cfg = configDe(body.config);
      if (body.tabela_id) {
        // tabela já criada: a configuração e a chave vêm do banco (a chave nunca volta para o navegador)
        const tabelaId = String(body.tabela_id);
        const { data: t } = await admin.from('tabelas').select('api_config').eq('id', tabelaId).eq('owner_id', user.id).maybeSingle();
        if (!t?.api_config) throw new UserError('Tabela não encontrada.', 404);
        const { data: valor } = await admin.rpc('helpy_segredo_api', { p_tabela: tabelaId });
        cfg = configDe({ ...t.api_config, header_valor: valor ?? '' });
      }
      if (!cfg.url) throw new UserError('Informe o endereço da API.');
      const { total, linhas } = await consultarApi(cfg, String(body.busca ?? ''));
      const campos = [...new Set(linhas.flatMap((l) => Object.keys(l)))].slice(0, 40);
      return json({ total, campos, linhas: linhas.slice(0, 5) });
    }

    if (action === 'assuntos') {
      const dias = [7, 30, 90].includes(Number(body.dias)) ? Number(body.dias) : 30;
      const { data: cache } = await admin.from('relatorio_assuntos')
        .select('assuntos, amostra, gerado_em').eq('owner_id', user.id).eq('dias', dias).maybeSingle();
      const fresco = cache && Date.now() - new Date(cache.gerado_em).getTime() < VALIDADE_ASSUNTOS_MS;
      if (fresco && body.forcar !== true) return json(cache);
      if (fresco && Date.now() - new Date(cache.gerado_em).getTime() < 10 * 60 * 1000) {
        // "atualizar" só refaz depois de 10 minutos, para não gastar à toa
        return json(cache);
      }
      const { assuntos, amostra } = await agruparAssuntos(user.id, dias);
      const novo = { owner_id: user.id, dias, assuntos, amostra, gerado_em: new Date().toISOString() };
      const { error } = await admin.from('relatorio_assuntos').upsert(novo);
      if (error) throw error;
      return json({ assuntos, amostra, gerado_em: novo.gerado_em });
    }

    throw new UserError(`Ação desconhecida: ${action}`);
  } catch (err) {
    if (err instanceof UserError) return json({ error: err.message }, err.status);
    console.error('[dados-e-relatorios]', err);
    return json({ error: 'Algo deu errado do nosso lado. Tente de novo em instantes.' }, 500);
  }
});
