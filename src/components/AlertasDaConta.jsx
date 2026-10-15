import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Bot, Check } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { quando } from '@/lib/format';

/**
 * Avisos do assistente (ou do sistema) de que algo parece errado: dado que não
 * combina com o negócio, fonte de dados fora do ar. Só aparece quando há aviso.
 */
export default function AlertasDaConta() {
  const [lista, setLista] = useState([]);

  const carregar = useCallback(async () => {
    const { data } = await supabase
      .from('alertas')
      .select('id, origem, assunto, detalhe, conversation_id, criado_em')
      .is('visto_em', null)
      .order('criado_em', { ascending: false })
      .limit(20);
    setLista(data ?? []);
  }, []);

  useEffect(() => {
    carregar();
    const t = setInterval(carregar, 60000);
    return () => clearInterval(t);
  }, [carregar]);

  const visto = async (id) => {
    setLista((l) => l.filter((a) => a.id !== id));
    await supabase.from('alertas').update({ visto_em: new Date().toISOString() }).eq('id', id);
  };

  if (!lista.length) return null;
  return (
    <section className="card alertas" aria-label="Avisos do assistente">
      <h2 className="card-title">
        <AlertTriangle size={18} /> {lista.length === 1 ? 'Um aviso para conferir' : `${lista.length} avisos para conferir`}
      </h2>
      <ul>
        {lista.map((a) => (
          <li key={a.id}>
            <span className="alertas-icone" data-origem={a.origem}>{a.origem === 'sistema' ? <AlertTriangle size={16} /> : <Bot size={16} />}</span>
            <div>
              <b>{a.assunto}</b>
              {a.detalhe && <p>{a.detalhe}</p>}
              <span className="faint">
                {a.origem === 'sistema' ? 'Sistema' : 'O assistente notou'} · {quando(a.criado_em)}
                {a.conversation_id && (
                  <>
                    {' · '}
                    <Link to={`/painel/atendimentos?id=${a.conversation_id}`}>ver conversa</Link>
                  </>
                )}
              </span>
            </div>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => visto(a.id)}><Check size={15} /> Visto</button>
          </li>
        ))}
      </ul>
    </section>
  );
}
