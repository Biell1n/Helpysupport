import { useCallback, useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Check, CreditCard, MessageCircle } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { chamar } from '@/lib/supabase';
import UsoExtra from '@/components/UsoExtra';
import { AssinarModal, MinhaAssinatura } from '@/components/Assinatura';
import { diasDeTeste, PLANS, planOf, reais, recursosDoPlano, PRECO_FUNCIONARIO_EXTRA } from '@/lib/plans';

const VENDAS = import.meta.env.VITE_CONTATO_VENDAS;

function Uso({ rotulo, usado, limite }) {
  const pct = limite ? Math.min(100, Math.round((usado / limite) * 100)) : 0;
  return (
    <div className="stack stack-sm">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="label">{rotulo}</span>
        <span className="num faint">{usado ?? '—'} {limite ? `de ${limite.toLocaleString('pt-BR')}` : '· sem limite'}</span>
      </div>
      <div className="meter" data-nivel={pct >= 85 ? 'alto' : undefined}><span style={{ width: `${pct}%` }} /></div>
    </div>
  );
}

export default function Plano() {
  const { uso } = useOutletContext();
  const { profile, reloadProfile } = useAuth();
  const atual = planOf(profile);
  const dias = diasDeTeste(profile);
  const [pagamentos, setPagamentos] = useState(null);
  const [assinar, setAssinar] = useState(null);

  const carregar = useCallback(async () => {
    try {
      setPagamentos(await chamar('pagamentos', { action: 'status' }));
    } catch {
      setPagamentos({ cobranca: false });
    }
  }, []);
  useEffect(() => {
    carregar();
  }, [carregar]);

  // voltou do pagamento: confere até o aviso do Asaas chegar e o plano mudar
  const esperando = pagamentos?.assinatura?.status === 'pendente';
  useEffect(() => {
    if (!esperando) return undefined;
    const t = setInterval(async () => {
      await carregar();
      reloadProfile?.();
    }, 8000);
    return () => clearInterval(t);
  }, [esperando, carregar, reloadProfile]);

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Plano e uso</h1>
          <p>
            Você está no <b>{atual.nome}</b>
            {dias != null && (dias > 0 ? `, que termina em ${dias} ${dias === 1 ? 'dia' : 'dias'}` : ', que já terminou')}.
            As cotas renovam todo dia 1º.
          </p>
        </div>
      </header>

      <section className="card stack" style={{ marginBottom: 28 }}>
        <h2 className="card-title">Uso deste mês</h2>
        <div className="grid-2">
          <Uso rotulo="Atendimentos" usado={uso?.atendimentos} limite={atual.atendimentos} />
          <Uso rotulo="Mensagens de clientes" usado={uso?.mensagens} limite={atual.mensagens} />
          <Uso rotulo="Chamados abertos agora" usado={uso?.tickets_abertos} limite={atual.ticketsAbertos} />
          <Uso rotulo="Assistentes" usado={uso?.assistentes} limite={atual.assistentes} />
          <Uso rotulo="Tabelas de dados" usado={uso?.tabelas} limite={atual.tabelas} />
          {atual.builderIA && <Uso rotulo="Mensagens no criador com IA" usado={uso?.builder_msgs} limite={atual.builderMsgs} />}
        </div>
        {profile?.creditos_extra > 0 && <p className="muted">Você tem <b>{profile.creditos_extra}</b> atendimentos extras de pacote.</p>}
        <p className="faint" style={{ fontSize: 13 }}>
          Quando os atendimentos ou as mensagens do mês acabam, o atendente não some: as conversas viram recados e chamados para a equipe até a cota renovar, a não ser que o uso extra esteja ligado.
        </p>
      </section>

      <MinhaAssinatura dados={pagamentos} onMudou={carregar} />

      <UsoExtra plano={atual} />

      <div className="lp-planos">
        {[PLANS.essencial, PLANS.profissional, PLANS.business].map((p) => {
          const ehAtual = p.id === atual.id;
          return (
            <article key={p.id} className={`lp-plano${p.destaque ? ' lp-plano-destaque' : ''}`}>
              {ehAtual && <span className="badge badge-plain lp-plano-tag">Seu plano</span>}
              <h3>{p.nome}</h3>
              <p className="lp-preco">
                {p.precoCheio && <s className="lp-preco-cheio">{reais(p.precoCheio)}</s>}
                {reais(p.preco)}<small>/mês</small>
              </p>
              <p className="lp-preco-nota">Preço de lançamento: fica assim para quem assinar agora.</p>
              <ul>
                {recursosDoPlano(p).map((r) => <li key={r}><Check /> {r}</li>)}
              </ul>
              {ehAtual ? (
                <button type="button" className="btn btn-ghost btn-block" disabled>Plano atual</button>
              ) : pagamentos?.cobranca ? (
                <button type="button" className={`btn btn-block ${p.destaque ? 'btn-senha' : 'btn-ghost'}`} onClick={() => setAssinar(p.id)}>
                  <CreditCard /> Assinar {p.nome}
                </button>
              ) : VENDAS ? (
                <a className={`btn btn-block ${p.destaque ? 'btn-senha' : 'btn-ghost'}`} href={`${VENDAS}${VENDAS.includes('wa.me') ? `?text=${encodeURIComponent(`Quero assinar o plano ${p.nome} do Helpy`)}` : ''}`} target="_blank" rel="noreferrer">
                  <MessageCircle /> Assinar {p.nome}
                </a>
              ) : (
                <button type="button" className="btn btn-ghost btn-block" disabled title="Configure VITE_CONTATO_VENDAS">Assinatura em breve</button>
              )}
            </article>
          );
        })}
      </div>
      <section className="card lp-sob-medida" style={{ marginTop: 20 }}>
        <div>
          <h3>Plano personalizado</h3>
          <p className="muted">Precisa de mais (ou menos) atendimentos, assistentes ou funcionários? Montamos um plano do tamanho da sua empresa.</p>
        </div>
        {VENDAS && (
          <a className="btn btn-ghost" href={`${VENDAS}${VENDAS.startsWith('mailto:') ? `?subject=${encodeURIComponent('Plano personalizado do Helpy')}` : VENDAS.includes('wa.me') ? `?text=${encodeURIComponent('Quero um plano personalizado do Helpy')}` : ''}`} target="_blank" rel="noreferrer">
            <MessageCircle /> Falar com a gente
          </a>
        )}
      </section>
      <p className="faint" style={{ fontSize: 13, marginTop: 16 }}>
        Funcionário além do plano: {reais(PRECO_FUNCIONARIO_EXTRA)}/mês por pessoa.
      </p>
      {assinar && <AssinarModal plano={assinar} profile={profile} ambiente={pagamentos?.ambiente} onFechar={() => setAssinar(null)} />}
    </div>
  );
}
