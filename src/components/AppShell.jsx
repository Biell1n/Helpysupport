import { useEffect, useState } from 'react';
import { Link, NavLink, Navigate, Outlet, useLocation } from 'react-router-dom';
import { BarChart3, Bot, CalendarDays, Gem, LayoutGrid, LogOut, MessagesSquare, Table2, Ticket, Users } from 'lucide-react';
import Logo from '@/components/Logo';
import { useAuth } from '@/contexts/AuthContext';
import { VerificarCodigo } from '@/components/DuasEtapas';
import { aceitar, gravarAceitePendente, TERMOS_VERSAO } from '@/lib/termos';
import { useUso } from '@/lib/useUso';
import { diasDeTeste, planOf } from '@/lib/plans';
import { iniciais } from '@/lib/format';

const NAV = [
  { to: '/painel', label: 'Painel', icon: LayoutGrid, end: true, tipos: ['empresa'] },
  { to: '/painel', label: 'Minhas conversas', icon: MessagesSquare, end: true, tipos: ['cliente'] },
  { to: '/painel/assistentes', label: 'Assistentes', icon: Bot, tipos: ['empresa'] },
  { to: '/painel/atendimentos', label: 'Atendimentos', icon: Ticket, contador: 'tickets_abertos', tipos: ['empresa', 'funcionario'] },
  { to: '/painel/dados', label: 'Dados', icon: Table2, tipos: ['empresa'] },
  { to: '/painel/agenda', label: 'Agenda', icon: CalendarDays, tipos: ['empresa', 'funcionario'] },
  { to: '/painel/relatorios', label: 'Relatórios', icon: BarChart3, tipos: ['empresa'] },
  { to: '/painel/equipe', label: 'Equipe', icon: Users, tipos: ['empresa'] },
  { to: '/painel/plano', label: 'Plano', icon: Gem, tipos: ['empresa'] },
];

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
  if (!user) return <Navigate to="/entrar" replace state={{ de: loc.pathname }} />;
  if (precisaCodigo) return <VerificarCodigo />;
  return <AceiteTermos>{children}</AceiteTermos>;
}

/** Conta criada pelo Google (ou termos novos): aceite antes de usar o painel. */
function AceiteTermos({ children }) {
  const { profile, reloadProfile, signOut } = useAuth();
  const [marcado, setMarcado] = useState(false);
  const [tentou, setTentou] = useState(false);
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
        <div className="row row-wrap">
          <button type="button" className="btn btn-primary" disabled={!marcado} onClick={async () => { await aceitar(); await reloadProfile(); }}>
            Aceitar e continuar
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
  const plano = planOf(profile);
  const dias = diasDeTeste(profile);
  const usados = uso?.atendimentos ?? 0;
  const pct = Math.min(100, Math.round((usados / plano.atendimentos) * 100));

  return (
    <div className="shell">
      <aside className="side">
        <Link to="/painel" className="side-brand" aria-label="Helpy, início do painel">
          <Logo size={28} />
        </Link>

        <nav className="side-nav" aria-label="Seções do painel">
          {NAV.filter((n) => n.tipos.includes(tipo)).map(({ to, label, icon: Icon, end, contador }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => `side-link${isActive ? ' active' : ''}`}>
              <Icon aria-hidden="true" />
              <span className="side-label">{label}</span>
              {contador && uso?.[contador] > 0 && <span className="side-count">{uso[contador]}</span>}
            </NavLink>
          ))}
        </nav>

        <div className="side-foot">
          {tipo === 'funcionario' && <p className="side-plan muted" style={{ fontSize: 12.5 }}>Você faz parte da equipe. Chamados e agenda são da empresa.</p>}
          {tipo === 'empresa' && (
          <Link to="/painel/plano" className="side-plan">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <b>{plano.nome}</b>
              {dias != null && <span className="mono">{dias > 0 ? `${dias} dias` : 'terminou'}</span>}
            </div>
            <div className="meter" data-nivel={pct >= 85 ? 'alto' : undefined}>
              <span style={{ width: `${pct}%` }} />
            </div>
            <span className="num">
              {usados} de {plano.atendimentos} atendimentos no mês
            </span>
          </Link>
          )}

          <div className="side-user">
            <span className="avatar">{iniciais(nome || user?.email)}</span>
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
    </div>
  );
}
