import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, PenLine } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { quando } from '@/lib/format';

/**
 * Assistente que começou a ser montado e ainda não foi publicado.
 * A montagem fica guardada no servidor; isto só mostra que ela existe.
 * undefined = carregando, null = nenhum.
 */
export function useRascunho() {
  const [r, setR] = useState(undefined);
  useEffect(() => {
    let vivo = true;
    supabase
      .from('builder_sessions')
      .select('id, updated_at, nome:config->fields->nome_assistente->>value, negocio:config->fields->nome_negocio->>value, primeira:messages->0')
      .is('assistant_id', null)
      .eq('status', 'active')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (!vivo) return;
        // sessão aberta mas sem nada escrito ainda não conta como rascunho
        setR(data && (data.primeira || data.nome || data.negocio) ? data : null);
      });
    return () => {
      vivo = false;
    };
  }, []);
  return r;
}

export function CartaoRascunho({ rascunho }) {
  if (!rascunho) return null;
  const nome = rascunho.nome || rascunho.negocio;
  return (
    <section className="card rascunho">
      <PenLine aria-hidden="true" />
      <div>
        <b>{nome ? `${nome}: montagem em andamento` : 'Você tem um assistente em montagem'}</b>
        <span className="faint">Tudo que você já escreveu está guardado · mexeu {quando(rascunho.updated_at)}</span>
      </div>
      <Link to="/painel/assistentes/novo" className="btn btn-primary btn-sm">
        Continuar <ArrowRight size={15} />
      </Link>
    </section>
  );
}
