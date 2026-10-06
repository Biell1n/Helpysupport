import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Copy, ExternalLink, Pencil } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/components/Toasts';
import { Conversa } from './ChatPublico';
import { linkPublico } from './Assistentes';

export default function Testar() {
  const { id } = useParams();
  const avisar = useToast();
  const [a, setA] = useState(null);

  useEffect(() => {
    supabase.from('assistants').select('id, name, public_token, is_public').eq('id', id).maybeSingle().then(({ data }) => setA(data));
  }, [id]);

  return (
    <div className="page" style={{ display: 'flex', flexDirection: 'column', height: '100vh', paddingBottom: 24 }}>
      <header className="page-head" style={{ marginBottom: 16 }}>
        <div>
          <Link to="/painel/assistentes" className="btn btn-quiet btn-sm" style={{ marginLeft: -10 }}><ArrowLeft /> Assistentes</Link>
          <h1 style={{ marginTop: 6 }}>Testar {a?.name ?? ''}</h1>
          <p>Converse como se fosse um cliente. O teste usa a mesma inteligência do link público.</p>
        </div>
        <div className="row row-wrap">
          <Link to={`/painel/assistentes/${id}/editar`} className="btn btn-ghost"><Pencil /> Editar</Link>
          {a?.public_token && (
            <>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={async () => {
                  await navigator.clipboard.writeText(linkPublico(a.public_token));
                  avisar('Link copiado');
                }}
              >
                <Copy /> Copiar link
              </button>
              <a className="btn btn-primary" href={linkPublico(a.public_token)} target="_blank" rel="noreferrer"><ExternalLink /> Abrir link público</a>
            </>
          )}
        </div>
      </header>
      <div className="card" style={{ padding: 0, flex: 1, minHeight: 420, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <Conversa assistantId={id} modoTeste />
      </div>
    </div>
  );
}
