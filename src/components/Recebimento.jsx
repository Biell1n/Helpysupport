import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Wallet } from 'lucide-react';
import { chamar } from '@/lib/supabase';
import { Confirmar } from '@/components/Modal';
import { useToast } from '@/components/Toasts';

/**
 * Receber pelo assistente: a empresa liga a conta Asaas dela. O assistente
 * passa a fechar a compra no chat (site, WhatsApp, Instagram, Discord) com
 * um link de Pix, cartão ou boleto, e o dinheiro cai direto na conta dela.
 */
export default function Recebimento() {
  const avisar = useToast();
  const [rec, setRec] = useState(undefined);
  const [chave, setChave] = useState('');
  const [ambiente, setAmbiente] = useState('sandbox');
  const [indo, setIndo] = useState(false);
  const [erro, setErro] = useState('');
  const [sair, setSair] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const r = await chamar('pagamentos', { action: 'status' });
      setRec(r.recebimento ?? null);
    } catch {
      setRec(null);
    }
  }, []);
  useEffect(() => {
    carregar();
  }, [carregar]);

  const conectar = async (e) => {
    e.preventDefault();
    setErro('');
    setIndo(true);
    try {
      const r = await chamar('pagamentos', { action: 'loja_conectar', chave, ambiente });
      setRec(r.recebimento);
      setChave('');
      avisar('Recebimento ligado', { texto: 'Agora o assistente fecha a compra no chat com Pix, cartão ou boleto.' });
    } catch (e2) {
      setErro(e2.message);
    } finally {
      setIndo(false);
    }
  };

  const desconectar = async () => {
    setSair(false);
    try {
      await chamar('pagamentos', { action: 'loja_desconectar' });
      setRec(null);
      avisar('Recebimento desligado');
    } catch (e) {
      avisar('Não deu para desligar', { erro: true, texto: e.message });
    }
  };

  return (
    <section className="card canal-card recebimento">
      <div className="canal-topo">
        <span className="canal-icone canal-pagamento"><Wallet size={22} /></span>
        <div>
          <h2 className="card-title">Receber pelo assistente</h2>
          <span className={`badge ${rec ? 'badge-closed' : 'badge-bot'}`}>
            {rec === undefined ? '…' : rec ? (rec.ambiente === 'sandbox' ? 'Ligado · teste' : 'Ligado') : 'Desligado'}
          </span>
        </div>
      </div>
      <p className="muted canal-frase">
        O assistente fecha a compra na conversa: confirma os produtos e manda um link de Pix, cartão ou boleto. Quando o pagamento cai, ele avisa o cliente, o pedido aparece em Pedidos e o estoque da tabela baixa sozinho. Funciona no site, WhatsApp, Instagram e Discord. O dinheiro vai direto para a sua conta Asaas.
      </p>
      <p className="faint" style={{ margin: 0, fontSize: 13.5, maxWidth: 680 }}>
        Ligado aqui, você escolhe em cada assistente (Assistentes → Editar → Como funciona): <b>Fechar a venda no chat?</b> e, se ele marca horários, <b>Cobrar para marcar?</b>.
        Quem não vende, como um professor ou um suporte, nem mostra essas opções.
      </p>

      {rec ? (
        <div className="stack-sm">
          <p style={{ margin: 0 }}>Conta: <b>{rec.conta_nome}</b>{rec.ambiente === 'sandbox' && <span className="faint"> (ambiente de teste: dinheiro de mentira)</span>}</p>
          <div className="row row-wrap" style={{ gap: 8 }}>
            <Link className="btn btn-ghost btn-sm" to="/painel/pedidos">Ver pedidos</Link>
            <button type="button" className="btn btn-quiet btn-sm" onClick={() => setSair(true)}>Desligar</button>
          </div>
        </div>
      ) : rec === null ? (
        <form className="stack-sm" onSubmit={conectar}>
          <ol className="passos" style={{ margin: 0 }}>
            <li>Crie sua conta no Asaas (para testar: <a href="https://sandbox.asaas.com" target="_blank" rel="noreferrer">sandbox.asaas.com</a>).</li>
            <li>No Asaas, abra <b>Integrações → Chave de API</b>, gere a chave e cole aqui.</li>
          </ol>
          <div className="grid-2">
            <label className="field">
              <span className="label">Chave de API do Asaas</span>
              <input className="input" type="password" value={chave} onChange={(e) => setChave(e.target.value)} placeholder="$aact_…" autoComplete="off" required />
            </label>
            <label className="field">
              <span className="label">Ambiente</span>
              <select className="input" value={ambiente} onChange={(e) => setAmbiente(e.target.value)}>
                <option value="sandbox">Teste (sandbox)</option>
                <option value="producao">Produção (dinheiro de verdade)</option>
              </select>
            </label>
          </div>
          {erro && <div className="alert alert-erro"><span>{erro}</span></div>}
          <button type="submit" className="btn btn-primary" style={{ alignSelf: 'flex-start' }} disabled={indo || !chave}>
            {indo ? 'Conferindo a chave…' : 'Ligar recebimento'}
          </button>
        </form>
      ) : null}

      <Confirmar
        aberto={sair}
        titulo="Desligar o recebimento?"
        texto="O assistente para de gerar links de pagamento. Os pedidos que já existem continuam em Pedidos."
        acao="Desligar"
        perigo
        onFechar={() => setSair(false)}
        onConfirmar={desconectar}
      />
    </section>
  );
}
