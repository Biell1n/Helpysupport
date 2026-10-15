import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { erroAuth } from '@/lib/erroAuth';
import Captcha, { useCaptcha } from '@/components/Captcha';

/** O e-mail de confirmação não chegou: manda de novo (com espera de 60 s entre envios). */
export default function ReenviarConfirmacao({ email, destino = '/painel' }) {
  const [espera, setEspera] = useState(0);
  const [msg, setMsg] = useState('');
  const cap = useCaptcha();

  useEffect(() => {
    if (espera <= 0) return undefined;
    const t = setTimeout(() => setEspera((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [espera]);

  const reenviar = async () => {
    setMsg('');
    if (cap.falta) return setMsg('Confirme a verificação "não sou um robô" abaixo.');
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: `${window.location.origin}${destino}`, ...cap.extra },
    });
    cap.nova();
    if (error) return setMsg(erroAuth(error.message));
    setMsg('Enviamos de novo. Confira a caixa de entrada e o spam.');
    setEspera(60);
  };

  return (
    <div className="stack stack-sm">
      <button type="button" className="btn btn-ghost btn-block" disabled={!email || espera > 0} onClick={reenviar}>
        {espera > 0 ? `Reenviar em ${espera}s` : 'Reenviar e-mail de confirmação'}
      </button>
      <Captcha {...cap.props} />
      {msg && <p className="faint" style={{ fontSize: 13 }} role="status">{msg}</p>}
    </div>
  );
}
