import { chamar, supabase } from '@/lib/supabase';

// Notícia boa (pagamento confirmado, pedido pago) não vem com cara de problema.
const BOM_CHAVE = /^(fatura:[^:]+|pedido:[0-9a-f-]{36}|saque:.+)$/i;
const RUIM_TEXTO = /atras|venceu|sem estoque|em dobro|cancelad|recus|limite|acabaram|não foi paga/i;

const deAlerta = (a) => ({
  tipo: 'alerta',
  id: a.id,
  chave: `alerta:${a.id}`,
  titulo: a.assunto,
  detalhe: a.detalhe,
  quando: a.criado_em,
  origem: a.origem,
  bom: a.origem === 'sistema' && BOM_CHAVE.test(a.chave ?? '') && !RUIM_TEXTO.test(a.assunto ?? ''),
  assistantId: a.assistant_id,
  conversa: a.conversation_id,
  visto: !!a.visto_em,
  resposta: a.resposta,
});

const deLacuna = (g) => ({
  tipo: 'lacuna',
  id: g.id,
  chave: `lacuna:${g.id}`,
  titulo: `Não soube responder: ${g.assunto}`,
  detalhe: g.pergunta ? `“${g.pergunta}”${g.vezes > 1 ? ` · perguntaram ${g.vezes} vezes` : ''}` : g.vezes > 1 ? `Perguntaram ${g.vezes} vezes` : null,
  // a pergunta frequente fica com o assunto ("tons da base líquida"), não com a frase solta do cliente
  pergunta: g.assunto ? g.assunto.charAt(0).toUpperCase() + g.assunto.slice(1) : g.pergunta,
  quando: g.ultima_em,
  origem: 'assistente',
  bom: false,
  assistantId: g.assistant_id,
  visto: !!g.vista_em || g.resolvida,
  resolvida: g.resolvida,
});

const ALERTA = 'id, origem, chave, assunto, detalhe, conversation_id, assistant_id, criado_em, visto_em, resposta';
const LACUNA = 'id, assistant_id, assunto, pergunta, vezes, resolvida, ultima_em, vista_em';
const maisNovo = (a, b) => new Date(b.quando) - new Date(a.quando);

/** O que ainda não foi visto: aparece no topo do painel. */
export async function avisosNovos() {
  const [al, la] = await Promise.all([
    supabase.from('alertas').select(ALERTA).is('visto_em', null).order('criado_em', { ascending: false }).limit(20),
    supabase.from('assistant_gaps').select(LACUNA).eq('resolvida', false).is('vista_em', null).order('ultima_em', { ascending: false }).limit(20),
  ]);
  return [...(al.data ?? []).map(deAlerta), ...(la.data ?? []).map(deLacuna)].sort(maisNovo);
}

/** Tudo, visto ou não: a caixa de avisos. */
export async function todosOsAvisos() {
  const [al, la] = await Promise.all([
    supabase.from('alertas').select(ALERTA).order('criado_em', { ascending: false }).limit(100),
    supabase.from('assistant_gaps').select(LACUNA).order('ultima_em', { ascending: false }).limit(100),
  ]);
  return [...(al.data ?? []).map(deAlerta), ...(la.data ?? []).map(deLacuna)].sort(maisNovo);
}

export async function marcarVisto(item) {
  const agora = new Date().toISOString();
  if (item.tipo === 'alerta') await supabase.from('alertas').update({ visto_em: agora }).eq('id', item.id);
  else await supabase.from('assistant_gaps').update({ vista_em: agora }).eq('id', item.id);
}

export async function marcarResolvida(item) {
  await supabase.from('assistant_gaps').update({ resolvida: true, vista_em: new Date().toISOString() }).eq('id', item.id);
}

/** A equipe responde e o assistente aprende (vira pergunta frequente dele). */
export function ensinar(item, resposta) {
  return chamar('assistant-builder-chat', {
    action: 'ensinar',
    assistant_id: item.assistantId,
    pergunta: item.tipo === 'lacuna' ? item.pergunta : item.titulo,
    resposta,
    ...(item.tipo === 'alerta' ? { alerta_id: item.id } : { lacuna_id: item.id }),
  });
}
