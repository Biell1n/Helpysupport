import Logo from '@/components/Logo';

/** Aparece quando o .env.local não foi preenchido. */
export default function Configurar() {
  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 16 }}>
      <div className="card stack" style={{ maxWidth: 560 }}>
        <Logo />
        <h1 style={{ fontSize: 28 }}>Falta ligar o Helpy ao Supabase</h1>
        <p className="muted">
          Crie um arquivo <code>.env.local</code> na raiz do projeto (pode copiar o <code>.env.example</code>) com a URL e a
          chave pública do seu projeto, que ficam em Supabase → Project Settings → API. Depois reinicie o <code>npm run dev</code>.
        </p>
        <pre className="mono" style={{ background: 'var(--papel)', padding: 14, borderRadius: 10, overflow: 'auto', margin: 0 }}>
{`VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_ANON_KEY=sua-chave-anon`}
        </pre>
      </div>
    </div>
  );
}
