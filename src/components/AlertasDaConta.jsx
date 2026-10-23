import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Bot, Check, CircleCheck } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { quando } from '@/lib/format';

// Notícia boa (pagamento confirmado, pedido pago) não vem com cara de problema.
const BOM_CHAVE = /^(fatura:[^:]+|pedido:[0-9a-f-]{36}|saque:.+)$/i;
const RUIM_TEXTO = /atras|venceu|sem estoque|em dobro|cancelad|recus|limite|acabaram|não foi paga/i;
const ehBom = (a) => a.origem === 'sistema' && BOM_CHAVE.test(a.chave ?? '') && !RUIM_TEXTO.test(a.assunto ?? '');

/**
 * Avisos do assistente e do sistema: o que precisa de atenção (dado que não
 * combina, fonte fora do ar, fatura vencida) e as boas notícias (pagamento
 * confirmado). Só aparece quando há aviso.
 */
export default function AlertasDaConta() {
  const [lista, setLista] = useState([]);

  const carregar = useCallback(async () => {
    const { data } = await supabase
      .from('alertas')
      .select('id, origem, chave, assunto, detalhe, conversation_id, criado_em')
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
  const atencao = lista.filter((a) => !ehBom(a)).length;
  return (
    <section className="card alertas" data-tom={atencao ? 'atencao' : 'bom'} aria-label="Avisos">
      <h2 className="card-title">
        {atencao ? <AlertTriangle size={18} /> : null}
        {atencao === 0 ? (lista.length === 1 ? 'Novidade' : 'Novidades') : atencao === 1 ? 'Um aviso para conferir' : `${atencao} avisos para conferir`}
      </h2>
      <ul>
        {lista.map((a) => (
          <li key={a.id} data-tom={ehBom(a) ? 'bom' : undefined}>
            <span className="alertas-icone" data-origem={a.origem}>
              {ehBom(a) ? <CircleCheck size={16} /> : a.origem === 'sistema' ? <AlertTriangle size={16} /> : <Bot size={16} />}
            </span>
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
