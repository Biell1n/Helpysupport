import { useRef, useState } from 'react';
import { Camera, Loader2, Trash2 } from 'lucide-react';
import { apagarFoto, enviarFoto } from '@/lib/fotos';
import { useToast } from '@/components/Toasts';

/** A foto (ou a inicial do nome, quando não há foto). */
export function Avatar({ foto, nome, tamanho = 40, redondo = false, className = '' }) {
  const estilo = { width: tamanho, height: tamanho, borderRadius: redondo ? '50%' : undefined };
  if (foto) return <img className={`avatar-foto ${className}`} src={foto} alt="" style={estilo} loading="lazy" />;
  return (
    <span className={`avatar-inicial ${className}`} style={{ ...estilo, fontSize: tamanho * 0.42 }} aria-hidden="true">
      {(nome || '?').trim()[0]?.toUpperCase() ?? '?'}
    </span>
  );
}

/**
 * Foto com os botões de trocar e remover. A imagem é cortada quadrada, reduzida e
 * guardada na pasta do usuário; "onSalvar(url | null)" grava o endereço no lugar certo.
 */
/** compacto: só a foto (toque para trocar); remover fica a cargo de quem usa. */
export default function TrocarFoto({ userId, nomeArquivo, foto, nome, onSalvar, tamanho = 72, redondo = false, compacto = false }) {
  const entrada = useRef(null);
  const [ocupado, setOcupado] = useState(false);
  const avisar = useToast();

  const escolher = async (e) => {
    const arquivo = e.target.files?.[0];
    e.target.value = '';
    if (!arquivo) return;
    setOcupado(true);
    try {
      const url = await enviarFoto(userId, nomeArquivo, arquivo, foto);
      await onSalvar(url);
      avisar('Foto trocada');
    } catch (err) {
      avisar('Não deu para trocar a foto', { erro: true, texto: err.message });
    } finally {
      setOcupado(false);
    }
  };

  const remover = async () => {
    setOcupado(true);
    try {
      await onSalvar(null);
      await apagarFoto(foto);
      avisar('Foto removida');
    } catch (err) {
      avisar('Não deu para remover a foto', { erro: true, texto: err.message });
    } finally {
      setOcupado(false);
    }
  };

  return (
    <div className="row" style={{ gap: 14 }}>
      <button type="button" className="foto-troca" onClick={() => entrada.current?.click()} disabled={ocupado} aria-label={foto ? 'Trocar foto' : 'Colocar foto'} title={foto ? 'Trocar foto' : 'Colocar foto'}>
        <Avatar foto={foto} nome={nome} tamanho={tamanho} redondo={redondo} />
        <span className="foto-troca-icone">{ocupado ? <Loader2 className="spin" /> : <Camera />}</span>
      </button>
      {!compacto && <div className="stack stack-sm">
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => entrada.current?.click()} disabled={ocupado}>
          <Camera /> {foto ? 'Trocar foto' : 'Colocar foto'}
        </button>
        {foto && (
          <button type="button" className="btn btn-quiet btn-sm" onClick={remover} disabled={ocupado}>
            <Trash2 /> Remover
          </button>
        )}
      </div>}
      <input ref={entrada} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={escolher} />
    </div>
  );
}
