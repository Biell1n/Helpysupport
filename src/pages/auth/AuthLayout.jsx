import { Link } from 'react-router-dom';
import Logo from '@/components/Logo';

export default function AuthLayout({ children }) {
  return (
    <div className="auth">
      <div className="auth-arte">
        <Link to="/" aria-label="Helpy, início">
          <Logo size={30} tom="claro" />
        </Link>
        <h2>Seu cliente pergunta às 23h. Seu atendente responde às 23h.</h2>
        <div className="stub stub-senha">
          <div className="stub-num">
            <small>Senha</small>
            <b>Nº 0001</b>
          </div>
          <div className="stub-body">
            <b>O seu primeiro atendente</b>
            <p style={{ fontSize: 13 }}>14 dias para testar, sem cartão</p>
          </div>
        </div>
      </div>
      <div className="auth-form">
        <div className="auth-box">{children}</div>
      </div>
    </div>
  );
}
