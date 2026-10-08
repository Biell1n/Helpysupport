// ============================================================
// Agenda: horários livres e marcação, usados pelo atendente.
// ============================================================

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

export interface AgendaConfig {
  owner_id: string;
  ativa: boolean;
  fuso: string;
  duracao_min: number;
  antecedencia_horas: number;
  horarios: Record<string, Array<[string, string]>>;
  /** o que dá para marcar, com duração e valor */
  servicos?: Array<{ nome: string; duracao_min?: number; valor?: number }>;
  registro_tabela_id?: string | null;
}

/** Diferença, em minutos, entre o horário local do fuso e UTC naquele instante. */
function offsetMin(tz: string, at: Date): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(at).map((p) => [p.type, p.value]),
  );
  const local = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return Math.round((local - at.getTime()) / 60000);
}

/** "2026-10-07" + "14:30" no fuso → instante UTC. */
export function localToUtc(dia: string, hora: string, tz: string): Date {
  const [y, m, d] = dia.split('-').map(Number);
  const [hh, mm] = hora.split(':').map(Number);
  const guess = new Date(Date.UTC(y, m - 1, d, hh, mm));
  return new Date(guess.getTime() - offsetMin(tz, guess) * 60000);
}

export function utcToLocal(at: Date, tz: string) {
  const f = new Intl.DateTimeFormat('pt-BR', {
    timeZone: tz, weekday: 'long', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });
  return f.format(at);
}

export function hojeNoFuso(tz: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

const DIA_RE = /^\d{4}-\d{2}-\d{2}$/;
const HORA_RE = /^\d{1,2}:\d{2}$/;

export async function carregarAgenda(db: SupabaseClient, ownerId: string): Promise<AgendaConfig | null> {
  const { data } = await db.from('agenda_config').select('*').eq('owner_id', ownerId).maybeSingle();
  return data?.ativa ? (data as AgendaConfig) : null;
}

async function ocupados(db: SupabaseClient, ownerId: string, de: Date, ate: Date, ignorarId?: string) {
  const { data } = await db
    .from('agendamentos')
    .select('id, inicio, fim')
    .eq('owner_id', ownerId)
    .in('status', ['confirmado', 'pendente'])
    .lt('inicio', ate.toISOString())
    .gt('fim', de.toISOString());
  return (data ?? [])
    .filter((a) => a.id !== ignorarId) // ao remarcar, o próprio horário não conta como ocupado
    .map((a) => [new Date(a.inicio).getTime(), new Date(a.fim).getTime()] as const);
}

export interface AgendamentoDaConversa {
  id: string;
  inicio: string;
  fim: string;
  servico: string | null;
  observacao: string | null;
  status: string;
}

/** Horários ainda de pé que esta conversa já marcou (o atendente não lembra das ferramentas de rodadas anteriores). */
export async function agendamentosDaConversa(db: SupabaseClient, conversationId: string): Promise<AgendamentoDaConversa[]> {
  const { data } = await db
    .from('agendamentos')
    .select('id, inicio, fim, servico, observacao, status')
    .eq('conversation_id', conversationId)
    .in('status', ['confirmado', 'pendente'])
    .gte('fim', new Date().toISOString())
    .order('inicio');
  return (data ?? []) as AgendamentoDaConversa[];
}

/** "sexta-feira, 09/10, 09:00–09:30 · Corte · confirmado (id …)" para o prompt e as respostas das ferramentas. */
export function descreverAgendamento(a: AgendamentoDaConversa, fuso: string): string {
  const hora = (d: string) => new Intl.DateTimeFormat('pt-BR', { timeZone: fuso, hour: '2-digit', minute: '2-digit' }).format(new Date(d));
  const dia = new Intl.DateTimeFormat('pt-BR', { timeZone: fuso, weekday: 'long', day: '2-digit', month: '2-digit' }).format(new Date(a.inicio));
  return `${dia}, ${hora(a.inicio)}–${hora(a.fim)}${a.servico ? ` · ${a.servico}` : ''}${a.observacao ? ` · obs.: ${a.observacao}` : ''} · ${a.status} (id ${a.id})`;
}

export async function horariosLivres(
  db: SupabaseClient,
  cfg: AgendaConfig,
  dia: string,
  duracaoMin?: number,
  ignorarId?: string,
): Promise<{ dia?: string; duracao_min?: number; livres?: string[]; aviso?: string; erro?: string }> {
  if (!DIA_RE.test(dia)) return { erro: 'Data inválida. Use AAAA-MM-DD.' };
  const dur = Math.max(5, Math.min(480, duracaoMin || cfg.duracao_min));
  const semana = new Date(`${dia}T12:00:00Z`).getUTCDay();
  const faixas = cfg.horarios?.[String(semana)] ?? [];
  if (!faixas.length) return { dia, livres: [], aviso: 'Não há atendimento neste dia da semana.' };

  const inicioDia = localToUtc(dia, '00:00', cfg.fuso);
  const fimDia = new Date(inicioDia.getTime() + 24 * 3600 * 1000);
  const busy = await ocupados(db, cfg.owner_id, inicioDia, fimDia, ignorarId);
  const minimo = Date.now() + cfg.antecedencia_horas * 3600 * 1000;

  const livres: string[] = [];
  for (const [abre, fecha] of faixas) {
    let t = localToUtc(dia, abre, cfg.fuso).getTime();
    const limite = localToUtc(dia, fecha, cfg.fuso).getTime();
    while (t + dur * 60000 <= limite) {
      const fim = t + dur * 60000;
      const conflito = busy.some(([a, b]) => t < b && fim > a);
      if (!conflito && t >= minimo) {
        livres.push(
          new Intl.DateTimeFormat('pt-BR', { timeZone: cfg.fuso, hour: '2-digit', minute: '2-digit' }).format(new Date(t)),
        );
      }
      t += cfg.duracao_min * 60000;
    }
  }
  return { dia, duracao_min: dur, livres };
}

export async function marcar(
  db: SupabaseClient,
  cfg: AgendaConfig,
  input: {
    dia: string; hora: string; nome: string; contato?: string; servico?: string; observacao?: string;
    duracao_min?: number; assistant_id: string; conversation_id: string | null;
    valor?: number; pendente?: boolean; registrar?: boolean; adicional?: boolean;
    /** quem marcou: o atendente virtual ou alguém da equipe pelo chamado */
    origem?: 'assistente' | 'manual';
  },
) {
  // a conversa já tem horário marcado: mudar é com alterar_agendamento, não marcando de novo
  if (input.conversation_id && !input.adicional) {
    const ja = await agendamentosDaConversa(db, input.conversation_id);
    if (ja.length) {
      return {
        erro: 'Esta conversa já tem horário marcado. Para mudar hora, anotar tamanho/cor/pedido ou cancelar, use alterar_agendamento com o id. Só chame agendar de novo com adicional=true se a pessoa pediu um SEGUNDO horário além deste.',
        ja_marcados: ja.map((a) => descreverAgendamento(a, cfg.fuso)),
      };
    }
  }
  // serviço cadastrado na agenda: a duração e o valor de lá valem mais que o palpite do modelo
  const sv = (cfg.servicos ?? []).find((x) => semAcento(x.nome) === semAcento(input.servico ?? ''));
  if (sv) {
    if (sv.duracao_min) input.duracao_min = sv.duracao_min;
    if (sv.valor != null) input.valor = sv.valor;
  }
  if (!DIA_RE.test(input.dia) || !HORA_RE.test(input.hora)) return { erro: 'Data ou hora inválida.' };
  if (!input.nome?.trim()) return { erro: 'Preciso do nome do cliente para marcar.' };

  const { livres } = await horariosLivres(db, cfg, input.dia, input.duracao_min);
  const hora = input.hora.padStart(5, '0');
  if (!livres?.includes(hora)) {
    return { erro: 'Esse horário não está livre.', livres: livres ?? [] };
  }

  const dur = Math.max(5, Math.min(480, input.duracao_min || cfg.duracao_min));
  const inicio = localToUtc(input.dia, hora, cfg.fuso);
  const fim = new Date(inicio.getTime() + dur * 60000);

  const { data, error } = await db
    .from('agendamentos')
    .insert({
      owner_id: cfg.owner_id,
      assistant_id: input.assistant_id,
      conversation_id: input.conversation_id,
      cliente_nome: input.nome.trim().slice(0, 120),
      cliente_contato: input.contato?.trim().slice(0, 120) || null,
      servico: input.servico?.trim().slice(0, 120) || null,
      observacao: input.observacao?.trim().slice(0, 500) || null,
      inicio: inicio.toISOString(),
      fim: fim.toISOString(),
      origem: input.origem ?? 'assistente',
      status: input.pendente ? 'pendente' : 'confirmado',
      valor: Number.isFinite(input.valor) ? input.valor : null,
    })
    .select('id')
    .single();
  if (error) return { erro: 'Não consegui gravar o agendamento.' };
  if (input.registrar) {
    await registrarNosDados(db, cfg, {
      agendamento_id: data.id,
      data: input.dia.split('-').reverse().join('/'),
      hora,
      cliente: input.nome.trim().slice(0, 120),
      contato: input.contato?.trim().slice(0, 120) ?? '',
      servico: input.servico?.trim().slice(0, 120) ?? '',
      valor: Number.isFinite(input.valor) ? String(input.valor) : '',
      status: input.pendente ? 'Pendente' : 'Confirmado',
    }).catch((e) => console.error('[agenda] registro nos dados', e));
  }
  return {
    ok: true,
    id: data.id,
    quando: utcToLocal(inicio, cfg.fuso),
    situacao: input.pendente
      ? 'PENDENTE: o pedido foi anotado, mas o negócio ainda vai confirmar. Diga isso; não diga que está confirmado.'
      : 'Confirmado na agenda.',
  };
}

/** Remarca, anota algo ou cancela um horário que ESTA conversa marcou. */
export async function alterarAgendamento(
  db: SupabaseClient,
  cfg: AgendaConfig,
  conversationId: string,
  input: { id: string; dia?: string; hora?: string; observacao?: string; cancelar?: boolean; registrar?: boolean },
) {
  const { data: a } = await db
    .from('agendamentos')
    .select('id, inicio, fim, servico, observacao, status')
    .eq('id', input.id)
    .eq('conversation_id', conversationId) // só mexe no que foi marcado nesta conversa
    .in('status', ['confirmado', 'pendente'])
    .maybeSingle();
  if (!a) return { erro: 'Não achei esse agendamento nesta conversa (ou ele já foi cancelado).' };

  if (input.cancelar) {
    await db.from('agendamentos').update({ status: 'cancelado' }).eq('id', a.id);
    if (input.registrar) await atualizarNosDados(db, cfg, a.id, { status: 'Cancelado' });
    return { ok: true, situacao: 'Cancelado. Avise a pessoa.' };
  }

  const patch: Record<string, unknown> = {};
  const dados: Record<string, string> = {};
  if (input.observacao?.trim()) {
    const nova = input.observacao.trim();
    patch.observacao = (a.observacao ? `${a.observacao} · ${nova}` : nova).slice(0, 500);
  }
  if (input.dia || input.hora) {
    const fusoData = (d: string, op: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-CA', { timeZone: cfg.fuso, ...op }).format(new Date(d));
    const dia = input.dia || fusoData(a.inicio, { year: 'numeric', month: '2-digit', day: '2-digit' });
    const hora = (input.hora || fusoData(a.inicio, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })).padStart(5, '0');
    if (!DIA_RE.test(dia) || !HORA_RE.test(hora)) return { erro: 'Data ou hora inválida.' };
    const dur = Math.round((new Date(a.fim).getTime() - new Date(a.inicio).getTime()) / 60000);
    const { livres } = await horariosLivres(db, cfg, dia, dur, a.id);
    if (!livres?.includes(hora)) return { erro: 'Esse horário não está livre.', livres: livres ?? [] };
    const inicio = localToUtc(dia, hora, cfg.fuso);
    patch.inicio = inicio.toISOString();
    patch.fim = new Date(inicio.getTime() + dur * 60000).toISOString();
    dados.data = dia.split('-').reverse().join('/');
    dados.hora = hora;
  }
  if (!Object.keys(patch).length) return { erro: 'Diga o que mudar: data/hora, observação ou cancelar.' };

  const { error } = await db.from('agendamentos').update(patch).eq('id', a.id);
  if (error) return { erro: 'Não consegui alterar o agendamento.' };
  if (input.registrar && Object.keys(dados).length) await atualizarNosDados(db, cfg, a.id, dados);
  return {
    ok: true,
    agora: descreverAgendamento({ ...a, ...(patch as Partial<AgendamentoDaConversa>) } as AgendamentoDaConversa, cfg.fuso),
  };
}

/** Mantém a linha da tabela "Agendamentos" igual ao horário (remarcado ou cancelado). */
async function atualizarNosDados(db: SupabaseClient, cfg: AgendaConfig, agendamentoId: string, campos: Record<string, string>) {
  if (!cfg.registro_tabela_id) return;
  const { data: linhas } = await db.from('tabela_linhas').select('id, dados')
    .eq('tabela_id', cfg.registro_tabela_id).eq('dados->>agendamento_id', agendamentoId);
  for (const l of linhas ?? []) {
    await db.from('tabela_linhas').update({ dados: { ...(l.dados as Record<string, string>), ...campos } }).eq('id', l.id);
  }
}

const semAcento = (s: string) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

const COLUNAS_REGISTRO = [
  ['data', 'Data', 'texto'], ['hora', 'Hora', 'texto'], ['cliente', 'Cliente', 'texto'], ['contato', 'Contato', 'texto'],
  ['servico', 'Serviço', 'texto'], ['valor', 'Valor', 'moeda'], ['status', 'Status', 'texto'],
] as const;

/** Atualização automática dos Dados: cada agendamento vira uma linha na tabela "Agendamentos". */
async function registrarNosDados(db: SupabaseClient, cfg: AgendaConfig, linha: Record<string, string>) {
  let tabelaId = cfg.registro_tabela_id ?? null;
  if (tabelaId) {
    const { data } = await db.from('tabelas').select('id').eq('id', tabelaId).eq('owner_id', cfg.owner_id).maybeSingle();
    if (!data) tabelaId = null;
  }
  if (!tabelaId) {
    const { data: t, error } = await db.from('tabelas')
      .insert({ owner_id: cfg.owner_id, nome: 'Agendamentos', proposito: 'Preenchida sozinha pelo assistente a cada horário marcado (cliente, serviço, valor).', assistente_escreve: true })
      .select('id').single();
    if (error) throw error;
    tabelaId = t.id;
    await db.from('tabela_colunas').insert(COLUNAS_REGISTRO.map(([chave, rotulo, tipo], ordem) => ({ tabela_id: tabelaId, chave, rotulo, tipo, ordem, identifica: ordem === 2 })));
    await db.from('agenda_config').update({ registro_tabela_id: tabelaId }).eq('owner_id', cfg.owner_id);
  }
  await db.from('tabela_linhas').insert({ tabela_id: tabelaId, dados: linha });
}
