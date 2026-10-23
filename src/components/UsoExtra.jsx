import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/Toasts';
import { reais } from '@/lib/plans';
import { usePrecos } from '@/lib/precos';

const moeda = (n) => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/**
 * Uso extra: quando a cota do plano acaba, o atendimento continua e o que
 * passar vira uma fatura separada no começo do mês seguinte, até o limite do
 * mês que o dono escolhe.
 */
export default function UsoExtra({ plano }) {
  const { user, profile, reloadProfile } = useAuth();
  const avisar = useToast();
  const [ativo, setAtivo] = useState(!!profile?.extra_ativo);
  const [limite, setLimite] = useState(String(Number(profile?.extra_limite ?? 0) || 50));
  const { extra: PRECO_EXTRA } = usePrecos();
  const [gasto, setGasto] = useState(null);
  const [atrasada, setAtrasada] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const teste = plano.id === 'trial';

  useEffect(() => {
    setAtivo(!!profile?.extra_ativo);
    if (Number(profile?.extra_limite)) setLimite(String(Number(profile.extra_limite)));
  }, [profile?.extra_ativo, profile?.extra_limite]);

  useEffect(() => {
    const d = new Date();
    const mes = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString().slice(0, 10);
    supabase.from('uso_extra').select('atendimentos, mensagens, valor').eq('mes', mes).maybeSingle()
      .then(({ data }) => setGasto(data ?? { atendimentos: 0, mensagens: 0, valor: 0 }));
    supabase.from('uso_extra').select('mes', { count: 'exact', head: true }).eq('status', 'atrasado')
      .then(({ count }) => setAtrasada((count ?? 0) > 0));
  }, []);

  const limiteSalvo = Number(profile?.extra_limite ?? 0);
  const valorLimite = Math.max(0, Math.min(10000, Number(String(limite).replace(',', '.')) || 0));
  const mudouLimite = ativo && valorLimite !== limiteSalvo;
  const usado = Number(gasto?.valor ?? 0);
  const pct = valorLimite ? Math.min(100, (usado / valorLimite) * 100) : 0;

  const salvar = async (ligado, teto) => {
    if (ligado && teto < 1) return avisar('Defina um limite', { erro: true, texto: 'Coloque pelo menos R$ 1,00 por mês.' });
    setSalvando(true);
    const { error } = await supabase.from('profiles').update({ extra_ativo: ligado, extra_limite: teto }).eq('id', user.id);
    setSalvando(false);
    if (error) {
      setAtivo(!!profile?.extra_ativo);
      return avisar('Não deu para salvar', { erro: true, texto: error.message });
    }
    await reloadProfile?.();
    avisar(ligado ? `Uso extra ligado, até ${moeda(teto)} por mês` : 'Uso extra desligado');
  };

  // ligar ou desligar já salva; o limite salva quando muda
  const alternar = (ligado) => {
    setAtivo(ligado);
    salvar(ligado, valorLimite || 50);
  };

  return (
    <section className="card uso-extra">
      <div className="uso-extra-topo">
        <div>
          <h2 className="card-title">Uso extra</h2>
          <p className="muted uso-extra-frase">
            Quando a cota do mês acabar, o assistente continua respondendo e você paga só o que passar:{' '}
            <b>{reais(PRECO_EXTRA.atendimento)}</b> por atendimento e <b>{reais(PRECO_EXTRA.mensagem)}</b> por mensagem.
          </p>
        </div>
        <label className="interruptor" aria-disabled={teste || salvando || undefined}>
          <input type="checkbox" checked={ativo} disabled={teste || salvando} onChange={(e) => alternar(e.target.checked)} aria-label="Uso extra" />
          <span className="interruptor-trilho" aria-hidden="true" />
        </label>
      </div>

      {atrasada && (
        <div className="alert">
          <span>A fatura do uso extra está atrasada. Enquanto ela não for paga, o uso extra fica parado.</span>
        </div>
      )}

      {teste ? (
        <p className="faint" style={{ fontSize: 14, margin: 0 }}>Disponível depois de assinar um plano.</p>
      ) : ativo ? (
        <div className="uso-extra-corpo">
          <form
            className="uso-extra-teto"
            onSubmit={(e) => {
              e.preventDefault();
              if (mudouLimite) salvar(true, valorLimite);
            }}
          >
            <span>Parar quando chegar a</span>
            <span className="uso-extra-reais">
              R$
              <input className="input" inputMode="decimal" value={limite} aria-label="Limite por mês, em reais"
                onChange={(e) => setLimite(e.target.value.replace(/[^\d,.]/g, ''))} />
            </span>
            <span>no mês.</span>
            {mudouLimite && (
              <button type="submit" className="btn btn-primary btn-sm" disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar'}</button>
            )}
          </form>

          {usado > 0 ? (
            <div className="uso-extra-gasto">
              <div className="meter" data-nivel={pct >= 85 ? 'alto' : undefined}><span style={{ width: `${pct}%` }} /></div>
              <span className="faint">
                {moeda(usado)} usados de {moeda(valorLimite)} ·{' '}
                {gasto.atendimentos} {gasto.atendimentos === 1 ? 'atendimento' : 'atendimentos'} e {gasto.mensagens}{' '}
                {gasto.mensagens === 1 ? 'mensagem' : 'mensagens'} a mais
              </span>
            </div>
          ) : (
            <span className="faint uso-extra-nota">Nada usado além do plano neste mês.</span>
          )}

          <span className="faint uso-extra-nota">
            Vem numa fatura à parte no começo do mês seguinte{profile?.cobranca_isenta ? ' (conta de teste: nunca é cobrado)' : ''}. Abaixo de R$ 5, fica para o outro mês.
          </span>
        </div>
      ) : null}
    </section>
  );
}
