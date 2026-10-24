import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Copy, ExternalLink, MessageCircle, Pencil, Plus, QrCode, RefreshCw, Trash2 } from 'lucide-react';
import { supabase, chamar } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/Toasts';
import { Confirmar } from '@/components/Modal';
import { Marca } from '@/components/Logo';
import { planOf } from '@/lib/plans';
import { MODELOS } from '@/lib/documento';
import QrAssistente from '@/components/QrAssistente';
import TrocarFoto from '@/components/TrocarFoto';
import { CartaoRascunho, useRascunho } from '@/components/Rascunho';

export const linkPublico = (token) => `${window.location.origin}/c/${token}`;

export default function Assistentes() {
  const { user, profile } = useAuth();
  const avisar = useToast();
  const plano = planOf(profile);
  const [lista, setLista] = useState(null);
  const [excluir, setExcluir] = useState(null);
  const [trocando, setTrocando] = useState(null);
  const [qr, setQr] = useState(null);

  const carregar = useCallback(async () => {
    const { data } = await supabase
      .from('assistants')
      .select('id, name, business_type, business_model, public_token, is_public, updated_at, foto_url')
      .order('created_at');
    setLista(data ?? []);
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const copiar = async (token) => {
    await navigator.clipboard.writeText(linkPublico(token));
    avisar('Link copiado', { texto: 'Cole na bio, no site ou mande pelo WhatsApp.' });
  };

  const alternar = async (a) => {
    try {
      await chamar('assistant-builder-chat', { action: 'share', assistant_id: a.id, ligado: !a.is_public });
      avisar(a.is_public ? 'Link desligado' : 'Link ligado');
      carregar();
    } catch (e) {
      avisar('Não deu para mudar o link', { erro: true, texto: e.message });
    }
  };

  const trocarLink = async (a) => {
    try {
      await chamar('assistant-builder-chat', { action: 'share', assistant_id: a.id, regenerar: true });
      avisar('Link trocado', { texto: 'O endereço antigo parou de funcionar.' });
      carregar();
    } catch (e) {
      avisar('Não deu para trocar o link', { erro: true, texto: e.message });
    }
  };

  const confirmarExclusao = async () => {
    const alvo = excluir;
    setExcluir(null);
    const { error } = await supabase.from('assistants').delete().eq('id', alvo.id);
    if (error) return avisar('Não deu para excluir', { erro: true, texto: error.message });
    avisar('Assistente excluído');
    carregar();
  };

  const podeCriar = (lista?.length ?? 0) < plano.assistentes;
  const rascunho = useRascunho();

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Assistentes</h1>
          <p>
            {lista ? `${lista.length} de ${plano.assistentes} no plano ${plano.nome}.` : ' '}
          </p>
        </div>
        {podeCriar ? (
          <Link to="/painel/assistentes/novo" className="btn btn-primary"><Plus /> Novo assistente</Link>
        ) : (
          <Link to="/painel/plano" className="btn btn-ghost">Mudar de plano para criar mais</Link>
        )}
      </header>

      {lista === null && <div className="skeleton" style={{ height: 120 }} />}

      <CartaoRascunho rascunho={rascunho} />

      {lista?.length === 0 && !rascunho && (
        <div className="empty">
          <Marca size={44} />
          <h3>Nenhum assistente ainda</h3>
          <p>Monte o primeiro contando como o seu negócio funciona.</p>
          <Link to="/painel/assistentes/novo" className="btn btn-senha">Montar assistente</Link>
        </div>
      )}

      <div className="stack">
        {lista?.map((a) => (
          <article key={a.id} className="card">
            <div className="row row-wrap" style={{ alignItems: 'flex-start' }}>
              <div style={{ flex: 1, minWidth: 220 }}>
                <h2 style={{ fontSize: 22 }}>{a.name}</h2>
                <p className="muted" style={{ fontSize: 14, marginBottom: 12 }}>
                  {[a.business_type, MODELOS.find((m) => m.id === a.business_model)?.nome].filter(Boolean).join(' · ')}
                </p>
                <TrocarFoto
                  userId={user.id}
                  nomeArquivo={`assistente-${a.id}`}
                  foto={a.foto_url}
                  nome={a.name}
                  tamanho={56}
                  onSalvar={async (url) => {
                    const { error } = await supabase.from('assistants').update({ foto_url: url }).eq('id', a.id);
                    if (error) throw new Error(error.message);
                    carregar();
                  }}
                />
              </div>
              <div className="row row-wrap">
                <Link to={`/painel/assistentes/${a.id}/testar`} className="btn btn-ghost btn-sm"><MessageCircle /> Testar</Link>
                <Link to={`/painel/assistentes/${a.id}/editar`} className="btn btn-ghost btn-sm"><Pencil /> Editar</Link>
                <button type="button" className="btn btn-quiet btn-sm btn-icon" aria-label={`Excluir ${a.name}`} onClick={() => setExcluir(a)}>
                  <Trash2 />
                </button>
              </div>
            </div>

            <hr className="divider" style={{ margin: '18px 0 14px' }} />

            <div className="row row-wrap">
              <span className={`badge ${a.is_public ? 'badge-closed' : 'badge-bot'}`}>{a.is_public ? 'Link no ar' : 'Link desligado'}</span>
              <code className="mono" style={{ flex: 1, minWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {linkPublico(a.public_token)}
              </code>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => copiar(a.public_token)}><Copy /> Copiar</button>
              <a href={linkPublico(a.public_token)} target="_blank" rel="noreferrer" className="btn btn-quiet btn-sm"><ExternalLink /> Abrir</a>
              <button type="button" className="btn btn-quiet btn-sm" onClick={() => setQr(a)}><QrCode /> QR code</button>
              <button type="button" className="btn btn-quiet btn-sm" onClick={() => alternar(a)}>{a.is_public ? 'Desligar' : 'Ligar'}</button>
              <button type="button" className="btn btn-quiet btn-sm" title="Gera um endereço novo e desativa o antigo" onClick={() => setTrocando(a)}><RefreshCw /> Trocar link</button>
            </div>
          </article>
        ))}
      </div>

      <QrAssistente assistente={qr} link={qr ? linkPublico(qr.public_token) : ''} onFechar={() => setQr(null)} />

      <Confirmar
        aberto={!!excluir}
        titulo={`Excluir ${excluir?.name}?`}
        texto="O link para de funcionar e as conversas dele somem dos atendimentos. Não dá para desfazer."
        acao="Excluir assistente"
        perigo
        onConfirmar={confirmarExclusao}
        onFechar={() => setExcluir(null)}
      />
      <Confirmar
        aberto={!!trocando}
        titulo={`Trocar o link do ${trocando?.name ?? 'assistente'}?`}
        texto="O link e o QR code atuais param de funcionar na hora, inclusive os que você já imprimiu ou divulgou."
        acao="Trocar link"
        perigo
        onConfirmar={() => {
          const a = trocando;
          setTrocando(null);
          trocarLink(a);
        }}
        onFechar={() => setTrocando(null)}
      />
    </div>
  );
}
