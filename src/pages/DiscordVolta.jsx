import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';
import { chamar } from '@/lib/supabase';
import { IconeDoCanal } from '@/components/IconesCanais';
import { origemDoSite } from '@/lib/site';

/** Volta do Discord depois de adicionar o bot do Helpy a um servidor. */
export default function DiscordVolta() {
  const [params] = useSearchParams();
  const [estado, setEstado] = useState({ carregando: true });
  const feito = useRef(false);

  useEffect(() => {
    if (feito.current) return; // o código do Discord só vale uma vez
    feito.current = true;
    const erro = params.get('error');
    if (erro) {
      setEstado({ erro: erro === 'access_denied' ? 'Você cancelou no Discord. Nada foi conectado.' : `O Discord devolveu um erro (${erro}).` });
      return;
    }
    chamar('canais', {
      action: 'discord_concluir',
      code: params.get('code'),
      state: params.get('state'),
      volta: `${origemDoSite()}/painel/canais/discord`,
    })
      .then((r) => setEstado({ ok: r }))
      .catch((e) => setEstado({ erro: e.message }));
  }, [params]);

  const I = IconeDoCanal.discord;
  return (
    <div className="page" style={{ maxWidth: 560 }}>
      <div className="card stack" style={{ marginTop: 40, padding: 28 }}>
        <span className="canal-icone canal-discord"><I width={22} height={22} /></span>
        {estado.carregando && <><h1 style={{ fontSize: 26 }}>Ligando o servidor…</h1><p className="muted">Só um instante.</p></>}
        {estado.ok && (
          <>
            <h1 style={{ fontSize: 26 }}><CheckCircle2 style={{ color: 'var(--folha)', verticalAlign: '-4px' }} /> Discord conectado</h1>
            <p className="muted">
              O servidor <b>{estado.ok.servidor}</b> agora é atendido por <b>{estado.ok.assistente}</b>
              {estado.ok.visual?.nome ? ', e o bot já aparece lá com esse nome' : ''}. No servidor, digite <b>/helpy</b> e a pergunta para testar.
            </p>
            <p className="faint" style={{ fontSize: 13 }}>Da primeira vez, o comando pode levar alguns minutos para aparecer.</p>
          </>
        )}
        {estado.erro && (
          <>
            <h1 style={{ fontSize: 26 }}>Não deu para conectar</h1>
            <div className="alert alert-erro"><span>{estado.erro}</span></div>
          </>
        )}
        {!estado.carregando && <Link to="/painel/canais" className="btn btn-primary" style={{ alignSelf: 'flex-start' }}>Voltar para Canais</Link>}
      </div>
    </div>
  );
}
