import { useEffect, useRef, useState } from 'react';
import { Ban, CalendarDays, ChevronDown, FileText, Lock, Plus, RotateCcw, Ticket, X } from 'lucide-react';
import MenuMais from '@/components/MenuMais';
import { Link } from 'react-router-dom';
import { PLANS } from '@/lib/plans';
import { useBuilder } from './BuilderContext';
import { MODELOS, semNoItem } from '@/lib/documento';
import { useToast } from '@/components/Toasts';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

function Controle({ def, value, onChange, id }) {
  if (def.type === 'select' && def.options?.length) {
    return (
      <select id={id} className="select" value={value || ''} onChange={(e) => onChange(e.target.value)}>
        <option value="">Escolha…</option>
        {def.options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    );
  }
  if (def.type === 'textarea') {
    return <textarea id={id} className="textarea" rows={3} value={value || ''} placeholder={def.hint || ''} onChange={(e) => onChange(e.target.value)} />;
  }
  return <input id={id} className="input" value={value || ''} placeholder={def.hint || ''} onChange={(e) => onChange(e.target.value)} />;
}

// rótulo com inicial maiúscula, venha o schema como vier
const cap = (t) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : t);

function Campo({ def }) {
  const b = useBuilder();
  const entry = b.config.fields[def.key];
  const pulado = entry?.status === 'ignorado';
  const falta = !pulado && !String(entry?.value ?? '').trim();
  const id = `f-${def.key}`;

  return (
    <div className="doc-field" data-chave={def.key} data-off={pulado ? 'true' : undefined} data-fresh={b.fresh.includes(def.key) ? 'true' : 'false'}>
      <div className="doc-field-top">
        <label className="label" htmlFor={id}>
          {cap(def.label)}
          {def.importance === 'critical' && <span className="req" aria-label="obrigatório">*</span>}
        </label>
        {falta && def.importance === 'critical' && <span className="flag">falta</span>}
        {pulado && <span className="flag flag-mute">não se aplica</span>}
        <span className="spacer" />
        {/* campo obrigatório não pode ser dispensado: sem ele não dá para publicar */}
        {pulado ? (
          <button type="button" className="btn btn-quiet btn-icon btn-sm" onClick={() => b.restoreField(def.key)} title="Voltar a preencher" aria-label={`Voltar a preencher ${def.label}`}>
            <RotateCcw size={15} />
          </button>
        ) : def.importance !== 'critical' && (
          <MenuMais rotulo={`Opções de ${def.label}`} itens={[{ rotulo: 'Não se aplica', Icone: Ban, onClick: () => b.skipField(def.key) }]} />
        )}
      </div>
      {!pulado && <Controle def={def} id={id} value={entry?.value} onChange={(v) => b.setField(def.key, v)} />}
      {def.hint && def.type === 'select' && !pulado && <span className="hint">{def.hint}</span>}
    </div>
  );
}

function Lista({ def }) {
  const b = useBuilder();
  const itens = b.config.collections[def.key] || [];
  // itens fechados numa linha (nome · preço · …); abre para editar. Item novo já vem aberto
  const [abertos, setAbertos] = useState(() => new Set());
  const antes = useRef(itens.length);
  useEffect(() => {
    if (itens.length > antes.current) setAbertos((a) => new Set(a).add(itens.length - 1));
    antes.current = itens.length;
  }, [itens.length]);
  const alternarItem = (i) => setAbertos((a) => {
    const n = new Set(a);
    if (n.has(i)) n.delete(i);
    else n.add(i);
    return n;
  });
  const dispensada = b.config.declined.collections.includes(def.key);
  // a lista virou tabela em Dados: não é "não se aplica", ela mora lá agora
  const tabela = dispensada ? b.emTabela?.[def.key] : null;
  const pulados = b.config.declined.item_fields[def.key] || [];
  const atributos = def.item_fields.filter((f) => !pulados.includes(f.key));
  const falta = !dispensada && itens.length < (def.min ?? 1);

  return (
    <div className="doc-field" data-chave={def.key} data-fresh={b.fresh.includes(def.key) ? 'true' : 'false'}>
      <div className="doc-field-top">
        <span className="label">
          {cap(def.label)}
          {def.importance === 'critical' && <span className="req" aria-label="obrigatório">*</span>}
        </span>
        {falta && def.importance === 'critical' && <span className="flag">falta</span>}
        {dispensada && !tabela && <span className="flag flag-mute">não se aplica</span>}
        {tabela && <a className="flag flag-mute" href="/painel/dados" target="_blank" rel="noreferrer">na tabela {tabela}, em Dados</a>}
        {!dispensada && itens.length > 0 && <span className="flag flag-mute">{itens.length} {itens.length === 1 ? 'item' : 'itens'}</span>}
        <span className="spacer" />
        <button
          type="button"
          className="btn btn-quiet btn-icon"
          onClick={() => (dispensada ? b.restoreCollection(def.key) : b.skipCollection(def.key))}
          title={dispensada ? 'Voltar a listar' : 'Não se aplica'}
          aria-label={dispensada ? `Voltar a listar ${def.label}` : `${def.label} não se aplica`}
        >
          {dispensada ? <RotateCcw size={16} /> : <X size={16} />}
        </button>
      </div>
      {def.note && <span className="hint">{def.note}</span>}

      {!dispensada && pulados.length > 0 && (
        <div className="row row-wrap" style={{ gap: 6 }}>
          {def.item_fields
            .filter((f) => pulados.includes(f.key))
            .map((f) => (
              <span key={f.key} className="chip-off">
                <s>{f.label}</s> dispensado em todos
                <button type="button" aria-label={`Voltar a pedir ${f.label}`} title="Voltar a pedir" onClick={() => b.restoreListAttr(def.key, f.key)}>
                  <RotateCcw size={13} />
                </button>
              </span>
            ))}
        </div>
      )}

      {!dispensada && (
        <div className="items">
          {itens.map((item, i) => {
            const faltam = b.incomplete[`${def.key}:${i}`];
            const semAqui = semNoItem(item);
            const aberto = abertos.has(i);
            const resumo = atributos.map((f) => String(item[f.key] ?? '').trim()).filter(Boolean);
            return (
              <div className="item" key={i} data-aberto={aberto || undefined}>
                <div className="item-head">
                  <button type="button" className="item-linha" onClick={() => alternarItem(i)} aria-expanded={aberto}>
                    <b>{resumo[0] || `Item ${i + 1}`}</b>
                    {resumo.length > 1 && <span>{resumo.slice(1, 3).join(' · ')}</span>}
                  </button>
                  {faltam && <span className="flag">falta {faltam.join(', ').toLowerCase()}</span>}
                  <button type="button" className="btn btn-quiet btn-sm" onClick={() => alternarItem(i)}>{aberto ? 'Fechar' : 'Editar'}</button>
                  <button type="button" className="btn btn-quiet btn-icon btn-sm" aria-label={`Remover item ${i + 1}`} onClick={() => b.removeItem(def.key, i)}>
                    <X size={15} />
                  </button>
                </div>
                {aberto && <div className="item-fields">
                  {atributos.map((f, j) => {
                    const id = `i-${def.key}-${i}-${f.key}`;
                    const off = semAqui.includes(f.key);
                    return (
                      <div key={f.key} className={`field item-attr${f.type === 'textarea' ? ' wide' : ''}`} data-off={off ? 'true' : undefined}>
                        <span className="label item-attr-top" style={{ fontSize: 12.5 }}>
                          <label htmlFor={id}>
                            {cap(f.label)}
                            {f.required && !off && <span className="req">*</span>}
                          </label>
                          {j > 0 && (
                            <button
                              type="button"
                              className="item-attr-x"
                              title={off ? 'Voltar a preencher' : 'Não informar neste item'}
                              aria-label={off ? `Voltar a preencher ${f.label}` : `Não informar ${f.label} neste item`}
                              onClick={() => (off ? b.restoreItemAttr(def.key, i, f.key) : b.skipItemAttr(def.key, i, f.key))}
                            >
                              {off ? <RotateCcw size={12} /> : <X size={12} />}
                            </button>
                          )}
                        </span>
                        {off ? (
                          <div className="doc-skipped">não informado</div>
                        ) : (
                          <Controle def={f} id={id} value={item[f.key]} onChange={(v) => b.setItemField(def.key, i, f.key, v)} />
                        )}
                      </div>
                    );
                  })}
                </div>}
              </div>
            );
          })}
          <button type="button" className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => b.addItem(def.key)}>
            <Plus /> Adicionar {itens.length ? 'outro' : 'item'}
          </button>
        </div>
      )}
    </div>
  );
}

/** Um "+ Campo" só, no fim da ficha: a pessoa escolhe em que parte ele entra. */
function NovoCampo({ secoes }) {
  const b = useBuilder();
  const avisar = useToast();
  const [aberto, setAberto] = useState(false);
  const [rotulo, setRotulo] = useState('');
  const [longo, setLongo] = useState(false);
  const [secao, setSecao] = useState(secoes[0]?.key ?? '');

  if (!secoes.length) return null;
  if (!aberto) {
    return (
      <button type="button" className="btn btn-quiet btn-sm doc-campo-novo" onClick={() => setAberto(true)}>
        <Plus /> Campo
      </button>
    );
  }
  const salvar = async (e) => {
    e.preventDefault();
    if (!rotulo.trim()) return;
    try {
      await b.criarCampo({ section: secao, label: rotulo.trim(), type: longo ? 'textarea' : 'text' });
      setRotulo('');
      setAberto(false);
    } catch (err) {
      avisar('Não deu para criar o campo', { erro: true, texto: err.message });
    }
  };
  return (
    <form className="row row-wrap doc-campo-novo" onSubmit={salvar}>
      <input className="input" style={{ width: 220 }} autoFocus placeholder="Nome do campo" aria-label="Nome do campo" value={rotulo} onChange={(e) => setRotulo(e.target.value)} />
      <select className="select" style={{ width: 'auto' }} aria-label="Em que parte da ficha" value={secao} onChange={(e) => setSecao(e.target.value)}>
        {secoes.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
      </select>
      <label className="check" style={{ fontSize: 13 }}>
        <input type="checkbox" checked={longo} onChange={(e) => setLongo(e.target.checked)} /> texto longo
      </label>
      <button className="btn btn-primary btn-sm">Criar</button>
      <button type="button" className="btn btn-quiet btn-sm" onClick={() => setAberto(false)}>Cancelar</button>
    </form>
  );
}

/** Escolha manual do tipo de negócio (obrigatória sem a IA, opcional com ela). */
export function EscolherModelo({ compacto }) {
  const b = useBuilder();
  const avisar = useToast();
  const [ramo, setRamo] = useState(b.ramo || '');

  const escolher = async (m) => {
    try {
      await b.escolherModelo(m, ramo.trim() || undefined);
    } catch (e) {
      avisar('Não deu para salvar', { erro: true, texto: e.message });
    }
  };

  return (
    <div className="stack">
      {!compacto && (
        <div>
          <p className="eyebrow">Primeiro passo</p>
          <h2 style={{ fontSize: 26, marginTop: 6 }}>Que tipo de negócio é?</h2>
          <p className="muted" style={{ marginTop: 6 }}>Isso decide o que o assistente precisa saber: uma loja tem frete, um professor não.</p>
        </div>
      )}
      <label className="field" style={{ maxWidth: 420 }}>
        <span className="label">Ramo</span>
        <input className="input" placeholder="Ex.: barbearia, loja de roupas, clínica odontológica" value={ramo} onChange={(e) => setRamo(e.target.value)} />
      </label>
      <div className="grid-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
        {MODELOS.map((m) => (
          <button
            key={m.id}
            type="button"
            className="card card-tight"
            style={{ textAlign: 'left', cursor: 'pointer', borderColor: b.modelo === m.id ? 'var(--tinta)' : undefined, boxShadow: b.modelo === m.id ? 'inset 0 0 0 1px var(--tinta)' : undefined }}
            onClick={() => escolher(m.id)}
          >
            <b>{m.nome}</b>
            <p className="faint" style={{ fontSize: 13, marginTop: 2 }}>{m.desc}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

const SECOES_COM_CAMPO_NOVO = ['assistente', 'conhecimento', 'operacao', 'escalonamento', 'catalogo'];

const NAO = 'Não, ele resolve sozinho';

const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const SEM_AGENDA = 'Não usa agenda';

/** Agenda: ligar, marcar sozinho ou pendente, registrar nos Dados. Dias, horários e serviços vêm da Agenda. */
function PainelAgenda() {
  const b = useBuilder();
  const { user } = useAuth();
  const [agenda, setAgenda] = useState(null);
  const valor = (k) => (b.config.fields[k]?.status === 'ignorado' ? '' : b.config.fields[k]?.value ?? '');
  const usa = /^sim/i.test(valor('usar_agenda'));
  const confirma = /confirmo/i.test(valor('usar_agenda'));
  const registra = /^sim/i.test(valor('agenda_registrar'));

  // o chat também mexe na agenda: recarrega quando o documento muda
  useEffect(() => {
    if (!user) return;
    supabase.from('agenda_config').select('horarios, duracao_min, servicos').eq('owner_id', user.id).maybeSingle()
      .then(({ data }) => setAgenda(data ?? null));
  }, [user, b.config]);

  const dias = agenda?.horarios
    ? DIAS.map((d, i) => [d, agenda.horarios[String(i)] ?? []]).filter(([, f]) => f.length)
    : [];

  return (
    <details className="doc-section chamados" open aria-labelledby="sec-agenda">
      <summary className="doc-section-head">
        <div>
          <h2 id="sec-agenda">
            <CalendarDays aria-hidden="true" /> Agenda
          </h2>
          <p>{usa ? (confirma ? 'Ele anota o pedido e você confirma.' : 'Ele marca sozinho nos horários livres.') : 'Desligada: ele não marca horários.'}</p>
        </div>
        <ChevronDown className="chamados-seta" aria-hidden="true" />
      </summary>
      <div className="chamados-corpo">
        <label className="interruptor">
          <input type="checkbox" checked={usa} onChange={(e) => b.setField('usar_agenda', e.target.checked ? 'Sim, marca sozinho' : SEM_AGENDA)} />
          <span className="interruptor-trilho" aria-hidden="true" />
          <span>
            <b>Ele marca horários</b>
            <small>Consulta os horários livres da sua agenda e marca para o cliente.</small>
          </span>
        </label>
        {usa && (
          <>
            <label className="check-linha">
              <input type="checkbox" checked={confirma} onChange={(e) => b.setField('usar_agenda', e.target.checked ? 'Sim, mas eu confirmo' : 'Sim, marca sozinho')} />
              <span><b>Quero confirmar antes</b> — o horário fica pendente na Agenda até você aprovar.</span>
            </label>
            <label className="check-linha">
              <input type="checkbox" checked={/^s[oó]/i.test(b.config.fields.agenda_quem?.value ?? '')} onChange={(e) => b.setField('agenda_quem', e.target.checked ? 'Só quem entrou na conta' : 'Qualquer pessoa')} />
              <span><b>Só quem entrou na conta pode marcar</b> — o assistente pede para a pessoa entrar antes de marcar.</span>
            </label>
            <label className="check-linha">
              <input type="checkbox" checked={registra} onChange={(e) => b.setField('agenda_registrar', e.target.checked ? 'Sim, com o valor' : 'Não')} />
              <span><b>Atualizar os Dados sozinho</b> — cada agendamento entra na tabela “Agendamentos” com cliente, serviço e valor.</span>
            </label>
            <div className="agenda-resumo">
              <span className="label">Dias e horários</span>
              <p className="muted" style={{ fontSize: 13.5 }}>
                {dias.length ? dias.map(([d, f]) => `${d} ${f.map((x) => x.join('–')).join(', ')}`).join(' · ') : 'Ainda não definidos. Diga no chat (ex.: “seg a sex 9h às 18h, almoço das 12h às 13h”) ou ajuste na Agenda.'}
              </p>
              <span className="label">Serviços</span>
              {agenda?.servicos?.length ? (
                <ul className="agenda-servicos">
                  {agenda.servicos.map((x) => (
                    <li key={x.nome}>
                      <span>{x.nome}</span>
                      {x.duracao_min ? <b>{duracaoBonita(x.duracao_min)}</b> : <b className="falta">quanto tempo?</b>}
                      <span className="faint">{x.valor != null ? `R$ ${Number(x.valor).toFixed(2).replace('.', ',')}` : 'sem valor'}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted" style={{ fontSize: 13.5 }}>Nenhum ainda. Ex.: “corte 1h R$ 45, corte e barba 1h30 R$ 70”.</p>
              )}
              <Link to="/painel/agenda" target="_blank" style={{ fontSize: 13 }}>Abrir a Agenda</Link>
            </div>
          </>
        )}
      </div>
    </details>
  );
}

/** 90 → "1h30", 60 → "1h", 40 → "40 min". */
function duracaoBonita(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (!h) return `${m} min`;
  return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`;
}

/** Chamados: tudo por clique, numa seção que abre e fecha. */
function PainelChamados({ sec }) {
  const b = useBuilder();
  const plano = PLANS[b.plano?.id] ?? PLANS.trial;
  const valor = (k) => (b.config.fields[k]?.status === 'ignorado' ? '' : b.config.fields[k]?.value ?? '');
  const ativos = plano.chamados && !/^n[aã]o/i.test(valor('chamados_ativos'));
  const codigo = valor('codigo_chamado');
  const [exigeSenha, setExigeSenha] = useState(!!codigo);
  const campo = (k) => sec.fields.find((f) => f.key === k);
  const contatos = sec.collections.find((c) => c.key === 'contatos');

  return (
    <details className="doc-section chamados" open aria-labelledby="sec-chamados">
      <summary className="doc-section-head">
        <div>
          <h2 id="sec-chamados">
            <Ticket aria-hidden="true" /> Chamados e equipe
          </h2>
          <p>{ativos ? 'Ligado: quando precisar, ele passa a conversa para a sua equipe.' : 'Desligado: ele resolve tudo sozinho.'}</p>
        </div>
        <ChevronDown className="chamados-seta" aria-hidden="true" />
      </summary>

      {!plano.chamados ? (
        <div className="alert">
          <Lock />
          <span>Chamados para a equipe não fazem parte do plano {plano.nome}. <Link to="/painel/plano">Ver planos</Link></span>
        </div>
      ) : (
        <div className="chamados-corpo">
          <label className="interruptor">
            <input
              type="checkbox"
              checked={ativos}
              onChange={(e) => b.setField('chamados_ativos', e.target.checked ? 'Sim' : NAO)}
            />
            <span className="interruptor-trilho" aria-hidden="true" />
            <span>
              <b>Pode abrir chamado para a equipe</b>
              <small>Desligue se não houver ninguém para responder, como num monitor de estudos.</small>
            </span>
          </label>

          {ativos && (
            <>
              <label className="field">
                <span className="label">Quando abrir chamado</span>
                <textarea
                  className="textarea"
                  rows={2}
                  value={valor('quando_chamar_humano')}
                  placeholder={campo('quando_chamar_humano')?.hint}
                  onChange={(e) => b.setField('quando_chamar_humano', e.target.value)}
                />
              </label>

              {plano.chamadosAvancados ? (
                <>
                  <label className="field">
                    <span className="label">Quando NÃO abrir chamado</span>
                    <textarea
                      className="textarea"
                      rows={2}
                      value={valor('nunca_chamar_humano')}
                      placeholder={campo('nunca_chamar_humano')?.hint}
                      onChange={(e) => b.setField('nunca_chamar_humano', e.target.value)}
                    />
                  </label>

                  <label className="check">
                    <input
                      type="checkbox"
                      checked={exigeSenha}
                      onChange={(e) => {
                        setExigeSenha(e.target.checked);
                        if (!e.target.checked) b.setField('codigo_chamado', '');
                      }}
                    />
                    <span>Exigir uma senha para abrir chamado</span>
                  </label>
                  {exigeSenha && (
                    <label className="field">
                      <span className="label">Senha</span>
                      <input
                        className="input"
                        value={codigo}
                        placeholder="Ex.: o código da turma, o número do contrato"
                        onChange={(e) => b.setField('codigo_chamado', e.target.value)}
                      />
                      <span className="hint">O assistente pede a senha antes de abrir o chamado e nunca diz qual é.</span>
                    </label>
                  )}
                </>
              ) : (
                <p className="hint">
                  <Lock size={12} style={{ display: 'inline', verticalAlign: -1 }} /> Senha para abrir chamado e casos em que não abrir fazem parte do
                  plano Profissional. <Link to="/painel/plano">Ver planos</Link>
                </p>
              )}

              {campo('horario') && <Campo def={campo('horario')} />}
            </>
          )}
          {contatos && <Lista def={contatos} />}
        </div>
      )}
    </details>
  );
}

function Materiais() {
  const b = useBuilder();
  const avisar = useToast();
  if (!b.materiais.length) return null;
  const tamanho = (n) => (n >= 1000 ? `${Math.round(n / 1000)} mil caracteres` : `${n} caracteres`);
  return (
    <section className="doc-section" aria-labelledby="sec-materiais">
      <div className="doc-section-head">
        <div>
          <h2 id="sec-materiais">Materiais de apoio</h2>
          <p>Arquivos que você mandou. O assistente lê o conteúdo completo na hora de atender.</p>
        </div>
      </div>
      <ul className="materiais">
        {b.materiais.map((m) => (
          <li key={m.id}>
            <FileText aria-hidden="true" />
            <div>
              <b>{m.nome}</b>
              <span>{tamanho(m.caracteres)} lidos</span>
            </div>
            <button
              type="button"
              className="btn btn-quiet btn-icon btn-sm"
              aria-label={`Tirar ${m.nome}`}
              onClick={() => b.removerMaterial(m.id).catch((e) => avisar('Não deu para tirar', { erro: true, texto: e.message }))}
            >
              <X size={15} />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Seção da ficha: à vista só o que já tem conteúdo, o obrigatório e o que a IA acabou de mexer.
 * O resto (opcional vazio, "não se aplica") fica em "Mais detalhes".
 */
function Secao({ sec }) {
  const b = useBuilder();
  const [mais, setMais] = useState(false);
  // o que a pessoa começou a preencher em "Mais detalhes" fica lá (senão o campo pularia de lugar no meio da digitação)
  const [ficam, setFicam] = useState(() => new Set());
  const temValor = (k) => String(b.config.fields[k]?.value ?? '').trim() !== '' && b.config.fields[k]?.status !== 'ignorado';
  const campoAVista = (f) => !ficam.has(f.key) && (f.importance === 'critical' || f.custom || temValor(f.key) || b.fresh.includes(f.key));
  const listaAVista = (c) =>
    !ficam.has(c.key) && (c.importance === 'critical' || (b.config.collections[c.key]?.length ?? 0) > 0 || !!b.emTabela?.[c.key] || b.fresh.includes(c.key));
  const campos = sec.fields.filter(campoAVista);
  const listas = sec.collections.filter(listaAVista);
  const escondidos = [...sec.fields.filter((f) => !campoAVista(f)), ...sec.collections.filter((c) => !listaAVista(c))];
  const ids = new Set(escondidos.map((x) => x.key));

  return (
    <section className="doc-section" aria-labelledby={`sec-${sec.key}`}>
      <div className="doc-section-head">
        <div>
          <h2 id={`sec-${sec.key}`}>{sec.label}</h2>
          {sec.note && <p>{sec.note}</p>}
        </div>
      </div>
      {campos.map((f) => <Campo key={f.key} def={f} />)}
      {listas.map((c) => <Lista key={c.key} def={c} />)}
      {escondidos.length > 0 && (
        <>
          <button type="button" className="doc-mais" onClick={() => setMais((v) => !v)} aria-expanded={mais}>
            <ChevronDown size={16} aria-hidden="true" />
            {mais ? 'Menos detalhes' : `Mais detalhes (${escondidos.length})`}
          </button>
          {mais && (
            <div
              className="doc-mais-lista"
              onFocusCapture={(e) => {
                const k = e.target.closest?.('[data-chave]')?.dataset.chave;
                if (k && !ficam.has(k)) setFicam((x) => new Set(x).add(k));
              }}
            >
              {sec.fields.filter((f) => ids.has(f.key)).map((f) => <Campo key={f.key} def={f} />)}
              {sec.collections.filter((c) => ids.has(c.key)).map((c) => <Lista key={c.key} def={c} />)}
            </div>
          )}
        </>
      )}
    </section>
  );
}

export default function Documento() {
  const b = useBuilder();

  if (!b.modelo) {
    return (
      <div className="doc">
        <EscolherModelo />
        {b.plano?.builderIA && (
          <p className="faint" style={{ marginTop: 18, fontSize: 13.5 }}>Ou conte no chat ao lado: o Helpy escolhe por você.</p>
        )}
      </div>
    );
  }

  return (
    <div className="doc">
      <Materiais />
      {b.schema.sections.map((sec) =>
        sec.key === 'escalonamento' ? (
          <PainelChamados key={sec.key} sec={sec} />
        ) : sec.key === 'agenda' ? (
          <PainelAgenda key={sec.key} />
        ) : (
        <Secao key={sec.key} sec={sec} />
        ),
      )}
      <NovoCampo secoes={b.schema.sections.filter((x) => SECOES_COM_CAMPO_NOVO.includes(x.key))} />
    </div>
  );
}
