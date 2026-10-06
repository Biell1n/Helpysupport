import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, Settings2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/Toasts';
import { Drawer, Modal } from '@/components/Modal';

const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const CURTO = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const HORA_PX = 52;

const PADRAO = {
  ativa: false,
  fuso: 'America/Sao_Paulo',
  duracao_min: 30,
  antecedencia_horas: 2,
  horarios: { 0: [], 1: [['09:00', '18:00']], 2: [['09:00', '18:00']], 3: [['09:00', '18:00']], 4: [['09:00', '18:00']], 5: [['09:00', '18:00']], 6: [['09:00', '13:00']] },
};

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
  const setDia = (d, faixa) => setC((p) => ({ ...p, horarios: { ...p.horarios, [d]: faixa ? [faixa] : [] } }));

  return (
    <Drawer
      aberto
      onFechar={onFechar}
      titulo="Horários da agenda"
      sub="O atendente só oferece horários dentro destas faixas e que não estejam ocupados."
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
          <span className="label">Antecedência mínima</span>
          <select className="select" value={c.antecedencia_horas} onChange={(e) => setC({ ...c, antecedencia_horas: Number(e.target.value) })}>
            {[0, 1, 2, 4, 12, 24, 48].map((h) => <option key={h} value={h}>{h === 0 ? 'Nenhuma' : `${h} h`}</option>)}
          </select>
        </label>
      </div>
      <div>
        <span className="label">Dias e horários</span>
        {[1, 2, 3, 4, 5, 6, 0].map((d) => {
          const faixa = c.horarios?.[d]?.[0];
          return (
            <div key={d} className="horarios-dia">
              <label className="check">
                <input type="checkbox" checked={!!faixa} onChange={(e) => setDia(d, e.target.checked ? ['09:00', '18:00'] : null)} />
                {DIAS[d]}
              </label>
              {faixa ? (
                <div className="row">
                  <input className="input" type="time" value={faixa[0]} onChange={(e) => setDia(d, [e.target.value, faixa[1]])} aria-label={`${DIAS[d]} abre`} />
                  <span className="faint">às</span>
                  <input className="input" type="time" value={faixa[1]} onChange={(e) => setDia(d, [faixa[0], e.target.value])} aria-label={`${DIAS[d]} fecha`} />
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

export default function Agenda() {
  const { user } = useAuth();
  const avisar = useToast();
  const [semana, setSemana] = useState(() => inicioDaSemana(new Date()));
  const [cfg, setCfg] = useState(null);
  const [eventos, setEventos] = useState([]);
  const [configurando, setConfigurando] = useState(false);
  const [novo, setNovo] = useState(null);
  const [aberto, setAberto] = useState(null);

  const dias = useMemo(() => Array.from({ length: 7 }, (_, i) => somaDias(semana, i)), [semana]);

  const carregar = useCallback(async () => {
    const [{ data: c }, { data: ev }] = await Promise.all([
      supabase.from('agenda_config').select('*').maybeSingle(),
      supabase
        .from('agendamentos')
        .select('*')
        .gte('inicio', semana.toISOString())
        .lt('inicio', somaDias(semana, 7).toISOString())
        .order('inicio'),
    ]);
    setCfg(c ?? { ...PADRAO, owner_id: user.id });
    setEventos(ev ?? []);
  }, [semana, user]);

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
      owner_id: user.id,
      ativa: c.ativa,
      fuso: c.fuso || 'America/Sao_Paulo',
      duracao_min: c.duracao_min,
      antecedencia_horas: c.antecedencia_horas,
      horarios: c.horarios,
    });
    if (error) return avisar('Não deu para salvar', { erro: true, texto: error.message });
    setConfigurando(false);
    avisar(c.ativa ? 'Agenda ligada' : 'Horários salvos');
    carregar();
  };

  const marcar = async (f) => {
    const inicio = new Date(`${f.dia}T${f.hora}:00`);
    const fim = new Date(inicio.getTime() + Number(f.duracao || 30) * 60000);
    const { error } = await supabase.from('agendamentos').insert({
      owner_id: user.id,
      cliente_nome: f.cliente_nome.trim(),
      cliente_contato: f.cliente_contato.trim() || null,
      servico: f.servico.trim() || null,
      inicio: inicio.toISOString(),
      fim: fim.toISOString(),
      origem: 'manual',
    });
    if (error) return avisar('Não deu para marcar', { erro: true, texto: error.message });
    setNovo(null);
    avisar('Horário marcado');
    carregar();
  };

  const mudarStatus = async (status) => {
    const { error } = await supabase.from('agendamentos').update({ status }).eq('id', aberto.id);
    if (error) return avisar('Não deu para atualizar', { erro: true, texto: error.message });
    setAberto(null);
    carregar();
  };

  const fechado = (d, h) => {
    const faixas = cfg?.horarios?.[d.getDay()] ?? [];
    return !faixas.some(([a, b]) => h * 60 >= hm(a) && h * 60 < hm(b));
  };

  const hoje = new Date();
  const titulo = `${dias[0].toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })} – ${dias[6].toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' })}`;

  return (
    <div className="page page-wide">
      <header className="page-head">
        <div>
          <h1>Agenda</h1>
          <p>Horários marcados por você e pelo atendente. Em amarelo, os que ele marcou sozinho.</p>
        </div>
        <div className="row row-wrap">
          <button type="button" className="btn btn-ghost" onClick={() => setConfigurando(true)}><Settings2 /> Horários</button>
          <button type="button" className="btn btn-primary" onClick={() => setNovo({ dia: iso(new Date()), hora: '09:00' })}><Plus /> Agendar</button>
        </div>
      </header>

      {cfg && !cfg.ativa && (
        <div className="alert" style={{ marginBottom: 16 }}>
          <span>
            A agenda está desligada para o atendente. <button type="button" className="link-btn" onClick={() => setConfigurando(true)}>Ligar e definir horários</button>
            {' '}— depois, no assistente, marque “O assistente marca sozinho?” como sim.
          </span>
        </div>
      )}

      <div className="row" style={{ marginBottom: 12 }}>
        <button type="button" className="btn btn-ghost btn-icon" aria-label="Semana anterior" onClick={() => setSemana((s) => somaDias(s, -7))}><ChevronLeft /></button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSemana(inicioDaSemana(new Date()))}>Hoje</button>
        <button type="button" className="btn btn-ghost btn-icon" aria-label="Próxima semana" onClick={() => setSemana((s) => somaDias(s, 7))}><ChevronRight /></button>
        <b style={{ marginLeft: 6 }}>{titulo}</b>
      </div>

      <div className="cal">
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
              <div
                key={h}
                className={`cal-slot${fechado(d, h) ? ' fechado' : ''}`}
                onDoubleClick={() => setNovo({ dia: iso(d), hora: `${String(h).padStart(2, '0')}:00` })}
              />
            ))}
            {eventos
              .filter((e) => mesmoDia(new Date(e.inicio), d))
              .map((e) => {
                const ini = new Date(e.inicio);
                const fim = new Date(e.fim);
                const top = ((ini.getHours() + ini.getMinutes() / 60 - hIni) * HORA_PX);
                const altura = Math.max(24, ((fim - ini) / 3600000) * HORA_PX - 2);
                return (
                  <button
                    key={e.id}
                    type="button"
                    className="cal-ev"
                    data-origem={e.origem}
                    data-status={e.status}
                    data-curto={altura < 40}
                    style={{ top, height: altura }}
                    onClick={() => setAberto(e)}
                  >
                    <b>{e.status === 'pendente' ? '⏳ ' : ''}{e.cliente_nome}</b>
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
      <p className="faint" style={{ fontSize: 12.5, marginTop: 8 }}>Dica: clique duas vezes num horário vazio para agendar.</p>

      {configurando && cfg && <ConfigAgenda cfg={cfg} onSalvar={salvarCfg} onFechar={() => setConfigurando(false)} />}
      {novo && <NovoAgendamento inicial={novo} duracao={cfg?.duracao_min ?? 30} onSalvar={marcar} onFechar={() => setNovo(null)} />}

      {aberto && (
        <Drawer
          aberto
          onFechar={() => setAberto(null)}
          titulo={aberto.cliente_nome}
          sub={new Date(aberto.inicio).toLocaleString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}
          rodape={
            aberto.status === 'pendente' ? (
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
          <dl className="stack stack-sm" style={{ margin: 0 }}>
            <div><dt className="eyebrow">Serviço</dt><dd style={{ margin: 0 }}>{aberto.servico || '—'}</dd></div>
            <div><dt className="eyebrow">Contato</dt><dd style={{ margin: 0 }}>{aberto.cliente_contato || '—'}</dd></div>
            <div><dt className="eyebrow">Situação</dt><dd style={{ margin: 0 }}>{aberto.status === 'pendente' ? 'Pendente — aguardando sua confirmação' : aberto.status}</dd></div>
            {aberto.valor != null && <div><dt className="eyebrow">Valor</dt><dd style={{ margin: 0 }}>{Number(aberto.valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</dd></div>}
            <div><dt className="eyebrow">Marcado por</dt><dd style={{ margin: 0 }}>{aberto.origem === 'assistente' ? 'Atendente virtual' : 'Você'}</dd></div>
            {aberto.observacao && <div><dt className="eyebrow">Observação</dt><dd style={{ margin: 0 }}>{aberto.observacao}</dd></div>}
          </dl>
        </Drawer>
      )}
    </div>
  );
}
