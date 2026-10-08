import { Link } from 'react-router-dom';
import Logo from '@/components/Logo';

export default function AuthLayout({ children }) {
  return (
    <div className="auth">
      <div className="auth-arte">
        <Link to="/" aria-label="Helpy, início">
          <Logo size={28} />
        </Link>
        <div>
          <h2>
            Seu cliente pergunta às 23h.
            <br />
            <span>Seu atendente responde às 23h.</span>
          </h2>
          <div className="lp-senha">
            <div className="lp-senha-num">
              <small>Senha</small>
              <b>Nº 0001</b>
            </div>
            <div className="lp-senha-corpo">
              <b>O seu primeiro atendente</b>
              <span>14 dias para testar, sem cartão</span>
            </div>
          </div>
        </div>
      </div>
      <div className="auth-form">
        <div className="auth-box">{children}</div>
      </div>
    </div>
  );
}
