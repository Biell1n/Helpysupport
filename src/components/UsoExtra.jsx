import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/Toasts';
import { reais } from '@/lib/plans';
import { usePrecos } from '@/lib/precos';

const SUGESTOES = [20, 50, 100, 200];
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

  const valorLimite = Math.max(0, Math.min(10000, Number(String(limite).replace(',', '.')) || 0));
  const mudou = ativo !== !!profile?.extra_ativo || valorLimite !== Number(profile?.extra_limite ?? 0);
  const pct = valorLimite ? Math.min(100, (Number(gasto?.valor ?? 0) / valorLimite) * 100) : 0;

  const salvar = async () => {
    if (ativo && valorLimite < 1) return avisar('Defina um limite', { erro: true, texto: 'Coloque pelo menos R$ 1,00 por mês.' });
    setSalvando(true);
    const { error } = await supabase.from('profiles').update({ extra_ativo: ativo, extra_limite: valorLimite }).eq('id', user.id);
    setSalvando(false);
    if (error) return avisar('Não deu para salvar', { erro: true, texto: error.message });
    await reloadProfile?.();
    avisar(ativo ? 'Uso extra ligado' : 'Uso extra desligado', {
      texto: ativo ? `O atendimento continua depois da cota, até ${moeda(valorLimite)} por mês.` : 'Quando a cota acabar, as conversas vão para a equipe.',
    });
  };

  return (
    <section className="card uso-extra">
      <div className="uso-extra-topo">
        <div>
          <h2 className="card-title">Uso extra</h2>
          <p className="muted" style={{ margin: '4px 0 0', fontSize: 14, maxWidth: 620 }}>
            Quando os atendimentos ou as mensagens do plano acabarem, o assistente continua respondendo e você paga só o que usar,
            até o limite que escolher. O total do mês vem numa fatura separada no começo do mês seguinte. Desligado, as conversas
            viram recado para a equipe até o mês virar.
          </p>
        </div>
        <label className="interruptor" aria-disabled={teste || undefined}>
          <input type="checkbox" checked={ativo} disabled={teste} onChange={(e) => setAtivo(e.target.checked)} />
          <span className="interruptor-trilho" aria-hidden="true" />
          <span><b>{ativo ? 'Ligado' : 'Desligado'}</b></span>
        </label>
      </div>

      {atrasada && (
        <div className="alert">
          <span>A fatura do uso extra está atrasada. Enquanto ela não for paga, o uso extra fica parado. Pague em Sua assinatura, acima.</span>
        </div>
      )}
      {profile?.cobranca_isenta && !teste && (
        <p className="faint" style={{ fontSize: 13, margin: 0 }}>Conta de teste: o uso extra é contado aqui, mas nunca vira fatura.</p>
      )}

      {teste ? (
        <p className="faint" style={{ fontSize: 14, margin: 0 }}>Disponível depois de assinar um plano.</p>
      ) : (
        <div className="uso-extra-grade">
          <div className="stack stack-sm">
            <span className="label">Preço além do plano</span>
            <div className="uso-extra-precos">
              <span><b>{reais(PRECO_EXTRA.atendimento)}</b> por atendimento</span>
              <span><b>{reais(PRECO_EXTRA.mensagem)}</b> por mensagem</span>
            </div>
          </div>

          <label className="field" style={{ margin: 0 }}>
            <span className="label">Limite por mês</span>
            <div className="uso-extra-limite">
              <span className="faint">R$</span>
              <input id="extra-limite" className="input" inputMode="decimal" value={limite} disabled={!ativo} onChange={(e) => setLimite(e.target.value.replace(/[^\d,.]/g, ''))} />
            </div>
            <div className="row row-wrap" style={{ gap: 6 }}>
              {SUGESTOES.map((v) => (
                <button key={v} type="button" className="chip" aria-pressed={valorLimite === v} disabled={!ativo} onClick={() => setLimite(String(v))}>
                  {moeda(v).replace(',00', '')}
                </button>
              ))}
            </div>
            <span className="hint">Chegou no limite, para na hora e as conversas vão para a equipe. Nada é cobrado além dele. Faturas abaixo de R$ 5 esperam o mês seguinte.</span>
          </label>

          <div className="stack stack-sm">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <span className="label">Gasto extra neste mês</span>
              <span className="num faint">{moeda(gasto?.valor)} {valorLimite ? `de ${moeda(valorLimite)}` : ''}</span>
            </div>
            <div className="meter" data-nivel={pct >= 85 ? 'alto' : undefined}><span style={{ width: `${pct}%` }} /></div>
            <span className="faint" style={{ fontSize: 13 }}>
              {gasto ? `${gasto.atendimentos} ${gasto.atendimentos === 1 ? 'atendimento' : 'atendimentos'} e ${gasto.mensagens} ${gasto.mensagens === 1 ? 'mensagem' : 'mensagens'} além do plano` : 'Carregando…'}
            </span>
          </div>
        </div>
      )}

      {!teste && (
        <div className="row" style={{ justifyContent: 'flex-end', marginTop: 4 }}>
          <button type="button" className="btn btn-primary btn-sm" disabled={!mudou || salvando} onClick={salvar}>
            {salvando ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      )}
    </section>
  );
}
