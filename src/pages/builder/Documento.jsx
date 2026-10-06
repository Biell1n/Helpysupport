import { useState } from 'react';
import { Plus, RotateCcw, X } from 'lucide-react';
import { useBuilder } from './BuilderContext';
import { MODELOS } from '@/lib/documento';
import { useToast } from '@/components/Toasts';

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

function Campo({ def }) {
  const b = useBuilder();
  const entry = b.config.fields[def.key];
  const pulado = entry?.status === 'ignorado';
  const falta = !pulado && !String(entry?.value ?? '').trim();
  const id = `f-${def.key}`;

  return (
    <div className="doc-field" data-fresh={b.fresh.includes(def.key) ? 'true' : 'false'}>
      <div className="doc-field-top">
        <label className="label" htmlFor={id}>
          {def.label}
          {def.importance === 'critical' && <span className="req" aria-label="obrigatório">*</span>}
        </label>
        {falta && def.importance === 'critical' && <span className="flag">falta</span>}
        {pulado && <span className="flag flag-mute">não se aplica</span>}
      </div>
      <div className="doc-control">
        {pulado ? (
          <div className="doc-skipped">Você marcou que isto não se aplica.</div>
        ) : (
          <Controle def={def} id={id} value={entry?.value} onChange={(v) => b.setField(def.key, v)} />
        )}
        <button
          type="button"
          className="btn btn-quiet btn-icon"
          onClick={() => (pulado ? b.restoreField(def.key) : b.skipField(def.key))}
          title={pulado ? 'Voltar a preencher' : 'Não se aplica'}
          aria-label={pulado ? `Voltar a preencher ${def.label}` : `${def.label} não se aplica`}
        >
          {pulado ? <RotateCcw size={16} /> : <X size={16} />}
        </button>
      </div>
      {def.hint && def.type === 'select' && !pulado && <span className="hint">{def.hint}</span>}
    </div>
  );
}

function Lista({ def }) {
  const b = useBuilder();
  const itens = b.config.collections[def.key] || [];
  const dispensada = b.config.declined.collections.includes(def.key);
  const pulados = b.config.declined.item_fields[def.key] || [];
  const atributos = def.item_fields.filter((f) => !pulados.includes(f.key));
  const falta = !dispensada && itens.length < (def.min ?? 1);

  return (
    <div className="doc-field" data-fresh={b.fresh.includes(def.key) ? 'true' : 'false'}>
      <div className="doc-field-top">
        <span className="label">
          {def.label}
          {def.importance === 'critical' && <span className="req" aria-label="obrigatório">*</span>}
        </span>
        {falta && def.importance === 'critical' && <span className="flag">falta</span>}
        {dispensada && <span className="flag flag-mute">não se aplica</span>}
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

      {!dispensada && (
        <div className="items">
          {itens.map((item, i) => {
            const faltam = b.incomplete[`${def.key}:${i}`];
            return (
              <div className="item" key={i}>
                <div className="item-head">
                  <span className="mono faint">{String(i + 1).padStart(2, '0')}</span>
                  {faltam && <span className="flag">falta {faltam.join(', ').toLowerCase()}</span>}
                  <span className="spacer" />
                  <button type="button" className="btn btn-quiet btn-icon btn-sm" aria-label={`Remover item ${i + 1}`} onClick={() => b.removeItem(def.key, i)}>
                    <X size={15} />
                  </button>
                </div>
                <div className="item-fields">
                  {atributos.map((f) => {
                    const id = `i-${def.key}-${i}-${f.key}`;
                    return (
                      <label key={f.key} className={`field${f.type === 'textarea' ? ' wide' : ''}`} htmlFor={id}>
                        <span className="label" style={{ fontSize: 12.5 }}>
                          {f.label}
                          {f.required && <span className="req">*</span>}
                        </span>
                        <Controle def={f} id={id} value={item[f.key]} onChange={(v) => b.setItemField(def.key, i, f.key, v)} />
                      </label>
                    );
                  })}
                </div>
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

function NovoCampo({ secao }) {
  const b = useBuilder();
  const avisar = useToast();
  const [aberto, setAberto] = useState(false);
  const [rotulo, setRotulo] = useState('');
  const [longo, setLongo] = useState(false);

  if (!aberto) {
    return (
      <button type="button" className="btn btn-quiet btn-sm" onClick={() => setAberto(true)}>
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
    <form className="row row-wrap" onSubmit={salvar}>
      <input className="input" style={{ width: 220 }} autoFocus placeholder="Nome do campo" value={rotulo} onChange={(e) => setRotulo(e.target.value)} />
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
          <p className="muted" style={{ marginTop: 6 }}>Isso decide o que o atendente precisa saber: uma loja tem frete, um professor não.</p>
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
      {b.schema.sections.map((sec) => (
        <section key={sec.key} className="doc-section" aria-labelledby={`sec-${sec.key}`}>
          <div className="doc-section-head">
            <div>
              <h2 id={`sec-${sec.key}`}>{sec.label}</h2>
              {sec.note && <p>{sec.note}</p>}
            </div>
            {SECOES_COM_CAMPO_NOVO.includes(sec.key) && <NovoCampo secao={sec.key} />}
          </div>
          {sec.fields.map((f) => (
            <Campo key={f.key} def={f} />
          ))}
          {sec.collections.map((c) => (
            <Lista key={c.key} def={c} />
          ))}
        </section>
      ))}
    </div>
  );
}
