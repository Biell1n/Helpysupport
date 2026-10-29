import { Fragment, useEffect, useState } from 'react';
import { Link, NavLink, Navigate, Outlet, useLocation } from 'react-router-dom';
import { BarChart3, Bell, CalendarDays, Menu, Headset, Gem, LayoutGrid, LifeBuoy, LogOut, MessagesSquare, Radio, ShoppingBag, Table2, Ticket, UserRound, Users, Wallet } from 'lucide-react';
import Logo from '@/components/Logo';
import { useAuth } from '@/contexts/AuthContext';
import { chamar, supabase } from '@/lib/supabase';
import { VerificarCodigo } from '@/components/DuasEtapas';
import { aceitar, gravarAceitePendente, TERMOS_VERSAO } from '@/lib/termos';
import { useUso } from '@/lib/useUso';
import { diasDeTeste, planOf } from '@/lib/plans';
import { usePrecos } from '@/lib/precos';
import { iniciais } from '@/lib/format';
import { Avatar } from '@/components/TrocarFoto';
import EscolherTema from '@/components/EscolherTema';

const NAV = [
  { to: '/painel', label: 'Painel', icon: LayoutGrid, end: true, tipos: ['empresa'] },
  { to: '/painel', label: 'Minhas conversas', icon: MessagesSquare, end: true, tipos: ['cliente'] },
  { to: '/painel/atendimentos', label: 'Atendimentos', icon: Ticket, contador: 'tickets_abertos', tipos: ['empresa', 'funcionario'], grupo: 'Atender' },
  { to: '/painel/pedidos', label: 'Pedidos', icon: ShoppingBag, tipos: ['empresa', 'funcionario'], grupo: 'Atender' },
  { to: '/painel/agenda', label: 'Agenda', icon: CalendarDays, tipos: ['empresa', 'funcionario'], grupo: 'Atender' },
  { to: '/painel/assistentes', label: 'Assistentes', icon: Headset, tipos: ['empresa'], grupo: 'Assistente' },
  { to: '/painel/dados', label: 'Dados', icon: Table2, tipos: ['empresa'], grupo: 'Assistente' },
  { to: '/painel/canais', label: 'Canais', icon: Radio, tipos: ['empresa'], grupo: 'Assistente' },
  { to: '/painel/relatorios', label: 'Relatórios', icon: BarChart3, tipos: ['empresa'], grupo: 'Negócio' },
  { to: '/painel/carteira', label: 'Carteira', icon: Wallet, tipos: ['empresa'], grupo: 'Negócio' },
  { to: '/painel/equipe', label: 'Equipe', icon: Users, tipos: ['empresa'], grupo: 'Negócio' },
  // fora da barra: Avisos é o sino e Plano é o cartão do plano no rodapé (no celular, os dois ficam no "Mais")
  { to: '/painel/avisos', label: 'Avisos', icon: Bell, tipos: ['empresa'], fora: true },
  { to: '/painel/plano', label: 'Plano', icon: Gem, tipos: ['empresa'], fora: true },
  { to: '/painel/suporte', label: 'Ajuda', icon: LifeBuoy, tipos: ['empresa', 'funcionario'], fora: true },
];

// no celular, os destinos do dia a dia ficam numa barra embaixo; o resto vai em "Mais"
const ATALHOS = {
  empresa: ['/painel', '/painel/atendimentos', '/painel/pedidos', '/painel/agenda'],
  funcionario: ['/painel/atendimentos', '/painel/pedidos', '/painel/agenda'],
  cliente: ['/painel'],
};

/** Telas só da empresa: cliente e funcionário voltam para o início deles. */
export function SoEmpresa({ children }) {
  const { tipo } = useAuth();
  return tipo === 'empresa' ? children : <Navigate to="/painel" replace />;
}

/** Telas da empresa e da equipe dela. */
export function EmpresaOuEquipe({ children }) {
  const { tipo } = useAuth();
  return tipo === 'cliente' ? <Navigate to="/painel" replace /> : children;
}

export function Carregando() {
  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
      <div className="skeleton" style={{ width: 160, height: 10 }} />
    </div>
  );
}

/** Só deixa passar quem está logado. */
export function ExigeLogin({ children }) {
  const { loading, user, precisaCodigo } = useAuth();
  const loc = useLocation();
  if (loading) return <Carregando />;
  if (!user) return <Navigate to="/entrar" replace state={{ de: loc.pathname + loc.search }} />;
  if (precisaCodigo) return <VerificarCodigo />;
  return (
    <AceiteTermos>
      <EscolherTipo>{children}</EscolherTipo>
    </AceiteTermos>
  );
}

/**
 * Conta que acabou de nascer pelo Google na tela "Entrar" vira empresa sem
 * ninguém ter escolhido: pergunta uma vez se é empresa ou cliente.
 */
const JANELA_TIPO_MS = 30 * 60 * 1000;
function EscolherTipo({ children }) {
  const { user, profile, reloadProfile } = useAuth();
  const chave = `helpy_tipo_escolhido:${user?.id}`;
  const [escolhido, setEscolhido] = useState(() => {
    try {
      return localStorage.getItem(chave) === '1';
    } catch {
      return true;
    }
  });
  const [indo, setIndo] = useState(false);
  const nova = profile?.created_at && Date.now() - new Date(profile.created_at).getTime() < JANELA_TIPO_MS;
  const pelaGoogle = user?.app_metadata?.provider === 'google';
  if (escolhido || !nova || !pelaGoogle || profile?.tipo !== 'empresa') return children;

  const fechar = () => {
    try {
      localStorage.setItem(chave, '1');
    } catch {
      /* sem armazenamento: pergunta de novo só nesta janela de tempo */
    }
    setEscolhido(true);
  };
  const virarCliente = async () => {
    setIndo(true);
    try {
      await chamar('conta', { action: 'virar_cliente' });
      await reloadProfile();
    } finally {
      setIndo(false);
      fechar();
    }
  };

  return (
    <div className="modal-fundo">
      <div className="card stack" style={{ maxWidth: 520, margin: '12vh auto' }} role="dialog" aria-modal="true" aria-labelledby="tipo-tit">
        <h2 id="tipo-tit" className="card-title">Como você vai usar o Helpy?</h2>
        <div className="tipo-conta" role="radiogroup" aria-label="Tipo de conta">
          <button type="button" role="radio" aria-checked="false" disabled={indo} onClick={fechar}>
            <b>Sou empresa</b>
            <span>Quero criar um assistente para atender meus clientes</span>
          </button>
          <button type="button" role="radio" aria-checked="false" disabled={indo} onClick={virarCliente}>
            <b>Sou cliente</b>
            <span>Quero falar com uma empresa e acompanhar minhas conversas</span>
          </button>
        </div>
        <p className="faint" style={{ fontSize: 12.5, margin: 0 }}>Cliente não vê painel de empresa: só as conversas com as empresas.</p>
      </div>
    </div>
  );
}

/** Conta criada pelo Google (ou termos novos): aceite antes de usar o painel. */
function AceiteTermos({ children }) {
  const { profile, reloadProfile, signOut } = useAuth();
  const [marcado, setMarcado] = useState(false);
  const [tentou, setTentou] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  useEffect(() => {
    if (profile && profile.termos_versao !== TERMOS_VERSAO && !tentou) {
      setTentou(true);
      gravarAceitePendente().then((ok) => ok && reloadProfile());
    }
  }, [profile, tentou, reloadProfile]);
  if (!profile || profile.termos_versao === TERMOS_VERSAO) return children;
  return (
    <div className="modal-fundo">
      <div className="card stack" style={{ maxWidth: 480, margin: '12vh auto' }} role="dialog" aria-modal="true" aria-labelledby="termos-tit">
        <h2 id="termos-tit" className="card-title">Antes de continuar</h2>
        <p className="muted" style={{ fontSize: 14 }}>Atualizamos os termos de uso e a política de privacidade. Leia e aceite para usar o Helpy.</p>
        <label className="check-linha">
          <input type="checkbox" checked={marcado} onChange={(e) => setMarcado(e.target.checked)} />
          <span>
            Li e aceito os <Link to="/termos" target="_blank">termos de uso</Link> e a <Link to="/privacidade" target="_blank">política de privacidade (LGPD)</Link>.
          </span>
        </label>
        {erro && <div className="alert alert-erro"><span>{erro}</span></div>}
        <div className="row row-wrap">
          <button
            type="button"
            className="btn btn-primary"
            disabled={!marcado || salvando}
            onClick={async () => {
              setErro('');
              setSalvando(true);
              const { error } = await aceitar();
              if (error) setErro('Não deu para salvar o aceite. Confira a internet e tente de novo.');
              else await reloadProfile();
              setSalvando(false);
            }}
          >
            {salvando ? 'Salvando…' : 'Aceitar e continuar'}
          </button>
          <button type="button" className="btn btn-ghost" onClick={signOut}>Sair</button>
        </div>
      </div>
    </div>
  );
}

export default function AppShell() {
  const { user, profile, nome, signOut, tipo } = useAuth();
  const [uso, recarregarUso] = useUso();
  usePrecos(); // com os preços de teste, ajusta a cota do Essencial antes das telas lerem
  const { pathname, search } = useLocation();
  const [mais, setMais] = useState(false);
  useEffect(() => setMais(false), [pathname, search]);
  // chamados abertos no título da aba: quem atende vê de longe que tem gente esperando
  const abertos = uso?.tickets_abertos ?? 0;
  useEffect(() => {
    const base = document.title.replace(/^\(\d+\) /, '');
    document.title = abertos > 0 && tipo !== 'cliente' ? `(${abertos}) ${base}` : base;
  }, [abertos, tipo, pathname]);
  // no celular o menu é uma faixa que rola de lado: a página atual fica à vista
  useEffect(() => {
    const ativo = document.querySelector('.side-nav .side-link.active');
    if (ativo && window.matchMedia('(max-width: 900px)').matches) ativo.scrollIntoView({ inline: 'center', block: 'nearest' });
  }, [pathname]);
  // avisos ainda não vistos: a contagem vai no sino
  const [naoVistos, setNaoVistos] = useState(0);
  useEffect(() => {
    if (tipo !== 'empresa') return;
    let vivo = true;
    Promise.all([
      supabase.from('alertas').select('id', { count: 'exact', head: true }).is('visto_em', null),
      supabase.from('assistant_gaps').select('id', { count: 'exact', head: true }).eq('resolvida', false).is('vista_em', null),
    ]).then(([a, g]) => vivo && setNaoVistos((a.count ?? 0) + (g.count ?? 0)));
    return () => {
      vivo = false;
    };
  }, [tipo, pathname, uso]);
  const plano = planOf(profile);
  const dias = diasDeTeste(profile);
  const usados = uso?.atendimentos ?? 0;
  const pctAt = Math.min(100, Math.round((usados / plano.atendimentos) * 100));
  const pctMsg = Math.min(100, Math.round(((uso?.mensagens ?? 0) / plano.mensagens) * 100));
  // a barra mostra o que está mais perto de acabar: atendimentos ou mensagens
  const pelasMensagens = pctMsg > pctAt;
  const pct = Math.max(pctAt, pctMsg);
  const hoje = new Date();
  const renova = Math.ceil((new Date(hoje.getFullYear(), hoje.getMonth() + 1, 1) - hoje) / 864e5);

  return (
    <div className="shell">
      <aside className="side">
        <div className="side-topo">
          <Link to="/painel" className="side-brand" aria-label="Helpy, início do painel">
            <Logo size={28} />
          </Link>
          {tipo === 'empresa' && (
            <NavLink to="/painel/avisos" className={({ isActive }) => `side-sino${isActive ? ' active' : ''}`} aria-label={naoVistos ? `Avisos, ${naoVistos} novos` : 'Avisos'}>
              <Bell size={18} />
              {naoVistos > 0 && <b className="side-sino-conta">{naoVistos > 9 ? '9+' : naoVistos}</b>}
            </NavLink>
          )}
        </div>
        {/* celular: a faixa do topo diz onde a pessoa está e leva aos avisos */}
        <span className="side-titulo-celular">
          {pathname === '/painel/conta' ? 'Conta' : ([...NAV].reverse().find((n) => n.tipos.includes(tipo) && (n.end ? pathname === n.to : pathname.startsWith(n.to)))?.label ?? '')}
        </span>
        {tipo === 'empresa' && (
          <Link to="/painel/avisos" className="side-sino-celular" aria-label={naoVistos ? `Avisos, ${naoVistos} novos` : 'Avisos'}>
            <Bell size={20} />
            {naoVistos > 0 && <b className="side-sino-conta">{naoVistos > 9 ? '9+' : naoVistos}</b>}
          </Link>
        )}

        <nav className="side-nav" aria-label="Seções do painel">
          {NAV.filter((n) => n.tipos.includes(tipo) && !n.fora).map(({ to, label, icon: Icon, end, contador, grupo }, i, lista) => (
            <Fragment key={to + label}>
              {grupo && grupo !== lista[i - 1]?.grupo && tipo === 'empresa' && <span className="side-grupo" aria-hidden="true">{grupo}</span>}
              <NavLink to={to} end={end} aria-label={label} className={({ isActive }) => `side-link${isActive ? ' active' : ''}`}>
                <Icon aria-hidden="true" />
                <span className="side-label">{label}</span>
                {contador && uso?.[contador] > 0 && <span className="side-count">{uso[contador]}</span>}
              </NavLink>
            </Fragment>
          ))}
          {/* no celular o rodapé some: a conta (e o Sair) entra no menu */}
          <NavLink to="/painel/conta" aria-label="Sua conta" className={({ isActive }) => `side-link side-so-celular${isActive ? ' active' : ''}`}>
            <UserRound aria-hidden="true" />
            <span className="side-label">Conta</span>
          </NavLink>
        </nav>

        <div className="side-foot">
          {tipo === 'funcionario' && <p className="side-plan muted" style={{ fontSize: 12.5 }}>Você faz parte da equipe. Chamados e agenda são da empresa.</p>}
          {tipo === 'empresa' && (
          <Link to="/painel/plano" className="side-plan">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <b>{plano.nome}</b>
              {dias != null && <span className="mono">{dias > 0 ? `${dias} dias` : 'terminou'}</span>}
            </div>
            <div className="meter" data-nivel={pct >= 100 ? 'cheio' : pct >= 85 ? 'alto' : undefined}>
              <span style={{ width: `${pct}%` }} />
            </div>
            <span className="num">
              {pelasMensagens
                ? `${(uso?.mensagens ?? 0).toLocaleString('pt-BR')} de ${plano.mensagens.toLocaleString('pt-BR')} mensagens no mês`
                : `${usados} de ${plano.atendimentos} atendimentos no mês`}
            </span>
            <span className="side-plan-rodape">
              <span className="faint">{dias != null ? 'teste grátis' : `renova em ${renova} ${renova === 1 ? 'dia' : 'dias'}`}</span>
              {(pct >= 80 || (dias != null && dias <= 2)) && <span className="side-plan-subir">Aumentar plano</span>}
            </span>
          </Link>
          )}

          {tipo !== 'cliente' && (
            <NavLink to="/painel/suporte" className={({ isActive }) => `side-ajuda${isActive ? ' active' : ''}`}>
              <LifeBuoy size={16} aria-hidden="true" /> Ajuda e suporte
            </NavLink>
          )}

          <div className="side-tema">
            <span className="faint">Tema</span>
            <EscolherTema compacto />
          </div>

          <div className="side-user">
            {profile?.foto_url ? <Avatar foto={profile.foto_url} tamanho={30} redondo /> : <span className="avatar">{iniciais(nome || user?.email)}</span>}
            <Link to="/painel/conta" style={{ textDecoration: 'none', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {nome || user?.email}
            </Link>
            <button type="button" className="btn btn-quiet btn-icon" style={{ color: 'inherit' }} onClick={signOut} aria-label="Sair">
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      <main className="main">
        <Outlet context={{ uso, recarregarUso }} />
      </main>

      {(() => {
        const meus = NAV.filter((n) => n.tipos.includes(tipo));
        const atalhos = ATALHOS[tipo] ?? ['/painel'];
        const principais = meus.filter((n) => atalhos.includes(n.to));
        const resto = meus.filter((n) => !atalhos.includes(n.to));
        // numa conversa aberta a caixa de resposta fica embaixo: a barra sai da frente
        const conversando = pathname.endsWith('/testar') || (pathname === '/painel/atendimentos' && new URLSearchParams(search).has('id'));
        const noMais = resto.some((n) => pathname.startsWith(n.to)) || pathname === '/painel/conta';
        return (
          <>
            <nav className="nav-celular" aria-label="Seções do painel" data-escondida={conversando || undefined}>
              {principais.map(({ to, label, icon: Icon, end, contador }) => (
                <NavLink key={to + label} to={to} end={end} className={({ isActive }) => `nav-celular-item${isActive ? ' active' : ''}`}>
                  <span className="nav-celular-icone">
                    <Icon aria-hidden="true" />
                    {contador && uso?.[contador] > 0 && <b className="nav-celular-conta">{uso[contador]}</b>}
                  </span>
                  <span>{label === 'Minhas conversas' ? 'Conversas' : label}</span>
                </NavLink>
              ))}
              <button type="button" className={`nav-celular-item${noMais || mais ? ' active' : ''}`} aria-expanded={mais} onClick={() => setMais((v) => !v)}>
                <span className="nav-celular-icone"><Menu aria-hidden="true" /></span>
                <span>Mais</span>
              </button>
            </nav>
            {mais && (
              <div className="nav-mais" role="dialog" aria-modal="true" aria-label="Mais seções">
                <button type="button" className="nav-mais-fundo" aria-label="Fechar" onClick={() => setMais(false)} />
                <div className="nav-mais-folha">
                  {resto.map(({ to, label, icon: Icon, end }) => (
                    <NavLink key={to + label} to={to} end={end} className={({ isActive }) => `side-link${isActive ? ' active' : ''}`}>
                      <Icon aria-hidden="true" /> <span>{label}</span>
                    </NavLink>
                  ))}
                  <NavLink to="/painel/conta" className={({ isActive }) => `side-link${isActive ? ' active' : ''}`}>
                    <UserRound aria-hidden="true" /> <span>Conta</span>
                  </NavLink>
                  <div className="nav-mais-rodape">
                    <span className="faint">Tema</span>
                    <EscolherTema compacto />
                    <button type="button" className="btn btn-ghost btn-sm" onClick={signOut}><LogOut size={15} /> Sair</button>
                  </div>
                </div>
              </div>
            )}
          </>
        );
      })()}
    </div>
  );
}
