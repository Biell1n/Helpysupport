import { useCallback, useEffect, useState } from 'react';
import { List } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/Toasts';
import { numero, quando } from '@/lib/format';

const COLUNAS = [
  { id: 'waiting', titulo: 'Na fila', vazio: 'Nenhum chamado esperando.' },
  { id: 'human', titulo: 'Em atendimento', vazio: 'Arraste um chamado para cá para assumir.' },
  { id: 'closed', titulo: 'Resolvidos', vazio: 'Os encerrados dos últimos 14 dias aparecem aqui.' },
];

/** Os chamados como quadro: arrastar muda a etapa (assumir, devolver para a fila, encerrar). */
export default function QuadroChamados({ onAbrir, onLista, assistentes, recarregarUso }) {
  const { user, nome } = useAuth();
  const avisar = useToast();
  const [cards, setCards] = useState(null);
  const [arrastando, setArrastando] = useState(null);
  const [sobre, setSobre] = useState(null);
  const atendente = nome || user?.email?.split('@')[0] || 'Equipe';

  const carregar = useCallback(async () => {
    const quinzena = new Date(Date.now() - 14 * 864e5).toISOString();
    const [{ data: abertos }, { data: fechados }] = await Promise.all([
      supabase.from('conversations').select('*').eq('teste', false).in('status', ['waiting', 'human']).order('escalado_em', { ascending: true }).limit(300),
      supabase.from('conversations').select('*').eq('teste', false).eq('status', 'closed').not('escalado_em', 'is', null)
        .gte('fechado_em', quinzena).order('fechado_em', { ascending: false }).limit(100),
    ]);
    setCards([...(abertos ?? []), ...(fechados ?? [])]);
  }, []);

  useEffect(() => {
    carregar();
    const t = setInterval(carregar, 15000);
    return () => clearInterval(t);
  }, [carregar]);

  const mover = async (id, para) => {
    const c = cards.find((x) => x.id === id);
    if (!c || c.status === para) return;
    const agora = new Date().toISOString();
    const patch =
      para === 'human'
        ? { status: 'human', assumido_por: user.id, assumido_nome: atendente, assumido_em: c.assumido_em ?? agora, fechado_em: null, encerrado_por: null }
        : para === 'closed'
        ? { status: 'closed', fechado_em: agora, encerrado_por: 'equipe' }
        : { status: 'waiting', assumido_por: null, assumido_nome: null, assumido_em: null, fechado_em: null, encerrado_por: null, escalado_em: c.escalado_em ?? agora };
    setCards((cs) => cs.map((x) => (x.id === id ? { ...x, ...patch } : x))); // já mostra; desfaz se der erro
    const { error } = await supabase.from('conversations').update(patch).eq('id', id);
    if (error) {
      avisar('Não deu para mover o chamado', { erro: true, texto: error.message });
      carregar();
      return;
    }
    recarregarUso?.();
  };

  const soltar = (para) => (e) => {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/plain') || arrastando;
    setSobre(null);
    setArrastando(null);
    if (id) mover(id, para);
  };

  return (
    <div className="page quadro-pagina">
      <header className="page-head">
        <div>
          <h1>Atendimentos</h1>
          <p>Arraste os chamados entre as colunas. Clique para abrir a conversa.</p>
        </div>
        <button type="button" className="btn btn-ghost" onClick={onLista}><List size={16} /> Ver em lista</button>
      </header>

      <div className="quadro">
        {COLUNAS.map((col) => {
          const lista = (cards ?? []).filter((c) => c.status === col.id);
          return (
            <section
              key={col.id}
              className="quadro-col"
              data-sobre={sobre === col.id}
              aria-label={col.titulo}
              onDragOver={(e) => {
                e.preventDefault();
                setSobre(col.id);
              }}
              onDragLeave={() => setSobre((s) => (s === col.id ? null : s))}
              onDrop={soltar(col.id)}
            >
              <h2>
                {col.titulo} <span className="mono">{lista.length}</span>
              </h2>
              {cards === null && <div className="skeleton" style={{ height: 90 }} />}
              {cards && !lista.length && <p className="faint" style={{ fontSize: 13 }}>{col.vazio}</p>}
              {lista.map((c) => (
                <article
                  key={c.id}
                  className="quadro-card"
                  draggable
                  data-prioridade={c.prioridade}
                  onDragStart={(e) => {
                    e.dataTransfer.setData('text/plain', c.id);
                    setArrastando(c.id);
                  }}
                  onDragEnd={() => setArrastando(null)}
                  onClick={() => onAbrir(c.id)}
                  onKeyDown={(e) => e.key === 'Enter' && onAbrir(c.id)}
                  tabIndex={0}
                >
                  <div className="row" style={{ justifyContent: 'space-between', gap: 8 }}>
                    <span className="mono faint" style={{ fontSize: 12 }}>{numero(c.numero)}</span>
                    {c.prioridade === 'alta' && <span className="flag">urgente</span>}
                  </div>
                  <b>{c.titulo || c.motivo || 'Atendimento'}</b>
                  <span className="faint" style={{ fontSize: 12.5 }}>
                    {c.lead_nome || c.cliente_email || 'Visitante'} · {assistentes[c.assistant_id] ?? 'Assistente'}
                  </span>
                  <span className="faint" style={{ fontSize: 12 }}>
                    {col.id === 'human' && c.assumido_nome ? `${c.assumido_nome} · ` : ''}
                    {quando(c.last_message_at)}
                  </span>
                  {/* teclado e celular: mover sem arrastar */}
                  <select
                    className="quadro-mover"
                    aria-label="Mover para"
                    value={c.status}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => mover(c.id, e.target.value)}
                  >
                    {COLUNAS.map((o) => <option key={o.id} value={o.id}>{o.titulo}</option>)}
                  </select>
                </article>
              ))}
            </section>
          );
        })}
      </div>
    </div>
  );
}
