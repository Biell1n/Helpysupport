import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Loader2, Megaphone } from 'lucide-react';
import Abas from '@/components/Abas';
import { useToast } from '@/components/Toasts';
import { chamar } from '@/lib/supabase';
import { numero, quando } from '@/lib/format';
import { CATEGORIAS } from '@/lib/ajuda';
import { BASE } from './Suporte';

const ABAS = [
  { id: 'fila', rotulo: 'Na fila' },
  { id: 'aguardando_voce', rotulo: 'Aguardando a empresa' },
  { id: 'ia', rotulo: 'Com a IA' },
  { id: 'resolvido', rotulo: 'Resolvidos' },
];

/** Só a equipe Helpy: todos os chamados das empresas, prioridade primeiro. */
export default function FilaSuporte() {
  const avisar = useToast();
  const [aba, setAba] = useState('fila');
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState({ texto: '', nivel: 'info' });
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    try {
      setDados(await chamar('suporte', { action: 'equipe_fila', status: aba }));
    } catch (e) {
      setErro(e.message);
    }
  }, [aba]);
  useEffect(() => {
    setDados(null);
    carregar();
    const t = setInterval(carregar, 30000);
    return () => clearInterval(t);
  }, [carregar]);
  useEffect(() => {
    chamar('suporte', { action: 'status' }).then((s) => s.aviso && setAviso({ texto: s.aviso.texto, nivel: s.aviso.nivel }), () => {});
  }, []);

  const salvarAviso = async (texto) => {
    setSalvando(true);
    try {
      await chamar('suporte', { action: 'equipe_aviso', texto, nivel: aviso.nivel });
      setAviso((a) => ({ ...a, texto }));
      avisar(texto ? 'Aviso publicado para todas as empresas' : 'Aviso tirado do ar');
    } catch (e) {
      avisar('Não deu para salvar', { erro: true, texto: e.message });
    } finally {
      setSalvando(false);
    }
  };

  if (erro) {
    return (
      <div className="page suporte">
        <Link to={BASE} className="link-btn suporte-voltar"><ArrowLeft size={15} /> Ajuda</Link>
        <div className="empty"><h3>Sem acesso</h3><p>{erro}</p></div>
      </div>
    );
  }

  return (
    <div className="page page-wide suporte">
      <Link to={BASE} className="link-btn suporte-voltar"><ArrowLeft size={15} /> Ajuda</Link>
      <header className="page-head">
        <div>
          <h1>Fila do suporte</h1>
          <p>Chamados que as empresas abriram para a equipe Helpy. Business e problemas do nosso lado vêm primeiro.</p>
        </div>
      </header>

      <section className="card suporte-aviso-editor">
        <Megaphone size={20} aria-hidden="true" />
        <div className="stack stack-sm" style={{ flex: 1 }}>
          <b>Aviso geral</b>
          <span className="faint" style={{ fontSize: 13 }}>Aparece no topo da ajuda de todas as empresas (ex.: instabilidade no WhatsApp). Deixe vazio para tirar.</span>
          <div className="row row-wrap">
            <input className="input" style={{ flex: '1 1 280px' }} maxLength={400} value={aviso.texto} onChange={(e) => setAviso((a) => ({ ...a, texto: e.target.value }))} placeholder="Ex.: O WhatsApp está com atraso nas mensagens; já estamos resolvendo." aria-label="Texto do aviso geral" />
            <select className="select" style={{ width: 'auto' }} value={aviso.nivel} onChange={(e) => setAviso((a) => ({ ...a, nivel: e.target.value }))} aria-label="Tipo do aviso">
              <option value="info">Informação</option>
              <option value="problema">Problema</option>
            </select>
            <button type="button" className="btn btn-primary btn-sm" disabled={salvando} onClick={() => salvarAviso(aviso.texto.trim())}>
              {salvando ? <Loader2 className="spin" /> : null} Publicar
            </button>
            {aviso.texto && <button type="button" className="btn btn-quiet btn-sm" disabled={salvando} onClick={() => salvarAviso('')}>Tirar</button>}
          </div>
        </div>
      </section>

      <Abas
        className="suporte-abas"
        rotulo="Situação"
        ativa={aba}
        onMudar={setAba}
        abas={ABAS.map((a) => ({ id: a.id, rotulo: a.rotulo, extra: dados?.contagem?.[a.id] ? <small className="suporte-conta">{dados.contagem[a.id]}</small> : null }))}
      />

      {dados === null ? (
        <div className="skeleton" style={{ height: 200 }} />
      ) : dados.chamados.length === 0 ? (
        <div className="empty"><h3>Nada aqui</h3><p>{aba === 'fila' ? 'Nenhuma empresa esperando a equipe agora.' : 'Nenhum chamado nesta situação.'}</p></div>
      ) : (
        <ul className="suporte-chamados suporte-fila">
          {dados.chamados.map((c) => (
            <li key={c.id}>
              <Link to={`${BASE}/chamado/${c.id}`}>
                <span className="suporte-num">{numero(c.numero)}</span>
                <span className="suporte-chamado-txt">
                  <b>{c.prioridade === 'alta' && <span className="suporte-prioridade">Prioridade</span>}{c.assunto}</b>
                  <small>{c.empresa_nome} · {c.plano ?? '—'} · {CATEGORIAS.find((x) => x.id === c.categoria)?.nome ?? c.categoria}</small>
                </span>
                <span className="faint" style={{ fontSize: 12.5, whiteSpace: 'nowrap' }}>{quando(c.atualizado_em)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
