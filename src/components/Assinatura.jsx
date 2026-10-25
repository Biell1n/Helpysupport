import { useState } from 'react';
import { CreditCard, ExternalLink, Receipt } from 'lucide-react';
import { chamar } from '@/lib/supabase';
import { Modal, Confirmar } from '@/components/Modal';
import { useToast } from '@/components/Toasts';
import { useAuth } from '@/contexts/AuthContext';
import { PLANS, reais } from '@/lib/plans';
import { quando } from '@/lib/format';

const STATUS_ASSINATURA = {
  pendente: ['Aguardando pagamento', 'badge-waiting'],
  ativa: ['Ativa', 'badge-closed'],
  atrasada: ['Fatura vencida', 'badge-waiting'],
  cancelada: ['Cancelada', 'badge-bot'],
};
const STATUS_FATURA = {
  PENDING: 'Aguardando', RECEIVED: 'Paga', CONFIRMED: 'Paga', RECEIVED_IN_CASH: 'Paga', OVERDUE: 'Vencida', REFUNDED: 'Estornada',
};
const dataBr = (d) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString('pt-BR') : '');
const mascarar = (v) => {
  const d = v.replace(/\D/g, '').slice(0, 14);
  if (d.length <= 11) return d.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  return d.replace(/^(\d{2})(\d)/, '$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1/$2').replace(/(\d{4})(\d)/, '$1-$2');
};

/** Pede CPF/CNPJ e leva para a fatura (Pix, cartão ou boleto) no Asaas. */
const umCicloDepois = (ciclo) => {
  const d = new Date();
  if (ciclo === 'anual') d.setFullYear(d.getFullYear() + 1);
  else d.setMonth(d.getMonth() + 1);
  return d.toLocaleDateString('pt-BR');
};

export function AssinarModal({ plano, ciclo: cicloInicial = 'mensal', precos, profile, ambiente, onFechar }) {
  const [ciclo, setCiclo] = useState(cicloInicial);
  const valor = precos?.planos?.[plano]?.[ciclo];
  const [documento, setDocumento] = useState('');
  const [nome, setNome] = useState(profile?.company_name || profile?.full_name || '');
  const [indo, setIndo] = useState(false);
  const [erro, setErro] = useState('');
  const p = PLANS[plano];

  const ir = async (e) => {
    e.preventDefault();
    setErro('');
    setIndo(true);
    try {
      const r = await chamar('pagamentos', { action: 'assinar', plano, ciclo, documento, nome });
      window.location.href = r.url;
    } catch (e2) {
      setErro(e2.message);
      setIndo(false);
    }
  };

  return (
    <Modal aberto onFechar={onFechar} largura={460}>
      <form onSubmit={ir} className="stack">
        <div>
          <h2 style={{ margin: 0 }}>Assinar o {p.nome}</h2>
          <p className="faint" style={{ margin: '4px 0 0' }}>Pix, cartão ou boleto. Cancele quando quiser.</p>
        </div>
        <div className="row" role="group" aria-label="Forma de cobrança" style={{ gap: 6 }}>
          <button type="button" className="chip" aria-pressed={ciclo === 'mensal'} onClick={() => setCiclo('mensal')}>Mensal</button>
          <button type="button" className="chip" aria-pressed={ciclo === 'anual'} onClick={() => setCiclo('anual')}>Anual</button>
        </div>
        <div className="assinar-resumo">
          <b>{reais(valor ?? (ciclo === 'anual' ? p.preco * 12 : p.precoMensal))} hoje</b>
          <span className="faint">
            {ciclo === 'anual' ? 'Cobrança anual' : 'Cobrança mensal'}: a próxima vem em {umCicloDepois(ciclo)}.
          </span>
        </div>
        {profile?.plan && profile.plan !== 'trial' && profile.plan !== plano && (
          <div className="alert"><span><b>Troca de plano:</b> quando esta fatura for paga, o {PLANS[profile.plan]?.nome ?? 'plano atual'} é encerrado e o {p.nome} começa a contar do zero. O que falta do período já pago não é descontado.</span></div>
        )}
        {ambiente === 'sandbox' && (
          <div className="alert"><span><b>Modo de teste:</b> nada é cobrado de verdade. Use o cartão de teste do Asaas ou simule o Pix no painel de teste.</span></div>
        )}
        <label className="field">
          <span className="label">Nome ou razão social</span>
          <input className="input" value={nome} onChange={(e) => setNome(e.target.value)} required maxLength={100} />
        </label>
        <label className="field">
          <span className="label">CPF ou CNPJ</span>
          <input className="input" inputMode="numeric" value={documento} onChange={(e) => setDocumento(mascarar(e.target.value))} placeholder="000.000.000-00" required />
          <span className="hint">Vai na nota fiscal. O Asaas exige para gerar a cobrança.</span>
        </label>
        {erro && <div className="alert alert-erro"><span>{erro}</span></div>}
        <div className="modal-foot">
          <button type="button" className="btn btn-ghost" onClick={onFechar}>Cancelar</button>
          <button type="submit" className="btn btn-primary" disabled={indo}><CreditCard size={16} /> {indo ? 'Gerando a fatura…' : 'Ir para o pagamento'}</button>
        </div>
      </form>
    </Modal>
  );
}

/** A assinatura atual e as últimas faturas, na página Plano. */
export function MinhaAssinatura({ dados, onMudou }) {
  const avisar = useToast();
  const { profile } = useAuth();
  const vagas = Number(profile?.funcionarios_extra ?? 0);
  const [cancelar, setCancelar] = useState(false);
  const a = dados?.assinatura;
  const faturas = dados?.faturas ?? [];
  if (!a && !faturas.length) return null;
  const [rotulo, classe] = STATUS_ASSINATURA[a?.status] ?? ['—', ''];
  const aberta = faturas.find((f) => f.status === 'PENDING' || f.status === 'OVERDUE');

  const confirmarCancelar = async () => {
    try {
      const r = await chamar('pagamentos', { action: 'cancelar' });
      avisar('Assinatura cancelada', { texto: r.vale_ate ? `O plano vale até ${dataBr(r.vale_ate)}.` : undefined });
      onMudou?.();
    } catch (e) {
      avisar('Não deu para cancelar', { erro: true, texto: e.message });
    }
  };

  return (
    <section className="card stack" style={{ marginBottom: 28 }}>
      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 className="card-title" style={{ margin: 0 }}>Sua assinatura</h2>
          {a && (
            <p className="muted" style={{ margin: '4px 0 0' }}>
              {PLANS[a.plano]?.nome} · {reais(Number(a.valor))}/{a.ciclo === 'anual' ? 'ano' : 'mês'}
              {vagas > 0 ? ` (com ${vagas} ${vagas === 1 ? 'vaga extra' : 'vagas extras'} na equipe)` : ''}
              {a.status === 'ativa' && a.proximo_vencimento ? ` · ${a.ciclo === 'anual' ? 'renova' : 'próxima cobrança'} em ${dataBr(a.proximo_vencimento)}` : ''}
              {a.status === 'cancelada' && a.proximo_vencimento ? ` · vale até ${dataBr(a.proximo_vencimento)}` : ''}
            </p>
          )}
        </div>
        <div className="row" style={{ gap: 8 }}>
          {a && <span className={`badge ${classe}`}>{rotulo}</span>}
          {dados?.ambiente === 'sandbox' && <span className="badge badge-plain">teste</span>}
        </div>
      </div>
      {aberta?.link && (
        <a className="btn btn-primary" style={{ alignSelf: 'flex-start' }} href={aberta.link}>
          <ExternalLink size={16} /> Pagar a fatura de {reais(Number(aberta.valor))}
        </a>
      )}
      {faturas.length > 0 && (
        <ul className="faturas">
          {faturas.map((f) => (
            <li key={f.id}>
              <Receipt size={15} />
              <span>{f.descricao || 'Fatura'}</span>
              <span className="faint">{f.vencimento ? `vence ${dataBr(f.vencimento)}` : ''}{f.pago_em ? ` · paga ${quando(f.pago_em)}` : ''}{f.forma ? ` · ${f.forma}` : ''}</span>
              <b>{reais(Number(f.valor))}</b>
              <span className={`badge ${['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH'].includes(f.status) ? 'badge-closed' : 'badge-plain'}`}>{STATUS_FATURA[f.status] ?? f.status}</span>
              {f.link && <a href={f.link} target="_blank" rel="noreferrer" className="link-btn">ver</a>}
            </li>
          ))}
        </ul>
      )}
      {a && a.status !== 'cancelada' && (
        <button type="button" className="link-btn" style={{ alignSelf: 'flex-start' }} onClick={() => setCancelar(true)}>Cancelar assinatura</button>
      )}
      <Confirmar
        aberto={cancelar}
        titulo="Cancelar a assinatura?"
        texto="As próximas cobranças param. O plano continua até o fim do período já pago."
        acao="Cancelar assinatura"
        voltar="Voltar"
        perigo
        onFechar={() => setCancelar(false)}
        onConfirmar={() => {
          setCancelar(false);
          confirmarCancelar();
        }}
      />
    </section>
  );
}
