import { useCallback, useEffect, useState } from 'react';
import { CalendarPlus, Loader2 } from 'lucide-react';
import { chamar } from '@/lib/supabase';
import { useToast } from '@/components/Toasts';
import { Modal } from '@/components/Modal';

const hojeIso = () => new Date().toLocaleDateString('en-CA');

/**
 * A agenda dentro do chamado: quem está atendendo marca, remarca e
 * cancela como o atendente virtual faria. O cliente recebe a mensagem
 * na conversa, e o horário vai para a Agenda (e para os Dados, se ligado).
 */
export default function AgendaDoChamado({ conversa, onMudou }) {
  const avisar = useToast();
  const [info, setInfo] = useState(null); // null = carregando; false = sem agenda
  const [form, setForm] = useState(null); // { modo: 'novo' | 'remarcar', id?, ... }
  const [livres, setLivres] = useState(null);
  const [ocupado, setOcupado] = useState(false);

  const carregar = useCallback(
    () => chamar('conta', { action: 'agenda_ver', conversation_id: conversa.id }).then(setInfo).catch(() => setInfo(false)),
    [conversa.id],
  );
  useEffect(() => {
    carregar();
  }, [carregar]);

  // horários livres do dia escolhido, já com a duração do serviço
  useEffect(() => {
    if (!form?.dia) return;
    let vivo = true;
    setLivres(null);
    chamar('conta', { action: 'agenda_horarios', conversation_id: conversa.id, dia: form.dia, servico: form.servico })
      .then((r) => vivo && setLivres(r.livres ?? []))
      .catch(() => vivo && setLivres([]));
    return () => {
      vivo = false;
    };
  }, [form?.dia, form?.servico, conversa.id]);

  if (!info) return null;

  const abrirNovo = () =>
    setForm({
      modo: 'novo',
      servico: info.servicos[0]?.nome ?? '',
      dia: hojeIso(),
      hora: '',
      nome: conversa.lead_nome ?? '',
      contato: conversa.lead_contato ?? '',
      observacao: '',
    });

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value, ...(k === 'dia' || k === 'servico' ? { hora: '' } : {}) }));

  const enviar = async (extra) => {
    setOcupado(true);
    try {
      if (extra?.cancelar) {
        await chamar('conta', { action: 'agenda_alterar', conversation_id: conversa.id, id: extra.id, cancelar: true });
        avisar('Horário cancelado', { texto: 'O cliente recebeu o aviso na conversa.' });
      } else if (form.modo === 'remarcar') {
        await chamar('conta', { action: 'agenda_alterar', conversation_id: conversa.id, id: form.id, dia: form.dia, hora: form.hora });
        avisar('Remarcado', { texto: 'O cliente recebeu o novo horário na conversa.' });
      } else {
        await chamar('conta', { action: 'agenda_marcar', conversation_id: conversa.id, ...form });
        avisar('Agendado', { texto: 'Está na Agenda, e o cliente recebeu a confirmação na conversa.' });
      }
      setForm(null);
      await carregar();
      onMudou?.();
    } catch (e) {
      avisar('Não deu certo', { erro: true, texto: e.message });
    } finally {
      setOcupado(false);
    }
  };

  return (
    <div className="chamado-agenda">
      <dt>Agenda</dt>
      <dd>
        {info.marcados.length === 0 && <span className="faint">Nada marcado nesta conversa.</span>}
        {info.marcados.map((m) => (
          <div key={m.id} className="chamado-agenda-item">
            <span>{m.texto}</span>
            <button type="button" className="btn btn-quiet btn-sm" disabled={ocupado} onClick={() => setForm({ modo: 'remarcar', id: m.id, dia: new Date(m.inicio).toLocaleDateString('en-CA'), hora: '' })}>
              Remarcar
            </button>
            <button
              type="button"
              className="btn btn-quiet btn-sm"
              disabled={ocupado}
              onClick={() => window.confirm('Cancelar este horário? O cliente recebe o aviso na conversa.') && enviar({ cancelar: true, id: m.id })}
            >
              Cancelar
            </button>
          </div>
        ))}
        <button type="button" className="btn btn-ghost btn-sm" onClick={abrirNovo} style={{ marginTop: 6 }}>
          <CalendarPlus size={15} /> Agendar
        </button>
      </dd>

      <Modal aberto={!!form} onFechar={() => setForm(null)} largura={520}>
        {form && (
          <div className="stack">
            <h2>{form.modo === 'remarcar' ? 'Remarcar horário' : 'Agendar para o cliente'}</h2>
            {form.modo === 'novo' && info.servicos.length > 0 && (
              <label className="field">
                <span className="label">Serviço</span>
                <select className="input" value={form.servico} onChange={set('servico')}>
                  {info.servicos.map((s) => (
                    <option key={s.nome} value={s.nome}>
                      {s.nome}{s.duracao_min ? ` · ${s.duracao_min} min` : ''}{s.valor != null ? ` · R$ ${Number(s.valor).toFixed(2).replace('.', ',')}` : ''}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="field">
              <span className="label">Dia</span>
              <input className="input" type="date" min={hojeIso()} value={form.dia} onChange={set('dia')} />
            </label>
            <div className="field">
              <span className="label">Horário livre</span>
              {livres === null ? (
                <span className="faint"><Loader2 className="spin" size={14} /> Vendo a agenda…</span>
              ) : livres.length === 0 ? (
                <span className="faint">Nenhum horário livre neste dia.</span>
              ) : (
                <div className="horas-livres">
                  {livres.map((h) => (
                    <button key={h} type="button" className="chip" aria-pressed={form.hora === h} onClick={() => setForm((f) => ({ ...f, hora: h }))}>
                      {h}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {form.modo === 'novo' && (
              <>
                <div className="grid-2">
                  <label className="field">
                    <span className="label">Nome do cliente</span>
                    <input className="input" value={form.nome} onChange={set('nome')} />
                  </label>
                  <label className="field">
                    <span className="label">Contato</span>
                    <input className="input" value={form.contato} onChange={set('contato')} />
                  </label>
                </div>
                <label className="field">
                  <span className="label">Observação</span>
                  <input className="input" placeholder="Ex.: degradê navalhado" value={form.observacao} onChange={set('observacao')} />
                </label>
              </>
            )}
            <div className="modal-foot">
              <button type="button" className="btn btn-ghost" onClick={() => setForm(null)}>Voltar</button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={ocupado || !form.hora || (form.modo === 'novo' && !form.nome.trim())}
                onClick={() => enviar()}
              >
                {ocupado ? <Loader2 className="spin" /> : <CalendarPlus />} {form.modo === 'remarcar' ? 'Remarcar' : 'Agendar'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
