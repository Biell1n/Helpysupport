import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Check, CircleCheck, GraduationCap, MessageSquareText } from 'lucide-react';
import { chamar, supabase } from '@/lib/supabase';
import { useToast } from '@/components/Toasts';
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
  const [respondendo, setRespondendo] = useState(null);
  const [resposta, setResposta] = useState('');
  const [enviando, setEnviando] = useState(false);
  const avisar = useToast();

  const carregar = useCallback(async () => {
    const { data } = await supabase
      .from('alertas')
      .select('id, origem, chave, assunto, detalhe, conversation_id, assistant_id, criado_em')
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

  // a equipe responde e o assistente aprende (vira pergunta frequente dele)
  const ensinar = async (a, texto) => {
    setEnviando(true);
    try {
      await chamar('assistant-builder-chat', {
        action: 'ensinar',
        assistant_id: a.assistant_id,
        pergunta: a.assunto,
        resposta: texto,
        alerta_id: a.id,
      });
      setLista((l) => l.filter((x) => x.id !== a.id));
      setRespondendo(null);
      setResposta('');
      avisar('O assistente aprendeu', { texto: 'A partir de agora ele responde isso sozinho.' });
    } catch (e) {
      avisar('Não deu para salvar', { erro: true, texto: e.message });
    } finally {
      setEnviando(false);
    }
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
              {ehBom(a) ? <CircleCheck size={16} /> : a.origem === 'sistema' ? <AlertTriangle size={16} /> : <MessageSquareText size={16} />}
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
            <div className="alertas-acoes">
              {a.origem !== 'sistema' && a.assistant_id && (
                <>
                  <button type="button" className="btn btn-ghost btn-sm" disabled={enviando} onClick={() => ensinar(a, 'Conferido pela equipe: está certo.')}>
                    <Check size={15} /> Está certo
                  </button>
                  <button type="button" className="btn btn-quiet btn-sm" onClick={() => { setRespondendo(respondendo === a.id ? null : a.id); setResposta(''); }}>
                    <GraduationCap size={15} /> Responder
                  </button>
                </>
              )}
              <button type="button" className="btn btn-quiet btn-sm" onClick={() => visto(a.id)}>Dispensar</button>
            </div>
            {respondendo === a.id && (
              <form
                className="alertas-resposta"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (resposta.trim()) ensinar(a, resposta.trim());
                }}
              >
                <textarea className="textarea" rows={2} autoFocus value={resposta} onChange={(e) => setResposta(e.target.value)} placeholder="Ex.: A Base Líquida tem 8 tons, do 01 (claro) ao 08 (escuro)." />
                <button type="submit" className="btn btn-primary btn-sm" disabled={enviando || !resposta.trim()}>Ensinar ao assistente</button>
              </form>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
