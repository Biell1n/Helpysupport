import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Copy, ExternalLink, Link2, Pause, Play, RefreshCw, Trash2 } from 'lucide-react';
import { chamar, supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/Toasts';
import { Confirmar, Modal } from '@/components/Modal';
import { planOf } from '@/lib/plans';
import { quando } from '@/lib/format';
import { IconeDoCanal as Icone } from '@/components/IconesCanais';

// os avisos da Meta e do Discord chegam pelo mesmo endereço do chat público
const BASE = `${import.meta.env.VITE_SUPABASE_URL ?? ''}/functions/v1/public-chat`;
const WEBHOOK = `${BASE}?canal=meta`;
const COLUNAS = 'id, assistant_id, tipo, status, nome, externo_id, config, verificar_token, ultimo_evento_em, erro, criado_em';

const SERVICOS = [
  {
    tipo: 'whatsapp',
    nome: 'WhatsApp',
    frase: 'Responde no número da empresa, pela API oficial da Meta. Sem chip no celular, sem risco de bloqueio.',
    meta: true,
  },
  {
    tipo: 'instagram',
    nome: 'Instagram',
    frase: 'Responde as mensagens do Direct da conta profissional.',
    meta: true,
  },
  {
    tipo: 'discord',
    nome: 'Discord',
    frase: 'Um bot da empresa no servidor: o cliente usa /helpy e recebe a resposta na hora.',
    meta: false,
  },
];

const ROTULO_STATUS = { ativo: 'Respondendo', pausado: 'Pausado', erro: 'Com erro', pendente: 'Aguardando' };
const CLASSE_STATUS = { ativo: 'badge-closed', pausado: 'badge-bot', erro: 'badge-waiting', pendente: 'badge-human' };

function Copiavel({ rotulo, valor, dica }) {
  const avisar = useToast();
  const [copiado, setCopiado] = useState(false);
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(valor);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1600);
    } catch {
      avisar('Copie manualmente', { texto: valor });
    }
  };
  return (
    <div className="copiavel">
      <span className="label">{rotulo}</span>
      <div className="copiavel-linha">
        <code className="mono">{valor}</code>
        <button type="button" className="btn btn-ghost btn-sm btn-icon" onClick={copiar} aria-label={`Copiar ${rotulo}`}>
          {copiado ? <Check size={15} /> : <Copy size={15} />}
        </button>
      </div>
      {dica && <span className="hint">{dica}</span>}
    </div>
  );
}

/** O passo a passo de cada serviço, do jeito que aparece no painel deles. */
function Passos({ tipo }) {
  if (tipo === 'whatsapp') {
    return (
      <ol className="passos">
        <li>No <a href="https://developers.facebook.com/apps" target="_blank" rel="noreferrer">painel de apps da Meta</a>, abra o app da empresa com o produto <b>WhatsApp</b>.</li>
        <li>Em <b>WhatsApp → Configuração da API</b>, copie a <b>Identificação do número de telefone</b> e a <b>Identificação da conta do WhatsApp Business</b>.</li>
        <li>Gere um <b>token de acesso permanente</b> (usuário do sistema, com as permissões <i>whatsapp_business_messaging</i> e <i>whatsapp_business_management</i>).</li>
        <li>Cole tudo aqui. Depois de conectar, o Helpy mostra o endereço do webhook para colar em <b>WhatsApp → Configuração</b>.</li>
      </ol>
    );
  }
  if (tipo === 'instagram') {
    return (
      <ol className="passos">
        <li>A conta precisa ser <b>profissional</b> (comercial ou criador de conteúdo).</li>
        <li>No <a href="https://developers.facebook.com/apps" target="_blank" rel="noreferrer">painel de apps da Meta</a>, adicione o produto <b>Instagram</b> e escolha <b>API com login do Instagram</b>.</li>
        <li>Em <b>Gerar tokens de acesso</b>, adicione a conta e copie o token.</li>
        <li>Cole aqui. Depois o Helpy mostra o endereço do webhook para colar em <b>Configurar webhooks</b> (campo <i>messages</i>).</li>
      </ol>
    );
  }
  return (
    <ol className="passos">
      <li>No <a href="https://discord.com/developers/applications" target="_blank" rel="noreferrer">Discord Developer Portal</a>, crie um aplicativo com o nome da empresa.</li>
      <li>Em <b>Bot</b>, clique em <b>Reset Token</b> e copie o token do bot.</li>
      <li>Cole aqui. O Helpy confere o token e cria o comando <b>/helpy</b> sozinho.</li>
      <li>Depois é só colar o endereço que aparece em <b>General Information → Interactions Endpoint URL</b> e convidar o bot para o servidor.</li>
    </ol>
  );
}

function Conectar({ servico, assistentes, onFechar, onPronto }) {
  const avisar = useToast();
  const [f, setF] = useState({ assistant_id: assistentes[0]?.id ?? '', token: '', phone_number_id: '', waba_id: '', app_secret: '' });
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));

  const enviar = async (e) => {
    e.preventDefault();
    setEnviando(true);
    setErro('');
    try {
      const { canal } = await chamar('canais', { action: 'conectar', tipo: servico.tipo, ...f });
      avisar(`${servico.nome} conectado`, { texto: 'Falta só um passo: colar o endereço no painel do serviço.' });
      onPronto(canal);
    } catch (err) {
      setErro(err.message);
    } finally {
      setEnviando(false);
    }
  };

  const I = Icone[servico.tipo];
  return (
    <Modal aberto onFechar={onFechar} largura={560}>
      <div className="row" style={{ gap: 12, marginBottom: 6 }}>
        <span className={`canal-icone canal-${servico.tipo}`}><I width={22} height={22} /></span>
        <h2 style={{ margin: 0 }}>Conectar {servico.nome}</h2>
      </div>
      <Passos tipo={servico.tipo} />
      <form className="stack" onSubmit={enviar}>
        <label className="field">
          <span className="label">Assistente que vai responder</span>
          <select className="input" value={f.assistant_id} onChange={set('assistant_id')} required>
            {assistentes.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </label>
        {servico.tipo === 'whatsapp' && (
          <div className="grid-2">
            <label className="field">
              <span className="label">Identificação do número</span>
              <input className="input mono" inputMode="numeric" value={f.phone_number_id} onChange={set('phone_number_id')} placeholder="1234567890…" required />
            </label>
            <label className="field">
              <span className="label">Identificação da conta (WABA)</span>
              <input className="input mono" inputMode="numeric" value={f.waba_id} onChange={set('waba_id')} placeholder="opcional" />
            </label>
          </div>
        )}
        <label className="field">
          <span className="label">{servico.tipo === 'discord' ? 'Token do bot' : 'Token de acesso'}</span>
          <input className="input mono" type="password" autoComplete="off" value={f.token} onChange={set('token')} required />
          <span className="hint">Fica guardado criptografado no cofre do servidor. Ninguém da equipe consegue ver depois.</span>
        </label>
        {servico.meta && (
          <details className="mais">
            <summary>Usa um app próprio da Meta?</summary>
            <label className="field" style={{ marginTop: 10 }}>
              <span className="label">Chave secreta do app</span>
              <input className="input mono" type="password" autoComplete="off" value={f.app_secret} onChange={set('app_secret')} />
              <span className="hint">Em Configurações do app → Básico. Serve para o Helpy confirmar que o aviso de mensagem nova veio mesmo da Meta.</span>
            </label>
          </details>
        )}
        {erro && <div className="alert alert-erro"><span>{erro}</span></div>}
        <div className="modal-foot">
          <button type="button" className="btn btn-ghost" onClick={onFechar}>Cancelar</button>
          <button type="submit" className="btn btn-primary" disabled={enviando || !f.assistant_id}>
            {enviando ? 'Conferindo…' : 'Conectar'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** O que colar no painel do serviço depois de conectar. */
function Enderecos({ canal }) {
  if (canal.tipo === 'discord') {
    const convite = `https://discord.com/oauth2/authorize?client_id=${canal.externo_id}&scope=bot+applications.commands&permissions=2048`;
    return (
      <div className="stack-sm">
        <Copiavel rotulo="Interactions Endpoint URL" valor={`${BASE}?discord=${canal.id}`} dica="Cole em General Information no Developer Portal e salve." />
        <a className="btn btn-ghost btn-sm" href={convite} target="_blank" rel="noreferrer" style={{ alignSelf: 'flex-start' }}>
          <ExternalLink size={15} /> Convidar o bot para um servidor
        </a>
      </div>
    );
  }
  return (
    <div className="grid-2">
      <Copiavel rotulo="URL de callback" valor={WEBHOOK} />
      <Copiavel rotulo="Verificar token" valor={canal.verificar_token} dica={canal.tipo === 'whatsapp' ? 'Assine o campo "messages".' : 'Assine o campo "messages".'} />
    </div>
  );
}

/** Uma barrinha por dia nos últimos 30 dias: altura = conversas que chegaram por este canal. */
function Atividade({ dias }) {
  if (!dias) return null;
  const max = Math.max(1, ...dias);
  const total = dias.reduce((a, b) => a + b, 0);
  const hoje = new Date();
  return (
    <div className="canal-atividade">
      <div className="canal-atividade-barras" role="img" aria-label={`${total} conversas nos últimos 30 dias`}>
        {dias.map((v, i) => {
          const d = new Date(hoje.getTime() - (dias.length - 1 - i) * 864e5);
          return (
            <i
              key={i}
              data-vazio={v ? undefined : ''}
              style={{ '--h': `${Math.max(14, (v / max) * 100)}%` }}
              title={`${d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}: ${v} ${v === 1 ? 'conversa' : 'conversas'}`}
            />
          );
        })}
      </div>
      <div className="canal-atividade-legenda faint">
        <span>30 dias atrás</span>
        <span>{total} {total === 1 ? 'conversa' : 'conversas'}</span>
        <span>hoje</span>
      </div>
    </div>
  );
}

function CanalConectado({ canal, assistentes, ocupado, onAcao, atividade }) {
  const [aberto, setAberto] = useState(!canal.ultimo_evento_em);
  return (
    <div className={`canal-conta canal-${canal.tipo}`}>
      <div className="row" style={{ justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <b>{canal.nome || canal.externo_id}</b>
          <div className="faint" style={{ fontSize: 13 }}>
            {canal.ultimo_evento_em ? `Última mensagem ${quando(canal.ultimo_evento_em)}` : 'Nenhuma mensagem ainda'}
          </div>
        </div>
        <span className={`badge ${CLASSE_STATUS[canal.status] ?? ''}`}>{ROTULO_STATUS[canal.status] ?? canal.status}</span>
      </div>
      {canal.erro && <div className="alert alert-erro" style={{ marginTop: 10 }}><span>{canal.erro}</span></div>}
      <Atividade dias={atividade} />
      <label className="field" style={{ marginTop: 12 }}>
        <span className="label">Assistente</span>
        <select className="input" value={canal.assistant_id} disabled={ocupado} onChange={(e) => onAcao('trocar_assistente', { assistant_id: e.target.value })}>
          {assistentes.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </label>
      <button type="button" className="link-btn" style={{ marginTop: 10 }} onClick={() => setAberto((v) => !v)}>
        {aberto ? 'Esconder endereços' : 'Ver endereços para colar no serviço'}
      </button>
      {aberto && <div style={{ marginTop: 10 }}><Enderecos canal={canal} /></div>}
      <div className="row row-wrap" style={{ gap: 8, marginTop: 12 }}>
        <button type="button" className="btn btn-ghost btn-sm" disabled={ocupado} onClick={() => onAcao('testar')}><RefreshCw size={15} /> Testar</button>
        {canal.status === 'pausado' ? (
          <button type="button" className="btn btn-ghost btn-sm" disabled={ocupado} onClick={() => onAcao('pausar', { ativo: true })}><Play size={15} /> Retomar</button>
        ) : (
          <button type="button" className="btn btn-ghost btn-sm" disabled={ocupado} onClick={() => onAcao('pausar', { ativo: false })}><Pause size={15} /> Pausar</button>
        )}
        <button type="button" className="btn btn-quiet btn-sm" disabled={ocupado} onClick={() => onAcao('desconectar')}><Trash2 size={15} /> Desconectar</button>
      </div>
    </div>
  );
}

/** Canais: o mesmo assistente respondendo no link, no WhatsApp, no Instagram e no Discord. */
export default function Canais() {
  const { profile } = useAuth();
  const avisar = useToast();
  const plano = planOf(profile);
  const [canais, setCanais] = useState(null);
  const [assistentes, setAssistentes] = useState([]);
  const [conectando, setConectando] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const [apagar, setApagar] = useState(null);
  const [atividade, setAtividade] = useState({});

  const carregar = useCallback(async () => {
    const [c, a] = await Promise.all([
      supabase.from('canais').select(COLUNAS).order('criado_em'),
      supabase.from('assistants').select('id, name').order('created_at'),
    ]);
    if (c.error) avisar('Não deu para carregar os canais', { erro: true, texto: c.error.message });
    setCanais(c.data ?? []);
    setAssistentes(a.data ?? []);
    // conversas por canal nos últimos 30 dias, para as barrinhas de atividade
    if (c.data?.length) {
      const hoje = new Date();
      hoje.setHours(0, 0, 0, 0);
      const desde = new Date(hoje.getTime() - 29 * 864e5);
      const { data: conv } = await supabase.from('conversations').select('canal_id, created_at')
        .not('canal_id', 'is', null).gte('created_at', desde.toISOString()).limit(10000);
      const mapa = {};
      for (const k of c.data) mapa[k.id] = Array(30).fill(0);
      for (const x of conv ?? []) {
        const i = Math.floor((new Date(x.created_at).getTime() - desde.getTime()) / 864e5);
        if (mapa[x.canal_id] && i >= 0 && i < 30) mapa[x.canal_id][i]++;
      }
      setAtividade(mapa);
    }
  }, [avisar]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const acao = async (canal, action, extra = {}) => {
    if (action === 'desconectar') return setApagar(canal);
    setOcupado(true);
    try {
      const r = await chamar('canais', { action, canal_id: canal.id, ...extra });
      if (action === 'testar') {
        avisar(r.ok ? 'Tudo certo com a conexão' : 'A conexão falhou', r.ok ? {} : { erro: true, texto: r.erro });
      }
      await carregar();
    } catch (e) {
      avisar('Não deu certo', { erro: true, texto: e.message });
    } finally {
      setOcupado(false);
    }
  };

  const desconectar = async () => {
    const c = apagar;
    setApagar(null);
    setOcupado(true);
    try {
      await chamar('canais', { action: 'desconectar', canal_id: c.id });
      avisar('Canal desconectado', { texto: 'O token foi apagado do cofre.' });
      await carregar();
    } catch (e) {
      avisar('Não deu certo', { erro: true, texto: e.message });
    } finally {
      setOcupado(false);
    }
  };

  const contasMeta = (canais ?? []).filter((c) => c.tipo !== 'discord').length;

  return (
    <div className="page" style={{ maxWidth: 960 }}>
      <header className="page-head">
        <div>
          <h1>Canais</h1>
          <p>O mesmo assistente, com as mesmas regras e os mesmos dados, onde o seu cliente já conversa.</p>
        </div>
      </header>

      <div className="canais-grade">
        <section className="card canal-card">
          <div className="canal-topo">
            <span className="canal-icone canal-link"><Link2 size={22} /></span>
            <div>
              <h2 className="card-title">Link do chat</h2>
              <span className="badge badge-closed">Sempre ligado</span>
            </div>
          </div>
          <p className="muted canal-frase">Um endereço para pôr no site, na bio e no QR code do balcão. Já vem em todos os planos.</p>
          <Link to="/painel/assistentes" className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }}>Ver links e QR codes</Link>
        </section>

        {SERVICOS.map((s) => {
          const I = Icone[s.tipo];
          const doTipo = (canais ?? []).filter((c) => c.tipo === s.tipo);
          const bloqueado = s.meta && !plano.canaisMeta;
          const cheio = s.meta && plano.canaisMeta > 0 && contasMeta >= plano.canaisMeta;
          return (
            <section key={s.tipo} className={`card canal-card${bloqueado ? ' canal-bloqueado' : ''}`}>
              <div className="canal-topo">
                <span className={`canal-icone canal-${s.tipo}`}><I width={22} height={22} /></span>
                <div>
                  <h2 className="card-title">{s.nome}</h2>
                  {bloqueado ? (
                    <span className="badge badge-plain badge-human">Profissional em diante</span>
                  ) : doTipo.length ? (
                    <span className="badge badge-closed">{doTipo.length} conectad{doTipo.length > 1 ? 'os' : 'o'}</span>
                  ) : (
                    <span className="badge badge-bot">Desligado</span>
                  )}
                </div>
              </div>
              <p className="muted canal-frase">{s.frase}</p>

              {doTipo.map((c) => (
                <CanalConectado key={c.id} canal={c} assistentes={assistentes} ocupado={ocupado} atividade={atividade[c.id]} onAcao={(a, extra) => acao(c, a, extra)} />
              ))}

              {bloqueado ? (
                <Link to="/painel/plano" className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }}>Ver planos</Link>
              ) : (
                <button
                  type="button"
                  className={`btn btn-sm ${doTipo.length ? 'btn-ghost' : 'btn-primary'}`}
                  style={{ alignSelf: 'flex-start' }}
                  disabled={!canais || !assistentes.length || cheio}
                  title={cheio ? `Seu plano conecta até ${plano.canaisMeta} contas de WhatsApp e Instagram` : !assistentes.length ? 'Crie um assistente primeiro' : undefined}
                  onClick={() => setConectando(s)}
                >
                  {doTipo.length ? `Conectar outro ${s.nome}` : `Conectar ${s.nome}`}
                </button>
              )}
            </section>
          );
        })}
      </div>

      <p className="faint" style={{ fontSize: 13, marginTop: 18, maxWidth: 680 }}>
        As conversas de todos os canais caem em Atendimentos, contam no mesmo limite do plano e seguem as mesmas regras de chamado.
        Quando alguém da equipe responde por lá, a resposta sai pelo canal de onde o cliente escreveu.
        {plano.canaisMeta > 0 && ` Seu plano conecta até ${plano.canaisMeta} contas de WhatsApp e Instagram (${contasMeta} em uso).`}
      </p>

      {conectando && (
        <Conectar
          servico={conectando}
          assistentes={assistentes}
          onFechar={() => setConectando(null)}
          onPronto={async () => {
            setConectando(null);
            await carregar();
          }}
        />
      )}
      <Confirmar
        aberto={!!apagar}
        titulo={`Desconectar ${apagar?.nome ?? 'o canal'}?`}
        texto="O assistente para de responder por lá e o token é apagado. As conversas que já aconteceram continuam em Atendimentos."
        acao="Desconectar"
        perigo
        onConfirmar={desconectar}
        onFechar={() => setApagar(null)}
      />
    </div>
  );
}

