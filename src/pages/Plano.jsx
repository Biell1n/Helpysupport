import { useCallback, useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Check, CreditCard, MessageCircle } from 'lucide-react';
import Abas from '@/components/Abas';
import { useAuth } from '@/contexts/AuthContext';
import { chamar } from '@/lib/supabase';
import UsoExtra from '@/components/UsoExtra';
import { AssinarModal, MinhaAssinatura } from '@/components/Assinatura';
import { descontoAnual, diasDeTeste, PLANS, planOf, reais, USO_EXTRA_DISPONIVEL } from '@/lib/plans';
import { usePrecos } from '@/lib/precos';
import PrecoDoPlano from '@/components/PrecoDoPlano';

const VENDAS = import.meta.env.VITE_CONTATO_VENDAS;

const n = (x) => Number(x ?? 0).toLocaleString('pt-BR');
const nivel = (usado, limite) => {
  if (!limite) return undefined;
  const r = (usado ?? 0) / limite;
  return r >= 1 ? 'cheio' : r >= 0.85 ? 'alto' : undefined;
};

/** As duas cotas que mais importam: número grande e barra. */
function UsoGrande({ rotulo, usado, limite }) {
  const pct = limite ? Math.min(100, Math.round(((usado ?? 0) / limite) * 100)) : 0;
  return (
    <div className="uso-grande">
      <span className="label">{rotulo}</span>
      <p><b className="num">{usado == null ? '—' : n(usado)}</b> <span className="faint">de {n(limite)}</span></p>
      <div className="meter" data-nivel={nivel(usado, limite)}><span style={{ width: `${pct}%` }} /></div>
    </div>
  );
}

/** O resto das cotas, uma por linha. Só o que se gasta (cota) acende quando enche. */
function UsoMenor({ rotulo, usado, limite, cota = false }) {
  return (
    <li data-nivel={cota ? nivel(usado, limite) : undefined}>
      <span>{rotulo}</span>
      <b className="num">{usado ?? '—'} <span className="faint">{limite ? `de ${n(limite)}` : '· sem limite'}</span></b>
    </li>
  );
}

// mesma ordem em todos os planos, para comparar lendo a linha
const LINHAS = [
  ['Atendimentos por mês', (p) => n(p.atendimentos)],
  ['Mensagens por mês', (p) => n(p.mensagens)],
  ['Assistentes', (p) => p.assistentes],
  ['Pessoas na equipe', (p) => p.funcionarios],
  ['WhatsApp e Instagram', (p) => (p.canaisMeta ? `até ${p.canaisMeta} ${p.canaisMeta === 1 ? 'conta' : 'contas'}` : null)],
  ['Ligar ao seu sistema (estoque, ERP)', (p) => (p.integracoes ? 'Sim' : null)],
  ['Tabelas de dados', (p) => p.tabelas],
  ['Chamados abertos', (p) => p.ticketsAbertos ?? 'Sem limite'],
  ['Ajustes conversando com a IA', (p) => `${n(p.builderMsgs)} mensagens/mês`],
];

export default function Plano() {
  const { uso } = useOutletContext();
  const { profile, reloadProfile } = useAuth();
  const atual = planOf(profile);
  const dias = diasDeTeste(profile);
  const [pagamentos, setPagamentos] = useState(null);
  const [assinar, setAssinar] = useState(null);
  const [ciclo, setCiclo] = useState('anual');
  const [tudo, setTudo] = useState(false);
  const precos = usePrecos();

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
  // quem já assina vê os preços no ciclo que paga hoje (conta nova começa no anual)
  const cicloAtual = pagamentos?.assinatura?.ciclo;
  useEffect(() => {
    if (cicloAtual === 'mensal' || cicloAtual === 'anual') setCiclo(cicloAtual);
  }, [cicloAtual]);

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

  const teste = atual.id === 'trial';
  const acabou = (uso?.atendimentos ?? 0) >= atual.atendimentos ? 'atendimentos' : (uso?.mensagens ?? 0) >= atual.mensagens ? 'mensagens' : null;

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Plano e uso</h1>
          <p>Quanto você já usou neste mês e o que cada plano inclui. As cotas renovam todo dia 1º.</p>
        </div>
      </header>

      <section className="card plano-resumo">
        <div>
          <span className="eyebrow">Seu plano</span>
          <h2>{atual.nome}</h2>
          <p className="muted">
            {teste
              ? dias != null && (dias > 0 ? `Termina em ${dias} ${dias === 1 ? 'dia' : 'dias'}.` : 'Já terminou.')
              : pagamentos?.assinatura?.ciclo === 'anual'
                ? `Anual · ${reais(Number(pagamentos.assinatura.valor))}/ano.`
                : `${reais(Number(pagamentos?.assinatura?.valor ?? atual.precoMensal))}/mês.`}
          </p>
        </div>
        {teste && <a href="#planos" className="btn btn-senha">Escolher um plano</a>}
        {acabou && (
          <div className="alert plano-alerta">
            <span>
              <b>{acabou === 'atendimentos' ? 'Os atendimentos' : 'As mensagens'} deste mês acabaram.</b>{' '}
              {USO_EXTRA_DISPONIVEL && !teste && profile?.extra_ativo
                ? 'O uso extra está ligado: o assistente continua respondendo e o excedente entra na próxima fatura.'
                : `As conversas novas viram recado para a equipe até a cota renovar.${teste ? ' Assine um plano para continuar atendendo.' : ` Para continuar atendendo, ${USO_EXTRA_DISPONIVEL ? 'ligue o uso extra ou ' : ''}mude de plano.`}`}
            </span>
          </div>
        )}
      </section>

      <section className="card stack" style={{ marginBottom: 28 }}>
        <h2 className="card-title">Uso deste mês</h2>
        <div className="grid-2">
          <UsoGrande rotulo="Atendimentos" usado={uso?.atendimentos} limite={atual.atendimentos} />
          <UsoGrande rotulo="Mensagens de clientes" usado={uso?.mensagens} limite={atual.mensagens} />
        </div>
        <ul className="uso-menor">
          <UsoMenor rotulo="Chamados abertos agora" usado={uso?.tickets_abertos} limite={atual.ticketsAbertos} cota />
          <UsoMenor rotulo="Assistentes" usado={uso?.assistentes} limite={atual.assistentes} />
          <UsoMenor rotulo="Tabelas de dados" usado={uso?.tabelas} limite={atual.tabelas} />
          {atual.builderIA && <UsoMenor rotulo="Mensagens no criador com IA" usado={uso?.builder_msgs} limite={atual.builderMsgs} cota />}
        </ul>
        {profile?.creditos_extra > 0 && <p className="muted" style={{ margin: 0 }}>Você tem <b>{profile.creditos_extra}</b> atendimentos extras de pacote.</p>}
        <p className="faint" style={{ fontSize: 13, margin: 0 }}>Um atendimento é uma conversa de um cliente com o assistente, do começo ao fim.</p>
      </section>

      <MinhaAssinatura dados={pagamentos} onMudou={carregar} />

      {USO_EXTRA_DISPONIVEL && !teste && <UsoExtra plano={atual} />}

      <div className="plano-cab" id="planos">
        <h2>Planos</h2>
        <p className="muted">
          Todos têm link, QR code, site, Discord, agenda e relatórios. No anual você paga menos por mês.
        </p>
        <Abas
          className="plano-ciclo"
          rotulo="Forma de cobrança"
          ativa={ciclo}
          onMudar={setCiclo}
          abas={[
            { id: 'mensal', rotulo: 'Mensal' },
            { id: 'anual', rotulo: 'Anual', extra: <small className="plano-ciclo-desconto">−{Math.max(...[PLANS.essencial, PLANS.profissional, PLANS.business].map(descontoAnual))}%</small> },
          ]}
        />
        {precos.teste && (
          <div className="alert" style={{ marginTop: 12 }}>
            <span><b>Preços de teste ligados:</b> os planos custam o mínimo do Asaas (R$ 5 a R$ 7) e o Essencial tem cota pequena, para testar a cobrança de verdade.</span>
          </div>
        )}
      </div>
      <div className="lp-planos">
        {[PLANS.essencial, PLANS.profissional, PLANS.business].map((p) => {
          const ehAtual = p.id === atual.id;
          return (
            <article key={p.id} className={`lp-plano${p.destaque ? ' lp-plano-destaque' : ''}`}>
              <div className="lp-plano-topo">
                <h3>{p.nome}</h3>
                {ehAtual ? <span className="badge badge-plain">Seu plano</span> : p.destaque && <span className="lp-plano-tag">Mais escolhido</span>}
              </div>
              <PrecoDoPlano p={p} ciclo={ciclo} precos={precos} simples />
              <dl className="plano-linhas">
                {(tudo ? LINHAS : LINHAS.slice(0, 5)).map(([rotulo, valor]) => {
                  const v = valor(p);
                  return (
                    <div key={rotulo} data-falta={v == null || undefined}>
                      <dt>{rotulo}</dt>
                      <dd>{v ?? '—'}</dd>
                    </div>
                  );
                })}
              </dl>
              {ehAtual ? (
                <p className="plano-atual"><Check size={16} aria-hidden="true" /> Seu plano atual</p>
              ) : pagamentos?.cobranca ? (
                <button type="button" className={`btn btn-block ${p.destaque ? 'btn-senha' : 'btn-ghost'}`} onClick={() => setAssinar(p.id)}>
                  <CreditCard /> {!teste && p.precoMensal < atual.precoMensal ? `Mudar para o ${p.nome}` : `Assinar ${p.nome}`}
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
      <button type="button" className="link-btn" style={{ marginTop: 12 }} onClick={() => setTudo((v) => !v)} aria-expanded={tudo}>
        {tudo ? 'Mostrar só o principal' : `Comparar tudo (${LINHAS.length} itens)`}
      </button>
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
        Pessoa na equipe além do plano: {reais(precos.vaga)}/mês cada.{!teste || !USO_EXTRA_DISPONIVEL ? '' : ' Nos planos pagos dá para ligar o uso extra: o assistente continua respondendo depois da cota.'}
      </p>
      {assinar && <AssinarModal plano={assinar} ciclo={ciclo} precos={precos} profile={profile} ambiente={pagamentos?.ambiente} onFechar={() => setAssinar(null)} />}
    </div>
  );
}
