import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowUp, Check, Loader2, Lock, RotateCcw } from 'lucide-react';
import { BuilderProvider, useBuilder } from './BuilderContext';
import Documento, { EscolherModelo } from './Documento';
import { Marca } from '@/components/Logo';
import { Confirmar } from '@/components/Modal';
import { useToast } from '@/components/Toasts';
import { labelOf } from '@/lib/documento';

const SUGESTOES = [
  'Tenho uma loja de roupas femininas, vendo pelo Instagram e entrego na cidade.',
  'Sou dentista, quero que ele marque consultas e explique os procedimentos.',
  'Sou professor de matemática e quero um monitor para tirar dúvidas dos alunos.',
];

function Conversa() {
  const b = useBuilder();
  const [texto, setTexto] = useState('');
  const fim = useRef(null);
  const area = useRef(null);

  useEffect(() => {
    const caixa = fim.current?.parentElement;
    if (caixa) caixa.scrollTop = caixa.scrollHeight;
  }, [b.messages, b.sending]);

  useEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, [texto]);

  const enviar = (t = texto) => {
    if (!t.trim() || b.sending) return;
    b.sendMessage(t);
    setTexto('');
  };

  const semCota = b.plano && b.plano.builderRestantes <= 0;

  return (
    <div className="chat">
      <div className="chat-scroll" aria-live="polite">
        {b.messages.length === 0 && (
          <div className="stack" style={{ marginTop: 'auto' }}>
            <div className="msg msg-bot">
              <span className="msg-who">Helpy</span>
              <div className="msg-body">
                Oi! Eu monto o atendente do seu negócio com você. Me conta: o que a sua empresa faz e para quem? Pode escrever do seu jeito, até colar sua tabela de preços.
              </div>
            </div>
            <div className="stack stack-sm">
              {SUGESTOES.map((s) => (
                <button key={s} type="button" className="btn btn-ghost btn-sm" style={{ height: 'auto', padding: '8px 12px', whiteSpace: 'normal', textAlign: 'left', justifyContent: 'flex-start' }} onClick={() => enviar(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {b.messages.map((m, i) => (
          <div key={i} className={`msg ${m.role === 'user' ? 'msg-user' : m.role === 'system' ? 'msg-system' : 'msg-bot'}`}>
            {m.role === 'assistant' && <span className="msg-who">Helpy</span>}
            <div className="msg-body">{m.content}</div>
          </div>
        ))}
        {b.sending && (
          <div className="msg msg-bot">
            <span className="msg-who">Helpy</span>
            <div className="msg-body typing" aria-label="Escrevendo"><i /><i /><i /></div>
          </div>
        )}
        <div ref={fim} />
      </div>
      <div className="composer">
        <div className="composer-row">
          <textarea
            ref={area}
            rows={1}
            value={texto}
            placeholder={semCota ? 'Mensagens de montagem do mês esgotadas' : 'Conte sobre o seu negócio…'}
            disabled={b.sending || semCota}
            aria-label="Mensagem para o Helpy"
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                enviar();
              }
            }}
          />
          <button type="button" className="btn btn-primary btn-icon" disabled={!texto.trim() || b.sending || semCota} onClick={() => enviar()} aria-label="Enviar">
            <ArrowUp />
          </button>
        </div>
        <div className="composer-note">
          <span>Enter envia · Shift+Enter quebra linha ·</span>
          {b.plano && <span className="num">{b.plano.builderRestantes} mensagens de montagem restantes no mês</span>}
        </div>
      </div>
    </div>
  );
}

function ModoFormulario() {
  const b = useBuilder();
  return (
    <div className="stack" style={{ padding: 22, overflowY: 'auto' }}>
      <div className="alert">
        <Lock />
        <span>
          {b.plano?.expirado
            ? 'Seu teste grátis terminou. Escolha um plano para voltar a montar com a IA.'
            : `Montar conversando com a IA faz parte do plano Profissional. No ${b.plano?.nome}, você preenche o documento ao lado.`}{' '}
          <Link to="/painel/plano">Ver planos</Link>
        </span>
      </div>
      <p className="muted" style={{ fontSize: 14 }}>
        Comece pelo tipo de negócio. Os campos com <span className="req">*</span> são o mínimo para publicar; o resto deixa o atendente mais esperto.
      </p>
      {b.modelo && <EscolherModelo compacto />}
    </div>
  );
}

function Tela() {
  const b = useBuilder();
  const navigate = useNavigate();
  const avisar = useToast();
  const [publicando, setPublicando] = useState(false);
  const [recomecar, setRecomecar] = useState(false);

  if (b.loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
        <div className="stack" style={{ alignItems: 'center' }}>
          <Marca size={44} />
          <p className="faint">Abrindo o documento…</p>
        </div>
      </div>
    );
  }

  if (b.loadError) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 16 }}>
        <div className="card stack" style={{ maxWidth: 460 }}>
          <h1 style={{ fontSize: 24 }}>Não deu para abrir o builder</h1>
          <p className="muted">{b.loadError}</p>
          <Link to="/painel/assistentes" className="btn btn-ghost">Voltar</Link>
        </div>
      </div>
    );
  }

  const faltando = b.missing.critical.map((k) => labelOf(b.schema, k));

  const publicar = async () => {
    setPublicando(true);
    try {
      const a = await b.publicar();
      avisar(b.editando ? 'Alterações publicadas' : 'Assistente publicado', { texto: 'Teste como um cliente veria.' });
      navigate(`/painel/assistentes/${a.id}/testar`);
    } catch (e) {
      avisar('Ainda não dá para publicar', { erro: true, texto: e.message });
    } finally {
      setPublicando(false);
    }
  };

  const salvo = { saving: 'Salvando…', saved: 'Salvo', error: 'Não salvou — confira a conexão', idle: '' }[b.saveState];

  return (
    <div className="builder">
      <aside className="builder-chat">
        <div className="builder-chat-head">
          <Link to="/painel/assistentes" className="btn btn-quiet btn-icon" aria-label="Voltar aos assistentes">
            <ArrowLeft />
          </Link>
          <Marca size={26} />
          <div style={{ minWidth: 0 }}>
            <b style={{ display: 'block' }}>{b.editando ? 'Editar assistente' : 'Novo assistente'}</b>
            <span className="faint" style={{ fontSize: 12.5 }}>{b.ramo || 'Conte sobre o negócio'}</span>
          </div>
        </div>
        {b.plano?.builderIA ? <Conversa /> : <ModoFormulario />}
      </aside>

      <section className="builder-doc" aria-label="Documento do assistente">
        <div className="builder-top">
          <div className="progress-ring" title={faltando.length ? `Falta: ${faltando.join(', ')}` : 'Tudo o que é obrigatório está preenchido'}>
            <div className="meter" style={{ width: 120 }}>
              <span style={{ width: `${b.progress}%` }} />
            </div>
            <span className="num"><b>{b.progress}%</b> completo</span>
          </div>
          <span className="faint" style={{ fontSize: 12.5 }}>{salvo}</span>
          <span className="spacer" />
          {!b.editando && (
            <button type="button" className="btn btn-quiet btn-sm" onClick={() => setRecomecar(true)}>
              <RotateCcw /> Recomeçar
            </button>
          )}
          <button type="button" className={`btn ${b.ready ? 'btn-senha' : 'btn-ghost'}`} disabled={publicando || !b.modelo} onClick={publicar}>
            {publicando ? <Loader2 className="spin" /> : <Check />}
            {b.editando ? 'Publicar alterações' : 'Publicar'}
          </button>
        </div>
        {faltando.length > 0 && b.modelo && (
          <p className="faint" style={{ fontSize: 13, padding: '10px 36px 0' }}>
            Para publicar falta: {faltando.join(', ')}.
          </p>
        )}
        <Documento />
      </section>

      <Confirmar
        aberto={recomecar}
        titulo="Recomeçar do zero?"
        texto="A conversa e o que foi preenchido neste rascunho serão descartados."
        acao="Recomeçar"
        perigo
        onConfirmar={async () => {
          setRecomecar(false);
          await b.recomecar();
        }}
        onFechar={() => setRecomecar(false)}
      />
    </div>
  );
}

export default function Builder() {
  const { id } = useParams();
  return (
    <BuilderProvider key={id ?? 'novo'} assistantId={id ?? null}>
      <Tela />
    </BuilderProvider>
  );
}
