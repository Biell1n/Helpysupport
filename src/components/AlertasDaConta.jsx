import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Bell, CircleCheck, CircleHelp, MessageSquareText } from 'lucide-react';
import { avisosNovos, marcarVisto } from '@/lib/avisos';
import { quando } from '@/lib/format';

export const IconeDoAviso = ({ item, size = 16 }) =>
  item.bom ? <CircleCheck size={size} /> : item.tipo === 'lacuna' ? <CircleHelp size={size} /> : item.origem === 'sistema' ? <AlertTriangle size={size} /> : <MessageSquareText size={size} />;

/**
 * Notificações no topo do painel: avisos do assistente e do sistema e as
 * perguntas que ele não soube. "Visto" tira daqui, mas tudo continua na
 * caixa de avisos, onde dá para confirmar ou responder.
 */
export default function AlertasDaConta() {
  const [lista, setLista] = useState([]);

  const carregar = useCallback(async () => {
    setLista(await avisosNovos());
  }, []);

  useEffect(() => {
    carregar();
    const t = setInterval(carregar, 60000);
    return () => clearInterval(t);
  }, [carregar]);

  const visto = async (item) => {
    setLista((l) => l.filter((x) => x.chave !== item.chave));
    await marcarVisto(item);
  };

  if (!lista.length) return null;
  const atencao = lista.filter((a) => !a.bom).length;
  return (
    <section className="card alertas" data-tom={atencao ? 'atencao' : 'bom'} aria-label="Notificações">
      <div className="alertas-cab">
        <h2 className="card-title">
          <Bell size={17} />
          {atencao === 0 ? (lista.length === 1 ? 'Novidade' : 'Novidades') : atencao === 1 ? 'Um aviso para conferir' : `${atencao} avisos para conferir`}
        </h2>
        <Link to="/painel/avisos" className="btn btn-quiet btn-sm">Ver todos</Link>
      </div>
      <ul>
        {lista.slice(0, 5).map((a) => (
          <li key={a.chave} data-tom={a.bom ? 'bom' : undefined}>
            <span className="alertas-icone" data-origem={a.origem}><IconeDoAviso item={a} /></span>
            <Link to={`/painel/avisos?aviso=${a.chave}`} className="alertas-texto">
              <b>{a.titulo}</b>
              {a.detalhe && <p>{a.detalhe}</p>}
              <span className="faint">
                {a.tipo === 'lacuna' ? 'Pergunta sem resposta' : a.origem === 'sistema' ? 'Sistema' : 'O assistente notou'}{a.quando ? ` · ${quando(a.quando)}` : ''}
              </span>
            </Link>
            <button type="button" className="btn btn-quiet btn-sm" onClick={() => visto(a)}>Visto</button>
          </li>
        ))}
      </ul>
      {lista.length > 5 && <Link to="/painel/avisos" className="alertas-mais">e mais {lista.length - 5}…</Link>}
    </section>
  );
}
