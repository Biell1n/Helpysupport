import { Link, NavLink, Navigate, Outlet, useLocation } from 'react-router-dom';
import { Bot, CalendarDays, Gem, LayoutGrid, LogOut, Table2, Ticket } from 'lucide-react';
import Logo from '@/components/Logo';
import { useAuth } from '@/contexts/AuthContext';
import { useUso } from '@/lib/useUso';
import { diasDeTeste, planOf } from '@/lib/plans';
import { iniciais } from '@/lib/format';

const NAV = [
  { to: '/painel', label: 'Painel', icon: LayoutGrid, end: true },
  { to: '/painel/assistentes', label: 'Assistentes', icon: Bot },
  { to: '/painel/atendimentos', label: 'Atendimentos', icon: Ticket, contador: 'tickets_abertos' },
  { to: '/painel/dados', label: 'Dados', icon: Table2 },
  { to: '/painel/agenda', label: 'Agenda', icon: CalendarDays },
  { to: '/painel/plano', label: 'Plano', icon: Gem },
];

export function Carregando() {
  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
      <div className="skeleton" style={{ width: 160, height: 10 }} />
    </div>
  );
}

/** Só deixa passar quem está logado. */
export function ExigeLogin({ children }) {
  const { loading, user } = useAuth();
  const loc = useLocation();
  if (loading) return <Carregando />;
  if (!user) return <Navigate to="/entrar" replace state={{ de: loc.pathname }} />;
  return children;
}

export default function AppShell() {
  const { user, profile, nome, signOut } = useAuth();
  const [uso, recarregarUso] = useUso();
  const plano = planOf(profile);
  const dias = diasDeTeste(profile);
  const usados = uso?.atendimentos ?? 0;
  const pct = Math.min(100, Math.round((usados / plano.atendimentos) * 100));

  return (
    <div className="shell">
      <aside className="side">
        <Link to="/painel" className="side-brand" aria-label="Helpy, início do painel">
          <Logo size={28} tom="claro" />
        </Link>

        <nav className="side-nav" aria-label="Seções do painel">
          {NAV.map(({ to, label, icon: Icon, end, contador }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => `side-link${isActive ? ' active' : ''}`}>
              <Icon aria-hidden="true" />
              <span className="side-label">{label}</span>
              {contador && uso?.[contador] > 0 && <span className="side-count">{uso[contador]}</span>}
            </NavLink>
          ))}
        </nav>

        <div className="side-foot">
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
