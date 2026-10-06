import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardPaste, Plus, Search, Settings2, Table2, Trash2, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/Toasts';
import { Confirmar, Drawer, Modal } from '@/components/Modal';
import { planOf } from '@/lib/plans';

const TIPOS = [
  { v: 'texto', r: 'Texto', d: 'Nome, categoria, cor.' },
  { v: 'texto_longo', r: 'Texto longo', d: 'Descrição, observação.' },
  { v: 'numero', r: 'Número', d: 'Quantidade, estoque, peso.' },
  { v: 'moeda', r: 'Valor (R$)', d: 'Preço.' },
  { v: 'data', r: 'Data', d: 'Dia, mês e ano.' },
  { v: 'selecao', r: 'Escolha', d: 'Uma opção de uma lista sua.' },
  { v: 'booleano', r: 'Sim ou não', d: 'Marcado ou desmarcado.' },
];

const chavear = (s) =>
  String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);

function Celula({ coluna, valor, onChange }) {
  if (coluna.tipo === 'booleano') {
    return (
      <div style={{ padding: '8px 10px', textAlign: 'center' }}>
        <input type="checkbox" checked={valor === true || valor === 'true' || valor === 'sim'} onChange={(e) => onChange(e.target.checked)} aria-label={coluna.rotulo} />
      </div>
    );
  }
  if (coluna.tipo === 'selecao' && coluna.opcoes?.length) {
    return (
      <select className="sheet-cell" value={valor ?? ''} onChange={(e) => onChange(e.target.value)} aria-label={coluna.rotulo}>
        <option value="">—</option>
        {coluna.opcoes.map((o) => <option key={o}>{o}</option>)}
      </select>
    );
  }
  return (
    <input
      className={`sheet-cell${coluna.tipo === 'numero' || coluna.tipo === 'moeda' ? ' numero' : ''}`}
      type={coluna.tipo === 'data' ? 'date' : 'text'}
      inputMode={coluna.tipo === 'numero' || coluna.tipo === 'moeda' ? 'decimal' : undefined}
      value={valor ?? ''}
      placeholder={coluna.tipo === 'moeda' ? 'R$' : ''}
      onChange={(e) => onChange(e.target.value)}
      aria-label={coluna.rotulo}
    />
  );
}

function EditorColuna({ coluna, onSalvar, onExcluir, onFechar }) {
  const [rotulo, setRotulo] = useState(coluna?.rotulo ?? '');
  const [tipo, setTipo] = useState(coluna?.tipo ?? 'texto');
  const [opcoes, setOpcoes] = useState((coluna?.opcoes ?? []).join(', '));
  const [obrigatoria, setObrigatoria] = useState(!!coluna?.obrigatoria);
  const [padrao, setPadrao] = useState(coluna?.padrao ?? '');

  return (
    <Drawer
      aberto
      onFechar={onFechar}
      titulo={coluna?.id ? 'Editar coluna' : 'Nova coluna'}
      sub="O assistente lê o nome da coluna para entender o que ela guarda."
      rodape={
        <>
          {coluna?.id && <button type="button" className="btn btn-danger" style={{ marginRight: 'auto' }} onClick={() => onExcluir(coluna)}><Trash2 /> Excluir</button>}
          <button type="button" className="btn btn-ghost" onClick={onFechar}>Cancelar</button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!rotulo.trim()}
            onClick={() =>
              onSalvar({
                ...coluna,
                rotulo: rotulo.trim(),
                tipo,
                obrigatoria,
                padrao: padrao.trim() || null,
                opcoes: tipo === 'selecao' ? opcoes.split(',').map((o) => o.trim()).filter(Boolean) : null,
              })
            }
          >
            Salvar coluna
          </button>
        </>
      }
    >
      <label className="field">
        <span className="label">Nome</span>
        <input className="input" autoFocus value={rotulo} onChange={(e) => setRotulo(e.target.value)} placeholder="Ex.: Preço, Tamanho, Estoque" />
      </label>
      <label className="field">
        <span className="label">Tipo</span>
        <select className="select" value={tipo} onChange={(e) => setTipo(e.target.value)}>
          {TIPOS.map((t) => <option key={t.v} value={t.v}>{t.r}</option>)}
        </select>
        <span className="hint">{TIPOS.find((t) => t.v === tipo)?.d}</span>
      </label>
      {tipo === 'selecao' && (
        <label className="field">
          <span className="label">Opções</span>
          <input className="input" value={opcoes} onChange={(e) => setOpcoes(e.target.value)} placeholder="P, M, G, GG" />
          <span className="hint">Separe por vírgula.</span>
        </label>
      )}
      <label className="field">
        <span className="label">Valor padrão</span>
        <input className="input" value={padrao} onChange={(e) => setPadrao(e.target.value)} />
        <span className="hint">Preenchido sozinho em cada linha nova.</span>
      </label>
      <label className="check">
        <input type="checkbox" checked={obrigatoria} onChange={(e) => setObrigatoria(e.target.checked)} />
        <span>Obrigatória</span>
      </label>
    </Drawer>
  );
}

export default function Dados() {
  const { user, profile } = useAuth();
  const avisar = useToast();
  const plano = planOf(profile);

  const [tabelas, setTabelas] = useState(null);
  const [assistentes, setAssistentes] = useState([]);
  const [ativaId, setAtivaId] = useState(null);
  const [colunas, setColunas] = useState([]);
  const [linhas, setLinhas] = useState([]);
  const [vinculos, setVinculos] = useState([]);
  const [busca, setBusca] = useState('');
  const [editando, setEditando] = useState(null);
  const [criando, setCriando] = useState(false);
  const [novoNome, setNovoNome] = useState('');
  const [colando, setColando] = useState(false);
  const [colado, setColado] = useState('');
  const [excluir, setExcluir] = useState(null);
  const timers = useRef({});

  const ativa = tabelas?.find((t) => t.id === ativaId);

  const carregarTabelas = useCallback(async () => {
    const [{ data: t }, { data: a }] = await Promise.all([
      supabase.from('tabelas').select('*, tabela_linhas(count)').order('criada_em'),
      supabase.from('assistants').select('id, name').order('created_at'),
    ]);
    setTabelas(t ?? []);
    setAssistentes(a ?? []);
    setAtivaId((id) => id ?? t?.[0]?.id ?? null);
  }, []);

  useEffect(() => {
    carregarTabelas();
  }, [carregarTabelas]);

  const carregarConteudo = useCallback(async (id) => {
    const [c, l, v] = await Promise.all([
      supabase.from('tabela_colunas').select('*').eq('tabela_id', id).order('ordem'),
      supabase.from('tabela_linhas').select('*').eq('tabela_id', id).order('criada_em').limit(2000),
      supabase.from('assistente_tabelas').select('assistant_id').eq('tabela_id', id),
    ]);
    setColunas(c.data ?? []);
    setLinhas(l.data ?? []);
    setVinculos((v.data ?? []).map((x) => x.assistant_id));
  }, []);

  useEffect(() => {
    if (ativaId) carregarConteudo(ativaId);
  }, [ativaId, carregarConteudo]);

  useEffect(() => () => Object.values(timers.current).forEach(clearTimeout), []);

  // ---- tabela ----
  const criarTabela = async (e) => {
    e.preventDefault();
    const nome = novoNome.trim();
    if (!nome) return;
    const { data, error } = await supabase.from('tabelas').insert({ owner_id: user.id, nome }).select().single();
    if (error) return avisar('Não deu para criar a tabela', { erro: true, texto: error.message });
    await supabase.from('tabela_colunas').insert([
      { tabela_id: data.id, chave: 'nome', rotulo: 'Nome', tipo: 'texto', ordem: 0, obrigatoria: true, identifica: true, chave_primaria: true },
      { tabela_id: data.id, chave: 'preco', rotulo: 'Preço', tipo: 'moeda', ordem: 1 },
    ]);
    // nasce ligada a todos os assistentes: é o que quase todo mundo quer
    if (assistentes.length) {
      await supabase.from('assistente_tabelas').insert(assistentes.map((a) => ({ assistant_id: a.id, tabela_id: data.id })));
    }
    setCriando(false);
    setNovoNome('');
    await carregarTabelas();
    setAtivaId(data.id);
  };

  const salvarProposito = async (proposito) => {
    await supabase.from('tabelas').update({ proposito }).eq('id', ativaId);
    setTabelas((p) => p.map((t) => (t.id === ativaId ? { ...t, proposito } : t)));
  };

  const alternarVinculo = async (assistantId) => {
    if (vinculos.includes(assistantId)) {
      await supabase.from('assistente_tabelas').delete().eq('assistant_id', assistantId).eq('tabela_id', ativaId);
      setVinculos((p) => p.filter((x) => x !== assistantId));
    } else {
      await supabase.from('assistente_tabelas').insert({ assistant_id: assistantId, tabela_id: ativaId });
      setVinculos((p) => [...p, assistantId]);
    }
  };

  // ---- colunas ----
  const salvarColuna = async (d) => {
    const campos = { rotulo: d.rotulo, tipo: d.tipo, obrigatoria: d.obrigatoria, padrao: d.padrao, opcoes: d.opcoes };
    const r = d.id
      ? await supabase.from('tabela_colunas').update(campos).eq('id', d.id)
      : await supabase.from('tabela_colunas').insert({ ...campos, tabela_id: ativaId, chave: chavear(d.rotulo) || `coluna_${colunas.length + 1}`, ordem: colunas.length });
    if (r.error) return avisar('Não deu para salvar a coluna', { erro: true, texto: /duplicate/i.test(r.error.message) ? 'Já existe uma coluna com esse nome.' : r.error.message });
    setEditando(null);
    carregarConteudo(ativaId);
  };

  // ---- linhas ----
  const novaLinha = async () => {
    const dados = Object.fromEntries(colunas.filter((c) => c.padrao).map((c) => [c.chave, c.padrao]));
    const { data, error } = await supabase.from('tabela_linhas').insert({ tabela_id: ativaId, dados }).select().single();
    if (error) return avisar('Não deu para adicionar', { erro: true, texto: error.message });
    setLinhas((p) => [...p, data]);
    setTimeout(() => document.querySelector(`[data-linha="${data.id}"] .sheet-cell`)?.focus(), 50);
  };

  // grava 600ms depois da última tecla, não a cada tecla
  const editar = (linhaId, chave, valor) => {
    setLinhas((prev) => {
      const nova = prev.map((l) => (l.id === linhaId ? { ...l, dados: { ...l.dados, [chave]: valor } } : l));
      clearTimeout(timers.current[linhaId]);
      timers.current[linhaId] = setTimeout(async () => {
        const atual = nova.find((l) => l.id === linhaId);
        const { error } = await supabase.from('tabela_linhas').update({ dados: atual?.dados ?? {} }).eq('id', linhaId);
        if (error) avisar('Uma célula não foi salva', { erro: true, texto: error.message });
      }, 600);
      return nova;
    });
  };

  const importar = async () => {
    const texto = colado.trim();
    if (!texto) return;
    const sep = texto.includes('\t') ? '\t' : texto.includes(';') ? ';' : ',';
    let linhasTxt = texto.split(/\r?\n/).filter((l) => l.trim());
    // primeira linha igual aos nomes das colunas? é cabeçalho
    const primeira = linhasTxt[0].split(sep).map((x) => chavear(x));
    if (primeira.some((p) => colunas.some((c) => c.chave === p || chavear(c.rotulo) === p))) linhasTxt = linhasTxt.slice(1);
    const novas = linhasTxt
      .map((l) => {
        const partes = l.split(sep).map((p) => p.trim());
        return { tabela_id: ativaId, dados: Object.fromEntries(colunas.map((c, i) => [c.chave, partes[i] ?? '']).filter(([, v]) => v)) };
      })
      .filter((n) => Object.keys(n.dados).length);
    if (!novas.length) return avisar('Não reconheci nenhuma linha', { erro: true });
    const { error } = await supabase.from('tabela_linhas').insert(novas);
    if (error) return avisar('Não deu para importar', { erro: true, texto: error.message });
    setColando(false);
    setColado('');
    carregarConteudo(ativaId);
    avisar(`${novas.length} linhas adicionadas`);
  };

  const confirmarExclusao = async () => {
    const alvo = excluir;
    setExcluir(null);
    if (alvo.tipo === 'linha') {
      await supabase.from('tabela_linhas').delete().eq('id', alvo.id);
      setLinhas((p) => p.filter((l) => l.id !== alvo.id));
    } else if (alvo.tipo === 'coluna') {
      await supabase.from('tabela_colunas').delete().eq('id', alvo.id);
      setEditando(null);
      carregarConteudo(ativaId);
    } else {
      await supabase.from('tabelas').delete().eq('id', alvo.id);
      setAtivaId(null);
      carregarTabelas();
    }
  };

  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return q ? linhas.filter((l) => Object.values(l.dados ?? {}).some((v) => String(v).toLowerCase().includes(q))) : linhas;
  }, [linhas, busca]);

  const podeCriar = (tabelas?.length ?? 0) < plano.tabelas;

  return (
    <div className="page page-wide">
      <header className="page-head">
        <div>
          <h1>Dados</h1>
          <p>Planilhas que o assistente consulta na hora de responder: preços, estoque, cardápio. Mudou aqui, ele já responde certo.</p>
        </div>
        <button type="button" className="btn btn-primary" disabled={!podeCriar} title={podeCriar ? '' : `O plano ${plano.nome} permite ${plano.tabelas} tabelas`} onClick={() => setCriando(true)}>
          <Plus /> Nova tabela
        </button>
      </header>

      {tabelas === null && <div className="skeleton" style={{ height: 200 }} />}

      {tabelas?.length === 0 && (
        <div className="empty">
          <Table2 size={32} />
          <h3>Nenhuma tabela ainda</h3>
          <p>Crie uma tabela de produtos, serviços ou o que o seu atendente precisar consultar. Dá para colar direto do Excel.</p>
          <button type="button" className="btn btn-senha" onClick={() => setCriando(true)}>Criar a primeira tabela</button>
        </div>
      )}

      {tabelas?.length > 0 && (
        <>
          <div className="tabelas-lista" role="tablist" aria-label="Tabelas" style={{ marginBottom: 20 }}>
            {tabelas.map((t) => (
              <button key={t.id} type="button" className="chip" aria-pressed={t.id === ativaId} onClick={() => setAtivaId(t.id)}>
                {t.nome} <small>{t.tabela_linhas?.[0]?.count ?? 0}</small>
              </button>
            ))}
          </div>

          {ativa && (
            <div className="stack">
              <div className="card card-tight stack stack-sm">
                <label className="field">
                  <span className="label">Para que serve esta tabela</span>
                  <input
                    className="input"
                    defaultValue={ativa.proposito ?? ''}
                    key={ativa.id}
                    placeholder="Ex.: preços e estoque dos tênis da loja"
                    onBlur={(e) => e.target.value !== (ativa.proposito ?? '') && salvarProposito(e.target.value)}
                  />
                  <span className="hint">O assistente lê isto para saber quando consultar.</span>
                </label>
                <div className="row row-wrap">
                  <span className="label">Quem consulta:</span>
                  {assistentes.length === 0 && <span className="faint" style={{ fontSize: 13 }}>Nenhum assistente ainda. <Link to="/painel/assistentes/novo">Criar</Link></span>}
                  {assistentes.map((a) => (
                    <label key={a.id} className="check" style={{ fontSize: 13.5 }}>
                      <input type="checkbox" checked={vinculos.includes(a.id)} onChange={() => alternarVinculo(a.id)} /> {a.name}
                    </label>
                  ))}
                </div>
              </div>

              <div className="row row-wrap">
                <label className="row" style={{ position: 'relative', flex: '1 1 240px', maxWidth: 320 }}>
                  <Search size={16} style={{ position: 'absolute', left: 12, color: 'var(--tinta-3)' }} aria-hidden="true" />
                  <input className="input" style={{ paddingLeft: 36 }} placeholder="Buscar nas linhas" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar nas linhas" />
                </label>
                <span className="spacer" />
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditando({})}><Plus /> Coluna</button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setColando(true)}><ClipboardPaste /> Colar do Excel</button>
                <button type="button" className="btn btn-primary btn-sm" onClick={novaLinha}><Plus /> Linha</button>
                <button type="button" className="btn btn-quiet btn-sm btn-icon" aria-label={`Excluir tabela ${ativa.nome}`} onClick={() => setExcluir({ tipo: 'tabela', id: ativa.id, nome: ativa.nome })}>
                  <Trash2 />
                </button>
              </div>

              <div className="sheet-wrap">
                <table className="sheet">
                  <thead>
                    <tr>
                      <th className="sheet-n">#</th>
                      {colunas.map((c) => (
                        <th key={c.id}>
                          <button type="button" className="sheet-col" onClick={() => setEditando(c)} title="Editar coluna">
                            <b>{c.rotulo}{c.obrigatoria && <span className="req">*</span>}</b>
                            <span>{TIPOS.find((t) => t.v === c.tipo)?.r ?? c.tipo} <Settings2 size={10} style={{ display: 'inline', verticalAlign: -1 }} /></span>
                          </button>
                        </th>
                      ))}
                      <th style={{ width: 44 }} />
                    </tr>
                  </thead>
                  <tbody>
                    {visiveis.map((l, i) => (
                      <tr key={l.id} data-linha={l.id}>
                        <td className="sheet-n">{i + 1}</td>
                        {colunas.map((c) => (
                          <td key={c.id}>
                            <Celula coluna={c} valor={l.dados?.[c.chave]} onChange={(v) => editar(l.id, c.chave, v)} />
                          </td>
                        ))}
                        <td>
                          <button type="button" className="btn btn-quiet btn-icon btn-sm sheet-kill" aria-label={`Excluir linha ${i + 1}`} onClick={() => setExcluir({ tipo: 'linha', id: l.id })}>
                            <X size={15} />
                          </button>
                        </td>
                      </tr>
                    ))}
                    {visiveis.length === 0 && (
                      <tr>
                        <td colSpan={colunas.length + 2} style={{ padding: 28, textAlign: 'center' }} className="faint">
                          {busca ? 'Nada encontrado.' : 'Tabela vazia. Adicione uma linha ou cole do Excel.'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      <Modal aberto={criando} onFechar={() => setCriando(false)}>
        <form onSubmit={criarTabela}>
          <h2>Nova tabela</h2>
          <p className="muted" style={{ marginBottom: 16 }}>Ela nasce com as colunas Nome e Preço. Você muda depois.</p>
          <label className="field">
            <span className="label">Nome</span>
            <input className="input" autoFocus value={novoNome} onChange={(e) => setNovoNome(e.target.value)} placeholder="Ex.: Produtos, Cardápio, Serviços" />
          </label>
          <div className="modal-foot">
            <button type="button" className="btn btn-ghost" onClick={() => setCriando(false)}>Cancelar</button>
            <button className="btn btn-primary" disabled={!novoNome.trim()}>Criar tabela</button>
          </div>
        </form>
      </Modal>

      <Modal aberto={colando} onFechar={() => setColando(false)} largura={620}>
        <h2>Colar do Excel</h2>
        <p className="muted">
          Copie as linhas na planilha e cole aqui. As colunas entram nesta ordem: <b>{colunas.map((c) => c.rotulo).join(', ')}</b>.
        </p>
        <textarea className="textarea mono" rows={9} style={{ marginTop: 14, fontSize: 12.5 }} value={colado} onChange={(e) => setColado(e.target.value)} placeholder={'Tênis Corrida X\t399,90\nTênis Casual Y\t249,90'} />
        <div className="modal-foot">
          <button type="button" className="btn btn-ghost" onClick={() => setColando(false)}>Cancelar</button>
          <button type="button" className="btn btn-primary" onClick={importar} disabled={!colado.trim()}>Importar linhas</button>
        </div>
      </Modal>

      {editando && (
        <EditorColuna
          coluna={editando.id ? editando : null}
          onSalvar={salvarColuna}
          onExcluir={(c) => setExcluir({ tipo: 'coluna', id: c.id, nome: c.rotulo })}
          onFechar={() => setEditando(null)}
        />
      )}

      <Confirmar
        aberto={!!excluir}
        titulo={excluir?.tipo === 'linha' ? 'Excluir esta linha?' : `Excluir ${excluir?.tipo === 'tabela' ? 'a tabela' : 'a coluna'} ${excluir?.nome ?? ''}?`}
        texto={excluir?.tipo === 'tabela' ? 'Todas as linhas vão junto e o assistente para de consultá-la.' : excluir?.tipo === 'coluna' ? 'O valor desta coluna some de todas as linhas.' : undefined}
        acao="Excluir"
        perigo
        onConfirmar={confirmarExclusao}
        onFechar={() => setExcluir(null)}
      />
    </div>
  );
}
