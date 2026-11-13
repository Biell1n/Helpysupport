import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Check, GraduationCap, Pencil, Trash2, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/components/Toasts';
import { Confirmar } from '@/components/Modal';
import { quando } from '@/lib/format';

/** Uma coisa que o assistente aprendeu: dá para corrigir o texto ou apagar. */
function Item({ item, onSalvar, onApagar }) {
  const [editando, setEditando] = useState(false);
  const [f, setF] = useState({ pergunta: item.pergunta, resposta: item.resposta });
  const [salvando, setSalvando] = useState(false);

  const salvar = async (e) => {
    e.preventDefault();
    setSalvando(true);
    const ok = await onSalvar(item, { pergunta: f.pergunta.trim(), resposta: f.resposta.trim() });
    setSalvando(false);
    if (ok) setEditando(false);
  };

  if (editando) {
    return (
      <form className="aprendido" onSubmit={salvar}>
        <label className="field">
          <span className="label">Quando perguntarem</span>
          <input className="input" required minLength={3} maxLength={300} value={f.pergunta} onChange={(e) => setF((x) => ({ ...x, pergunta: e.target.value }))} />
        </label>
        <label className="field">
          <span className="label">Ele responde</span>
          <textarea className="textarea" required minLength={2} maxLength={1200} rows={3} value={f.resposta} onChange={(e) => setF((x) => ({ ...x, resposta: e.target.value }))} />
        </label>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn btn-primary btn-sm" disabled={salvando}><Check size={15} /> {salvando ? 'Salvando…' : 'Salvar'}</button>
          <button type="button" className="btn btn-quiet btn-sm" onClick={() => { setF({ pergunta: item.pergunta, resposta: item.resposta }); setEditando(false); }}><X size={15} /> Cancelar</button>
        </div>
      </form>
    );
  }

  return (
    <article className="aprendido">
      <div className="aprendido-texto">
        <b>{item.pergunta}</b>
        <p>{item.resposta}</p>
        <span className="faint">Aprendeu {quando(item.criado_em)}</span>
      </div>
      <div className="aprendido-acoes">
        <button type="button" className="btn btn-quiet btn-sm" onClick={() => setEditando(true)}><Pencil size={15} /> Corrigir</button>
        <button type="button" className="btn btn-quiet btn-sm" onClick={() => onApagar(item)}><Trash2 size={15} /> Apagar</button>
      </div>
    </article>
  );
}

/** O que o assistente aprendeu com a equipe, e a escolha entre atender ou só aprender. */
export default function Aprendizado() {
  const { id } = useParams();
  const avisar = useToast();
  const [a, setA] = useState(undefined);
  const [lista, setLista] = useState(null);
  const [acompanhados, setAcompanhados] = useState(0);
  const [mudando, setMudando] = useState(false);
  const [apagar, setApagar] = useState(null);

  const carregar = useCallback(async () => {
    const [ass, ap, conv] = await Promise.all([
      supabase.from('assistants').select('id, name, modo').eq('id', id).maybeSingle(),
      supabase.from('aprendizados').select('id, pergunta, resposta, criado_em').eq('assistant_id', id).eq('ativo', true).order('criado_em', { ascending: false }),
      supabase.from('conversations').select('id', { count: 'exact', head: true }).eq('assistant_id', id).eq('aprendiz', true),
    ]);
    setA(ass.data ?? null);
    setLista(ap.data ?? []);
    setAcompanhados(conv.count ?? 0);
  }, [id]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const mudarModo = async (modo) => {
    if (!a || a.modo === modo || mudando) return;
    setMudando(true);
    const { error } = await supabase.from('assistants').update({ modo }).eq('id', a.id);
    setMudando(false);
    if (error) return avisar('Não deu para mudar', { erro: true, texto: error.message });
    setA((x) => ({ ...x, modo }));
    avisar(modo === 'aprendiz' ? `${a.name} está só aprendendo` : `${a.name} voltou a atender`, {
      texto: modo === 'aprendiz'
        ? 'As conversas novas vão direto para a equipe, em Atendimentos.'
        : 'Ele responde os clientes e chama a equipe quando precisar.',
    });
  };

  const salvar = async (item, campos) => {
    const { error } = await supabase.from('aprendizados').update(campos).eq('id', item.id);
    if (error) {
      avisar('Não deu para salvar', { erro: true, texto: error.message });
      return false;
    }
    setLista((l) => l.map((x) => (x.id === item.id ? { ...x, ...campos } : x)));
    avisar('Corrigido', { texto: 'Ele já responde do jeito novo.' });
    return true;
  };

  const confirmarApagar = async () => {
    const item = apagar;
    setApagar(null);
    const { error } = await supabase.from('aprendizados').delete().eq('id', item.id);
    if (error) return avisar('Não deu para apagar', { erro: true, texto: error.message });
    setLista((l) => l.filter((x) => x.id !== item.id));
    avisar('Apagado', { texto: 'Ele não usa mais essa resposta.' });
  };

  if (a === null) {
    return (
      <div className="page" style={{ maxWidth: 860 }}>
        <div className="empty">
          <h3>Assistente não encontrado</h3>
          <Link to="/painel/assistentes" className="btn btn-ghost">Voltar para Assistentes</Link>
        </div>
      </div>
    );
  }

  const aprendiz = a?.modo === 'aprendiz';

  return (
    <div className="page" style={{ maxWidth: 860 }}>
      <Link to="/painel/assistentes" className="voltar"><ArrowLeft size={16} /> Assistentes</Link>
      <header className="page-head">
        <div>
          <h1>Aprendizado{a ? ` de ${a.name}` : ''}</h1>
          <p>Quando a equipe responde um cliente, o assistente guarda a resposta e passa a usar com os próximos.</p>
        </div>
      </header>

      {a === undefined ? (
        <div className="skeleton" style={{ height: 120 }} />
      ) : (
        <section className="card stack" style={{ marginBottom: 16 }}>
          <h2 className="card-title" style={{ margin: 0 }}>Como ele trabalha agora</h2>
          <div className="tipo-conta" role="radiogroup" aria-label="Como o assistente trabalha">
            <button type="button" role="radio" aria-checked={!aprendiz} disabled={mudando} onClick={() => mudarModo('ativo')}>
              <b>Atendendo</b>
              <span>Responde os clientes, chama a equipe quando precisa e aprende com o que ela responde.</span>
            </button>
            <button type="button" role="radio" aria-checked={aprendiz} disabled={mudando} onClick={() => mudarModo('aprendiz')}>
              <b>Só aprendendo</b>
              <span>A equipe atende todas as conversas. Ele observa, aprende e não fala com ninguém.</span>
            </button>
          </div>
          {aprendiz && (
            <div className="alert alert-aviso">
              <GraduationCap size={18} />
              <span>
                Em treino: {acompanhados} {acompanhados === 1 ? 'atendimento acompanhado' : 'atendimentos acompanhados'} e {lista?.length ?? 0}{' '}
                {lista?.length === 1 ? 'resposta aprendida' : 'respostas aprendidas'}. Quando achar que ele está pronto, escolha <b>Atendendo</b>.
                O teste do painel continua respondendo, para você conferir como ele se sai.
              </span>
            </div>
          )}
        </section>
      )}

      <section className="card" style={{ marginBottom: 16 }}>
        <h2 className="card-title" style={{ margin: '0 0 10px' }}>Onde ensinar cada coisa</h2>
        <div className="onde-ensinar">
          <Link to={`/painel/assistentes/${id}/editar`}><b>Como o negócio funciona</b><span>Horário, endereço, regras e jeito de falar. Em Editar.</span></Link>
          <Link to="/painel/dados"><b>Preços, estoque e listas</b><span>O que muda sempre. Em Dados.</span></Link>
          <Link to="/painel/avisos"><b>O que ele não soube responder</b><span>Você responde uma vez e ele não pergunta de novo. Em Avisos.</span></Link>
          <div><b>O resto ele aprende sozinho</b><span>Com o que a equipe responde nos atendimentos. É a lista aqui embaixo.</span></div>
        </div>
      </section>

      <h2 className="canais-ligados-titulo">O que ele aprendeu{lista?.length ? ` (${lista.length})` : ''}</h2>
      {lista === null && <div className="skeleton" style={{ height: 160 }} />}
      {lista?.length === 0 && (
        <div className="empty">
          <GraduationCap size={36} />
          <h3>Nada aprendido ainda</h3>
          <p>Ele aprende sozinho: quando alguém da equipe responde um cliente em Atendimentos e a conversa é encerrada, as respostas que servem para os próximos aparecem aqui em alguns minutos.</p>
        </div>
      )}
      <div className="stack-sm">
        {lista?.map((item) => <Item key={item.id} item={item} onSalvar={salvar} onApagar={setApagar} />)}
      </div>

      <Confirmar
        aberto={!!apagar}
        titulo="Apagar esta resposta?"
        texto={apagar ? `"${apagar.pergunta}" sai do que o assistente sabe. Se a equipe responder isso de novo num atendimento, ele aprende outra vez.` : ''}
        acao="Apagar"
        perigo
        onConfirmar={confirmarApagar}
        onFechar={() => setApagar(null)}
      />
    </div>
  );
}
