import { useOutletContext } from 'react-router-dom';
import { Check, MessageCircle } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { diasDeTeste, PLANS, planOf, reais, PRECO_FUNCIONARIO_EXTRA } from '@/lib/plans';

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
  const { profile } = useAuth();
  const atual = planOf(profile);
  const dias = diasDeTeste(profile);

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Plano e uso</h1>
          <p>
            Você está no <b>{atual.nome}</b>
            {dias != null && (dias > 0 ? `, que termina em ${dias} ${dias === 1 ? 'dia' : 'dias'}` : ', que já terminou')}.
            A cota de atendimentos renova todo dia 1º.
          </p>
        </div>
      </header>

      <section className="card stack" style={{ marginBottom: 28 }}>
        <h2 className="card-title">Uso deste mês</h2>
        <div className="grid-2">
          <Uso rotulo="Atendimentos" usado={uso?.atendimentos} limite={atual.atendimentos} />
          <Uso rotulo="Chamados abertos agora" usado={uso?.tickets_abertos} limite={atual.ticketsAbertos} />
          <Uso rotulo="Assistentes" usado={uso?.assistentes} limite={atual.assistentes} />
          <Uso rotulo="Tabelas de dados" usado={uso?.tabelas} limite={atual.tabelas} />
          {atual.builderIA && <Uso rotulo="Mensagens de montagem com IA" usado={uso?.builder_msgs} limite={atual.builderMsgs} />}
        </div>
        {profile?.creditos_extra > 0 && <p className="muted">Você tem <b>{profile.creditos_extra}</b> atendimentos extras de pacote.</p>}
        <p className="faint" style={{ fontSize: 13 }}>
          Quando os atendimentos acabam, o atendente não some: ele anota recados e abre chamados para a equipe até a cota renovar ou você comprar um pacote.
        </p>
      </section>

      <div className="lp-planos">
        {[PLANS.essencial, PLANS.profissional, PLANS.business].map((p) => {
          const ehAtual = p.id === atual.id;
          return (
            <article key={p.id} className={`lp-plano${p.id === 'profissional' ? ' lp-plano-destaque' : ''}`}>
              {ehAtual && <span className="badge badge-plain lp-plano-tag">Seu plano</span>}
              <h3>{p.nome}</h3>
              <p className="lp-preco">{reais(p.preco)}<small>/mês</small></p>
              <ul>
                <li><Check /> {p.atendimentos.toLocaleString('pt-BR')} atendimentos por mês</li>
                <li><Check /> {p.assistentes} {p.assistentes > 1 ? 'assistentes' : 'assistente'}</li>
                <li><Check /> {p.builderIA ? 'Montagem conversando com a IA' : 'Montagem por formulário'}</li>
                <li><Check /> {p.ticketsAbertos ? `${p.ticketsAbertos} chamados abertos ao mesmo tempo` : 'Chamados sem limite'}</li>
                <li><Check /> {p.tabelas} tabelas de dados</li>
                <li><Check /> {p.funcionarios} {p.funcionarios > 1 ? 'funcionários' : 'funcionário'} na equipe</li>
              </ul>
              {ehAtual ? (
                <button type="button" className="btn btn-ghost btn-block" disabled>Plano atual</button>
              ) : VENDAS ? (
                <a className={`btn btn-block ${p.id === 'profissional' ? 'btn-senha' : 'btn-ghost'}`} href={`${VENDAS}${VENDAS.includes('wa.me') ? `?text=${encodeURIComponent(`Quero assinar o plano ${p.nome} do Helpy`)}` : ''}`} target="_blank" rel="noreferrer">
                  <MessageCircle /> Assinar {p.nome}
                </a>
              ) : (
                <button type="button" className="btn btn-ghost btn-block" disabled title="Configure VITE_CONTATO_VENDAS">Assinatura em breve</button>
              )}
            </article>
          );
        })}
      </div>
      <p className="faint" style={{ fontSize: 13, marginTop: 16 }}>
        Pacote extra: +100 atendimentos por R$ 29, válidos até o fim do mês. Funcionário além do plano: {reais(PRECO_FUNCIONARIO_EXTRA)}/mês por pessoa.
      </p>
    </div>
  );
}
