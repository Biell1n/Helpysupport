import { Link } from 'react-router-dom';
import { Marca } from '@/components/Logo';

export default function NaoEncontrada() {
  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 16, textAlign: 'center' }}>
      <div className="stack" style={{ alignItems: 'center' }}>
        <Marca size={64} />
        <p className="eyebrow">Nº 0404</p>
        <h1 style={{ fontSize: 34 }}>Essa senha não foi chamada</h1>
        <p className="muted">A página que você procurou não existe ou mudou de endereço.</p>
        <Link to="/" className="btn btn-primary">Voltar ao início</Link>
      </div>
    </div>
  );
}
