import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Marca } from '@/components/Logo';
import { ChevronLeft, ChevronRight, Plus, Settings2 } from 'lucide-react';
import { chamar, supabase } from '@/lib/supabase';
import { agoraNoFuso, FUSO_PADRAO, hojeNoFuso, paraInstante, paredeIso } from '@/lib/fuso';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/Toasts';
import { Confirmar, Drawer, Modal } from '@/components/Modal';

const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const CURTO = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const HORA_PX = 52;

const PADRAO = {
  ativa: false,
  fuso: 'America/Sao_Paulo',
  duracao_min: 30,
  antecedencia_horas: 2,
  intervalo_min: 0,
  vagas: 1,
  horarios: { 0: [], 1: [['09:00', '18:00']], 2: [['09:00', '18:00']], 3: [['09:00', '18:00']], 4: [['09:00', '18:00']], 5: [['09:00', '18:00']], 6: [['09:00', '13:00']] },
};

const ATIVO = (e) => e.status !== 'cancelado' && e.status !== 'faltou';
const encosta = (a, b) => new Date(a.inicio) < new Date(b.fim) && new Date(b.inicio) < new Date(a.fim);
/** Mais que isso lado a lado não cabe numa coluna da semana: o resto vira "+N". */
const MAX_LADO = 2;

/**
 * Divide os horários que se encostam em colunas, para nenhum ficar escondido
 * atrás do outro. Cancelado só aparece se não tiver um horário valendo por cima.
 */
function lado(todos) {
  const evs = todos.filter((e) => ATIVO(e) || !todos.some((o) => o !== e && ATIVO(o) && encosta(o, e)));
  const ord = [...evs].sort((a, b) => new Date(a.inicio) - new Date(b.inicio));
  const out = [];
  let grupo = [];
  let fimGrupo = 0;
  const fechar = () => {
    const n = Math.max(1, ...grupo.map((g) => g.faixa + 1));
    const membros = grupo.map((g) => g.e);
    for (const g of grupo) out.push({ ...g, faixas: n, membros });
    grupo = [];
  };
  for (const e of ord) {
    const ini = new Date(e.inicio).getTime();
    const fim = new Date(e.fim).getTime();
    if (grupo.length && ini >= fimGrupo) fechar();
    const ocupadas = grupo.filter((g) => new Date(g.e.fim).getTime() > ini).map((g) => g.faixa);
    let faixa = 0;
    while (ocupadas.includes(faixa)) faixa += 1;
    grupo.push({ e, faixa });
    fimGrupo = Math.max(fimGrupo, fim);
  }
  if (grupo.length) fechar();
  return out;
}

const inicioDaSemana = (d) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - x.getDay());
  return x;
};
const somaDias = (d, n) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};
const mesmoDia = (a, b) => a.toDateString() === b.toDateString();
const hm = (s) => {
  const [h, m] = String(s).split(':').map(Number);
  return h * 60 + (m || 0);
};
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function ConfigAgenda({ cfg, onSalvar, onFechar }) {
  const [c, setC] = useState(() => JSON.parse(JSON.stringify(cfg)));
  const setDia = (d, faixas) => setC((p) => ({ ...p, horarios: { ...p.horarios, [d]: faixas ?? [] } }));

  return (
    <Drawer
      aberto
      onFechar={onFechar}
      titulo="Horários da agenda"
      sub="O assistente só oferece horários dentro destas faixas e que não estejam ocupados."
      rodape={
        <>
          <button type="button" className="btn btn-ghost" onClick={onFechar}>Cancelar</button>
          <button type="button" className="btn btn-primary" onClick={() => onSalvar(c)}>Salvar horários</button>
        </>
      }
    >
      <label className="check">
        <input type="checkbox" checked={c.ativa} onChange={(e) => setC({ ...c, ativa: e.target.checked })} />
        <span>
          <b>Agenda ligada</b>
          <span className="hint" style={{ display: 'block' }}>Assistentes com “marca sozinho” ativado passam a ver e marcar horários.</span>
        </span>
      </label>
      <div className="grid-2">
        <label className="field">
          <span className="label">Duração padrão</span>
          <select className="select" value={c.duracao_min} onChange={(e) => setC({ ...c, duracao_min: Number(e.target.value) })}>
            {[15, 20, 30, 40, 45, 60, 90, 120].map((m) => <option key={m} value={m}>{m} min</option>)}
          </select>
        </label>
        <label className="field">
          <span className="label">Intervalo entre atendimentos</span>
          <select className="select" value={c.intervalo_min ?? 0} onChange={(e) => setC({ ...c, intervalo_min: Number(e.target.value) })}>
            {[0, 5, 10, 15, 20, 30].map((m) => <option key={m} value={m}>{m === 0 ? 'Sem intervalo' : `${m} min`}</option>)}
          </select>
        </label>
        <label className="field">
          <span className="label">Atendem ao mesmo tempo</span>
          <select className="select" value={c.vagas ?? 1} onChange={(e) => setC({ ...c, vagas: Number(e.target.value) })}>
            {[1, 2, 3, 4, 5, 6, 8, 10].map((n) => <option key={n} value={n}>{n === 1 ? '1 pessoa' : `${n} pessoas`}</option>)}
          </select>
          <span className="hint">Profissionais, cadeiras ou salas. Com 2, o mesmo horário pode ser marcado duas vezes.</span>
        </label>
        <label className="field">
          <span className="label">Antecedência mínima</span>
          <select className="select" value={c.antecedencia_horas} onChange={(e) => setC({ ...c, antecedencia_horas: Number(e.target.value) })}>
            {[0, 1, 2, 4, 12, 24, 48].map((h) => <option key={h} value={h}>{h === 0 ? 'Nenhuma' : `${h} h`}</option>)}
          </select>
        </label>
      </div>
      <div>
        <span className="label">Dias e horários</span>
        {[1, 2, 3, 4, 5, 6, 0].map((d) => {
          const faixas = c.horarios?.[d] ?? [];
          const [manha, tarde] = faixas;
          const muda = (i, k, v) => setDia(d, faixas.map((f, n) => (n === i ? (k === 0 ? [v, f[1]] : [f[0], v]) : f)));
          return (
            <div key={d} className="horarios-dia">
              <label className="check">
                <input type="checkbox" checked={!!manha} onChange={(e) => setDia(d, e.target.checked ? [['09:00', '18:00']] : [])} />
                {DIAS[d]}
              </label>
              {manha ? (
                <div className="stack-sm" style={{ flex: 1 }}>
                  <div className="row">
                    <input className="input" type="time" value={manha[0]} onChange={(e) => muda(0, 0, e.target.value)} aria-label={`${DIAS[d]} abre`} />
                    <span className="faint">às</span>
                    <input className="input" type="time" value={manha[1]} onChange={(e) => muda(0, 1, e.target.value)} aria-label={`${DIAS[d]} ${tarde ? 'fecha (1º horário)' : 'fecha'}`} />
                  </div>
                  {tarde ? (
                    <div className="row">
                      <input className="input" type="time" value={tarde[0]} onChange={(e) => muda(1, 0, e.target.value)} aria-label={`${DIAS[d]} abre (2º horário)`} />
                      <span className="faint">às</span>
                      <input className="input" type="time" value={tarde[1]} onChange={(e) => muda(1, 1, e.target.value)} aria-label={`${DIAS[d]} fecha`} />
                      <button type="button" className="link-btn" onClick={() => setDia(d, [[manha[0], tarde[1]]])}>tirar</button>
                    </div>
                  ) : (
                    <button type="button" className="link-btn" style={{ alignSelf: 'flex-start' }} onClick={() => setDia(d, [[manha[0], '12:00'], ['13:00', manha[1] > '13:00' ? manha[1] : '18:00']])}>+ outro horário no dia</button>
                  )}
                </div>
              ) : (
                <span className="faint" style={{ fontSize: 13.5 }}>Fechado</span>
              )}
            </div>
          );
        })}
      </div>
    </Drawer>
  );
}

function Remarcar({ evento, onRemarcar }) {
  const ini = new Date(evento.inicio);
  const [dia, setDia] = useState(iso(ini));
  const [hora, setHora] = useState(`${String(ini.getHours()).padStart(2, '0')}:${String(ini.getMinutes()).padStart(2, '0')}`);
  return (
    <form className="remarcar" onSubmit={(e) => { e.preventDefault(); onRemarcar(dia, hora); }}>
      <span className="eyebrow">Remarcar</span>
      <div className="row row-wrap" style={{ gap: 8 }}>
        <input className="input" type="date" value={dia} onChange={(e) => setDia(e.target.value)} aria-label="Novo dia" style={{ width: 160 }} />
        <input className="input" type="time" value={hora} onChange={(e) => setHora(e.target.value)} aria-label="Nova hora" style={{ width: 112 }} />
        <button className="btn btn-ghost btn-sm">Mudar horário</button>
      </div>
    </form>
  );
}

function NovoAgendamento({ inicial, duracao, onSalvar, onFechar }) {
  const [f, setF] = useState({ cliente_nome: '', cliente_contato: '', servico: '', dia: inicial.dia, hora: inicial.hora, duracao, observacao: '' });
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));
  return (
    <Modal aberto onFechar={onFechar}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSalvar(f);
        }}
      >
        <h2>Novo agendamento</h2>
        <div className="stack" style={{ marginTop: 14 }}>
          <label className="field">
            <span className="label">Cliente</span>
            <input className="input" required autoFocus value={f.cliente_nome} onChange={set('cliente_nome')} />
          </label>
          <div className="grid-2">
            <label className="field">
              <span className="label">Contato</span>
              <input className="input" value={f.cliente_contato} onChange={set('cliente_contato')} placeholder="WhatsApp ou e-mail" />
            </label>
            <label className="field">
              <span className="label">Serviço</span>
              <input className="input" value={f.servico} onChange={set('servico')} />
            </label>
          </div>
          <div className="grid-3">
            <label className="field">
              <span className="label">Dia</span>
              <input className="input" type="date" required value={f.dia} onChange={set('dia')} />
            </label>
            <label className="field">
              <span className="label">Hora</span>
              <input className="input" type="time" required value={f.hora} onChange={set('hora')} />
            </label>
            <label className="field">
              <span className="label">Duração (min)</span>
              <input className="input" type="number" min={5} step={5} value={f.duracao} onChange={set('duracao')} />
            </label>
          </div>
        </div>
        <div className="modal-foot">
          <button type="button" className="btn btn-ghost" onClick={onFechar}>Cancelar</button>
          <button className="btn btn-primary">Marcar</button>
        </div>
      </form>
    </Modal>
  );
}

const SITUACAO = {
  aguardando_pagamento: 'Guardado — esperando o pagamento',
  pendente: 'Pendente — aguardando sua confirmação',
  confirmado: 'Confirmado',
  cancelado: 'Cancelado',
  concluido: 'Concluído',
  faltou: 'Faltou',
};
const reaisBr = (v) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export default function Agenda() {
  const { user, contaId, tipo } = useAuth();
  const avisar = useToast();
  const [semana, setSemana] = useState(() => inicioDaSemana(agoraNoFuso(FUSO_PADRAO)));
  const [cfg, setCfg] = useState(null);
  const [eventos, setEventos] = useState([]);
  const [configurando, setConfigurando] = useState(false);
  const [novo, setNovo] = useState(null);
  const [aberto, setAberto] = useState(null);
  const [grupoAberto, setGrupoAberto] = useState(null);

  const dias = useMemo(() => Array.from({ length: 7 }, (_, i) => somaDias(semana, i)), [semana]);
  // tudo na tela fica no relógio do fuso da empresa (e não no do aparelho)
  const fuso = cfg?.fuso || FUSO_PADRAO;
  // no celular a semana não cabe: abre rolada até hoje (e não no domingo, que costuma estar fechado)
  const calRef = useRef(null);
  useEffect(() => {
    const el = calRef.current;
    if (!el || el.scrollWidth <= el.clientWidth + 4) return;
    const hoje = dias.findIndex((d) => mesmoDia(d, agoraNoFuso(fuso)));
    const col = (el.scrollWidth - 56) / 7;
    el.scrollLeft = hoje >= 0 ? Math.max(0, hoje * col - 8) : 0;
  }, [dias, fuso]);

  const carregar = useCallback(async () => {
    const { data: c } = await supabase.from('agenda_config').select('*').maybeSingle();
    const f = c?.fuso || FUSO_PADRAO;
    const { data: ev } = await supabase
      .from('agendamentos')
      .select('*, pedido:pedidos!agendamentos_pedido_id_fkey(id, status, total, forma)')
      .gte('inicio', paraInstante(semana, f).toISOString())
      .lt('inicio', paraInstante(somaDias(semana, 7), f).toISOString())
      .order('inicio');
    setCfg(c ?? { ...PADRAO, owner_id: contaId });
    // reserva que venceu sem pagamento: o horário já está livre de novo
    const valendo = (ev ?? []).filter((e) => e.status !== 'aguardando_pagamento' || new Date(e.reserva_ate) > new Date());
    // horários passam para o relógio do fuso: daqui em diante a tela só lida com ele
    setEventos(valendo.map((e) => ({
      ...e,
      inicio: paredeIso(e.inicio, f),
      fim: paredeIso(e.fim, f),
      reserva_ate: e.reserva_ate ? paredeIso(e.reserva_ate, f) : e.reserva_ate,
    })));
  }, [semana, contaId]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  // faixa de horas exibida: do primeiro horário de abertura ao último de fechamento
  const [hIni, hFim] = useMemo(() => {
    const faixas = Object.values(cfg?.horarios ?? PADRAO.horarios).flat();
    if (!faixas.length) return [8, 19];
    const ini = Math.min(...faixas.map((f) => hm(f[0]))) / 60;
    const fim = Math.max(...faixas.map((f) => hm(f[1]))) / 60;
    return [Math.max(0, Math.floor(ini) - 1), Math.min(24, Math.ceil(fim) + 1)];
  }, [cfg]);
  const horas = Array.from({ length: hFim - hIni }, (_, i) => hIni + i);

  const salvarCfg = async (c) => {
    const { error } = await supabase.from('agenda_config').upsert({
      owner_id: contaId,
      ativa: c.ativa,
      fuso: c.fuso || 'America/Sao_Paulo',
      duracao_min: c.duracao_min,
      antecedencia_horas: c.antecedencia_horas,
      intervalo_min: c.intervalo_min ?? 0,
      vagas: c.vagas ?? 1,
      horarios: c.horarios,
    });
    if (error) return avisar('Não deu para salvar', { erro: true, texto: error.message });
    setConfigurando(false);
    avisar(c.ativa ? 'Agenda ligada' : 'Horários salvos');
    carregar();
  };

  // marcar ou remarcar à mão: a equipe pode passar por cima, mas fica sabendo antes
  const avisoDoHorario = (inicio, fim, ignorarId) => {
    const faixas = cfg?.horarios?.[inicio.getDay()] ?? [];
    const hhmm = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    if (!faixas.length) return `${DIAS[inicio.getDay()]} a agenda está fechada.`;
    if (!faixas.some(([a, b]) => hhmm(inicio) >= a && hhmm(fim) <= b)) return 'Esse horário fica fora do horário de atendimento.';
    const iv = Number(cfg?.intervalo_min || 0) * 60000;
    const vagas = Math.max(1, Number(cfg?.vagas || 1));
    const ocupados = eventos.filter((e) => e.id !== ignorarId && ['confirmado', 'pendente', 'aguardando_pagamento', 'concluido'].includes(e.status)
      && new Date(e.inicio).getTime() < fim.getTime() + iv && new Date(e.fim).getTime() + iv > inicio.getTime()).length;
    if (ocupados >= vagas) return vagas === 1 ? 'Já tem alguém marcado nesse horário.' : `Os ${vagas} horários desse momento já estão ocupados.`;
    return null;
  };

  const marcar = async (f) => {
    const inicio = new Date(`${f.dia}T${f.hora}:00`);
    const fim = new Date(inicio.getTime() + Number(f.duracao || 30) * 60000);
    const aviso = avisoDoHorario(inicio, fim);
    if (aviso && !window.confirm(`${aviso} Marcar mesmo assim?`)) return;
    const { error } = await supabase.from('agendamentos').insert({
      owner_id: contaId,
      cliente_nome: f.cliente_nome.trim(),
      cliente_contato: f.cliente_contato.trim() || null,
      servico: f.servico.trim() || null,
      inicio: paraInstante(inicio, fuso).toISOString(),
      fim: paraInstante(fim, fuso).toISOString(),
      origem: 'manual',
    });
    if (error) return avisar('Não deu para marcar', { erro: true, texto: error.message });
    setNovo(null);
    avisar('Horário marcado');
    carregar();
  };

  const remarcar = async (dia, hora) => {
    const dur = new Date(aberto.fim) - new Date(aberto.inicio);
    const inicio = new Date(`${dia}T${hora}:00`);
    const fim = new Date(inicio.getTime() + dur);
    if (Number.isNaN(inicio.getTime())) return avisar('Escolha o dia e a hora', { erro: true });
    const aviso = avisoDoHorario(inicio, fim, aberto.id);
    if (aviso && !window.confirm(`${aviso} Remarcar mesmo assim?`)) return;
    const { error } = await supabase.from('agendamentos')
      .update({ inicio: paraInstante(inicio, fuso).toISOString(), fim: paraInstante(fim, fuso).toISOString() }).eq('id', aberto.id);
    if (error) return avisar('Não deu para remarcar', { erro: true, texto: /ocupado/.test(error.message) ? 'Esse horário já está ocupado.' : error.message });
    avisar('Horário remarcado', { texto: 'Avise o cliente da mudança.' });
    setAberto(null);
    carregar();
  };

  const mudarStatus = async (status) => {
    const ped = aberto.pedido;
    if (status === 'cancelado' && ped?.status !== 'pago'
      && !window.confirm(`Cancelar o horário de ${aberto.cliente_nome}? O cliente não é avisado automaticamente.`)) return;
    // cancelar horário pago: pergunta se devolve o dinheiro
    if (status === 'cancelado' && ped?.status === 'pago') return setDevolver(aberto);
    if (status === 'cancelado' && ped?.status === 'aguardando') {
      try {
        await chamar('pagamentos', { action: 'pedido_cancelar', id: ped.id });
      } catch (e) {
        return avisar('Não deu para cancelar', { erro: true, texto: e.message });
      }
    } else {
      const { error } = await supabase.from('agendamentos').update({ status }).eq('id', aberto.id);
      if (error) return avisar('Não deu para atualizar', { erro: true, texto: error.message });
    }
    setAberto(null);
    carregar();
  };

  const [devolver, setDevolver] = useState(null);
  const cancelarPago = async (comDevolucao) => {
    const ev = devolver;
    setDevolver(null);
    try {
      if (comDevolucao) await chamar('pagamentos', { action: 'estornar', id: ev.pedido.id });
      else {
        const { error } = await supabase.from('agendamentos').update({ status: 'cancelado' }).eq('id', ev.id);
        if (error) throw error;
      }
      avisar(comDevolucao ? 'Horário cancelado e valor devolvido' : 'Horário cancelado');
      setAberto(null);
      carregar();
    } catch (e) {
      avisar('Não deu para cancelar', { erro: true, texto: e.message });
    }
  };

  const fechado = (d, h) => {
    const faixas = cfg?.horarios?.[d.getDay()] ?? [];
    return !faixas.some(([a, b]) => h * 60 >= hm(a) && h * 60 < hm(b));
  };

  const hoje = agoraNoFuso(fuso);
  const titulo = `${dias[0].toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })} – ${dias[6].toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' })}`;

  return (
    <div className="page page-wide">
      <header className="page-head">
        <div>
          <h1>Agenda</h1>
          <p>Horários marcados por você e pelo assistente. Em azul, os que ele marcou sozinho.</p>
        </div>
        <div className="row row-wrap">
          {tipo === 'empresa' && <button type="button" className="btn btn-ghost" onClick={() => setConfigurando(true)}><Settings2 /> Horários</button>}
          <button type="button" className="btn btn-primary" onClick={() => setNovo({ dia: hojeNoFuso(fuso), hora: '09:00' })}><Plus /> Agendar</button>
        </div>
      </header>

      {/* agenda desligada e sem nada marcado: um convite para ligar, no lugar da grade vazia */}
      {cfg && !cfg.ativa && eventos.length === 0 ? (
        <div className="card vazio-helpy">
          <Marca size={64} />
          <h2>A agenda está desligada</h2>
          <p className="faint">
            {tipo === 'empresa'
              ? 'Ligue e defina os horários: o assistente passa a marcar sozinho, e os horários aparecem aqui.'
              : 'Quando a empresa ligar a agenda, os horários marcados aparecem aqui.'}
          </p>
          {tipo === 'empresa' && <button type="button" className="btn btn-primary" onClick={() => setConfigurando(true)}>Ligar a agenda</button>}
        </div>
      ) : (
      <>
      {cfg && !cfg.ativa && tipo === 'empresa' && (
        <div className="alert" style={{ marginBottom: 16 }}>
          <span>
            A agenda está desligada para o assistente. <button type="button" className="link-btn" onClick={() => setConfigurando(true)}>Ligar e definir horários</button>
            {' '}— depois, na seção Agenda do assistente, ligue “Ele marca horários”.
          </span>
        </div>
      )}

      <div className="row" style={{ marginBottom: 12 }}>
        <button type="button" className="btn btn-ghost btn-icon" aria-label="Semana anterior" onClick={() => setSemana((s) => somaDias(s, -7))}><ChevronLeft /></button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSemana(inicioDaSemana(agoraNoFuso(fuso)))}>Hoje</button>
        <button type="button" className="btn btn-ghost btn-icon" aria-label="Próxima semana" onClick={() => setSemana((s) => somaDias(s, 7))}><ChevronRight /></button>
        <b style={{ marginLeft: 6 }}>{titulo}</b>
      </div>

      <div className="cal" ref={calRef}>
        <div className="cal-corner" />
        {dias.map((d) => (
          <div key={d.toISOString()} className={`cal-head${mesmoDia(d, hoje) ? ' hoje' : ''}`}>
            <span>{CURTO[d.getDay()]}</span>
            <b>{d.getDate()}</b>
          </div>
        ))}

        <div className="cal-hours">
          {horas.map((h) => <div key={h} className="cal-hour">{String(h).padStart(2, '0')}h</div>)}
        </div>

        {dias.map((d) => (
          <div key={d.toISOString()} className="cal-day">
            {horas.map((h) => (
              <button
                key={h}
                type="button"
                className={`cal-slot${fechado(d, h) ? ' fechado' : ''}`}
                aria-label={`Agendar ${CURTO[d.getDay()]} ${d.getDate()}, ${h}h`}
                onClick={() => setNovo({ dia: iso(d), hora: `${String(h).padStart(2, '0')}:00` })}
              />
            ))}
            {lado(eventos.filter((e) => mesmoDia(new Date(e.inicio), d)))
              .map(({ e, faixa, faixas, membros }) => {
                const ini = new Date(e.inicio);
                const fim = new Date(e.fim);
                const top = ((ini.getHours() + ini.getMinutes() / 60 - hIni) * HORA_PX);
                const altura = Math.max(24, ((fim - ini) / 3600000) * HORA_PX - 2);
                // muitos ao mesmo tempo: mostra o primeiro e um "+N" que abre a lista
                const cheio = faixas > MAX_LADO;
                if (cheio && faixa >= MAX_LADO) return null;
                if (cheio && faixa === MAX_LADO - 1) {
                  const resto = membros.filter((m) => m !== membros[0]);
                  return (
                    <button
                      key={`mais-${e.id}`}
                      type="button"
                      className="cal-ev cal-ev-mais"
                      style={{ top, height: altura, left: 'calc(4px + (100% - 8px) / 2)', right: 'auto', width: 'calc((100% - 8px) / 2 - 2px)' }}
                      onClick={() => setGrupoAberto(membros)}
                      aria-label={`Ver os ${membros.length} horários desse momento`}
                    >
                      <b>+{resto.length}</b>
                    </button>
                  );
                }
                const cols = cheio ? MAX_LADO : faixas;
                const nome = cols > 1 ? String(e.cliente_nome ?? '').split(' ')[0] : e.cliente_nome;
                return (
                  <button
                    key={e.id}
                    type="button"
                    className="cal-ev"
                    data-origem={e.origem}
                    data-status={e.status}
                    data-curto={altura < 40}
                    style={{
                      top,
                      height: altura,
                      // horários ao mesmo tempo (mais de um profissional) ficam lado a lado
                      ...(cols > 1 ? { left: `calc(4px + ${faixa} * (100% - 8px) / ${cols})`, right: 'auto', width: `calc((100% - 8px) / ${cols} - 2px)` } : {}),
                    }}
                    onClick={() => setAberto(e)}
                  >
                    <b>
                      {e.status === 'pendente' ? '⏳ ' : e.status === 'aguardando_pagamento' ? '💳 ' : ''}
                      {altura < 40 && cols < 2 && <span className="cal-ev-hora">{ini.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} </span>}
                      {nome}
                    </b>
                    <span className="cal-ev-sub">
                      {ini.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      {e.servico ? ` · ${e.servico}` : ''}
                    </span>
                  </button>
                );
              })}
          </div>
        ))}
      </div>
      <div className="cal-legenda faint">
        <span>Toque num horário vazio para agendar.</span>
        <span><i data-cor="assistente" /> marcado pelo assistente</span>
        <span><i data-cor="manual" /> marcado por você</span>
        <span><i data-cor="espera" /> esperando confirmação</span>
        <span><i data-cor="pagamento" /> esperando pagamento</span>
        <span><i data-cor="fechado" /> fora do horário</span>
      </div>

      </>
      )}

      {configurando && cfg && <ConfigAgenda cfg={cfg} onSalvar={salvarCfg} onFechar={() => setConfigurando(false)} />}
      {novo && <NovoAgendamento inicial={novo} duracao={cfg?.duracao_min ?? 30} onSalvar={marcar} onFechar={() => setNovo(null)} />}

      {grupoAberto && (
        <Modal aberto onFechar={() => setGrupoAberto(null)} largura={420}>
          <h2 style={{ fontSize: 20 }}>{grupoAberto.length} horários nesse momento</h2>
          <div className="stack" style={{ gap: 8, marginTop: 14 }}>
            {grupoAberto.map((e) => (
              <button
                key={e.id}
                type="button"
                className="cal-lista-item"
                onClick={() => {
                  setGrupoAberto(null);
                  setAberto(e);
                }}
              >
                <b>{new Date(e.inicio).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</b>
                <span>{e.cliente_nome}{e.servico ? ` · ${e.servico}` : ''}</span>
                <span className="faint">{SITUACAO[e.status] ?? e.status}</span>
              </button>
            ))}
          </div>
        </Modal>
      )}
      {aberto && (
        <Drawer
          aberto
          onFechar={() => setAberto(null)}
          titulo={aberto.cliente_nome}
          sub={new Date(aberto.inicio).toLocaleString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}
          rodape={
            aberto.status === 'aguardando_pagamento' ? (
              <button type="button" className="btn btn-danger" style={{ marginRight: 'auto' }} onClick={() => mudarStatus('cancelado')}>Liberar o horário</button>
            ) : aberto.status === 'pendente' ? (
              <>
                <button type="button" className="btn btn-danger" style={{ marginRight: 'auto' }} onClick={() => mudarStatus('cancelado')}>Recusar</button>
                <button type="button" className="btn btn-primary" onClick={() => mudarStatus('confirmado')}>Confirmar horário</button>
              </>
            ) : (
            <>
              <button type="button" className="btn btn-danger" style={{ marginRight: 'auto' }} onClick={() => mudarStatus('cancelado')}>Cancelar horário</button>
              <button type="button" className="btn btn-ghost" onClick={() => mudarStatus('faltou')}>Faltou</button>
              <button type="button" className="btn btn-primary" onClick={() => mudarStatus('concluido')}>Concluído</button>
            </>
            )
          }
        >
          {['confirmado', 'pendente'].includes(aberto.status) && <Remarcar evento={aberto} onRemarcar={remarcar} />}
          <dl className="stack stack-sm" style={{ margin: 0 }}>
            <div><dt className="eyebrow">Serviço</dt><dd style={{ margin: 0 }}>{aberto.servico || '—'}</dd></div>
            <div><dt className="eyebrow">Contato</dt><dd style={{ margin: 0 }}>{aberto.cliente_contato || '—'}</dd></div>
            <div><dt className="eyebrow">Situação</dt><dd style={{ margin: 0 }}>{SITUACAO[aberto.status] ?? aberto.status}</dd></div>
            {aberto.pedido && (
              <div>
                <dt className="eyebrow">Pagamento</dt>
                <dd style={{ margin: 0 }}>
                  {aberto.pedido.status === 'pago'
                    ? `Pago · ${reaisBr(aberto.pedido.total)}${aberto.pedido.forma ? ` · ${aberto.pedido.forma}` : ''}`
                    : aberto.pedido.status === 'aguardando'
                      ? `Aguardando ${reaisBr(aberto.pedido.total)} · guardado até ${new Date(aberto.reserva_ate).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
                      : aberto.pedido.status === 'estornado' ? `Devolvido · ${reaisBr(aberto.pedido.total)}` : 'Cancelado'}
                </dd>
              </div>
            )}
            {aberto.valor != null && <div><dt className="eyebrow">Valor</dt><dd style={{ margin: 0 }}>{Number(aberto.valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</dd></div>}
            <div><dt className="eyebrow">Marcado por</dt><dd style={{ margin: 0 }}>{aberto.origem === 'assistente' ? 'Atendente virtual' : 'Você'}</dd></div>
            {aberto.observacao && <div><dt className="eyebrow">Observação</dt><dd style={{ margin: 0 }}>{aberto.observacao}</dd></div>}
          </dl>
        </Drawer>
      )}

      <Confirmar
        aberto={!!devolver}
        titulo="Este horário já foi pago"
        texto={!devolver ? '' : tipo === 'empresa'
          ? `O cliente pagou ${reaisBr(devolver.pedido.total)}. Devolver o valor pelo Asaas ao cancelar? Se combinou outra coisa com ele, cancele sem devolver.`
          : `O cliente pagou ${reaisBr(devolver.pedido.total)}. Só o dono da conta devolve o valor: cancele aqui e avise o responsável para fazer a devolução em Pedidos.`}
        acao={tipo === 'empresa' ? 'Cancelar e devolver' : 'Cancelar sem devolver'}
        segurar
        perigo
        onFechar={() => setDevolver(null)}
        onConfirmar={() => cancelarPago(tipo === 'empresa')}
        voltar="Voltar"
        secundaria={tipo === 'empresa' ? { rotulo: 'Cancelar sem devolver', onClick: () => cancelarPago(false) } : undefined}
      />
    </div>
  );
}
