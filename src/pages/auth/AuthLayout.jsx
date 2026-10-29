import { Link } from 'react-router-dom';
import Logo from '@/components/Logo';
import FundoShader from '@/components/FundoShader';

/** senha: o canhoto ao lado do formulário (quem foi convidado vê o convite, não a oferta do teste grátis) */
export default function AuthLayout({ children, senha = { num: 'Nº 0001', titulo: 'O seu primeiro assistente', texto: '7 dias para testar, sem cartão' } }) {
  return (
    <div className="auth">
      <div className="auth-arte">
        <FundoShader />
        <Link to="/" aria-label="Helpy, início">
          <Logo size={28} />
        </Link>
        <div>
          <h2>
            Seu cliente pergunta às 23h.
            <br />
            <span>Seu assistente responde às 23h.</span>
          </h2>
          <div className="lp-senha">
            <div className="lp-senha-num">
              <small>Senha</small>
              <b>{senha.num}</b>
            </div>
            <div className="lp-senha-corpo">
              <b>{senha.titulo}</b>
              <span>{senha.texto}</span>
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
