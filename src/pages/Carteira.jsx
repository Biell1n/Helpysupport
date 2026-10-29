import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDownLeft, ArrowUpRight, ExternalLink, FileCheck2, RefreshCw, ShieldCheck, Wallet } from 'lucide-react';
import { chamar, supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/Toasts';
import { Confirmar, Modal } from '@/components/Modal';
import Counter from '@/components/Counter';
import HoldButton from '@/components/HoldButton';
import { planOf, reais } from '@/lib/plans';
import { usePrecos } from '@/lib/precos';
import { quando } from '@/lib/format';

const SITUACAO = {
  documentos: ['Falta enviar os documentos', 'badge-waiting'],
  analise: ['Documentos em análise', 'badge-waiting'],
  aprovada: ['Carteira aprovada', 'badge-closed'],
  recusada: ['Cadastro recusado', 'badge-human'],
};
const SO_DIGITOS = (v) => v.replace(/\D/g, '');
const mascaraDoc = (v) => {
  const d = SO_DIGITOS(v).slice(0, 14);
  if (d.length <= 11) return d.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  return d.replace(/^(\d{2})(\d)/, '$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1/$2').replace(/(\d{4})(\d)/, '$1-$2');
};
const BRL = { style: 'currency', currency: 'BRL' };
const dataBr = (d) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString('pt-BR') : '');

/** Carteira: o dinheiro das vendas do assistente, dentro do Helpy. */
export default function Carteira() {
  const avisar = useToast();
  const { profile } = useAuth();
  const taxa = usePrecos().vendas?.[planOf(profile).id];
  const [dados, setDados] = useState(undefined);
  const [sacando, setSacando] = useState(false);
  const [pausar, setPausar] = useState(false);
  // venda pelo chat, por assistente: liga aqui mesmo, sem passar pelo montador
  const [assistentes, setAssistentes] = useState([]);
  const algumVende = assistentes.some((a) => /^sim/i.test(a.vende ?? ''));
  const [mexendo, setMexendo] = useState(null);
  useEffect(() => {
    supabase
      .from('assistants')
      .select('id, name, vende:config->fields->venda_no_chat->>value, estoque:config->fields->venda_estoque->>value, frete:config->fields->frete_chat->>value')
      .order('created_at')
      .then(({ data }) => setAssistentes(data ?? []));
  }, []);
  const definirVenda = async (a, mudanca) => {
    const vender = mudanca.vender ?? /^sim/i.test(a.vende ?? '');
    const estoque = mudanca.estoque ?? !/^n[aã]o/i.test(a.estoque ?? '');
    setMexendo(a.id);
    try {
      const frete = typeof mudanca.frete === 'string' ? mudanca.frete : undefined;
      await chamar('assistant-builder-chat', { action: 'definir_venda', assistant_id: a.id, vender, estoque, ...(frete !== undefined ? { frete } : {}) });
      setAssistentes((l) =>
        l.map((x) => (x.id === a.id ? { ...x, vende: vender ? 'Sim' : 'Não', estoque: estoque ? 'Sim' : 'Não', ...(frete !== undefined ? { frete } : {}) } : x)),
      );
      avisar(frete !== undefined ? 'Regra de entrega salva' : vender ? `${a.name} vende pelo chat` : `${a.name} não fecha mais vendas`);
    } catch (e) {
      avisar('Não deu para salvar', { erro: true, texto: e.message });
    } finally {
      setMexendo(null);
    }
  };

  const carregar = useCallback(async () => {
    try {
      setDados(await chamar('pagamentos', { action: 'carteira' }));
    } catch (e) {
      setDados({ recebimento: null, erro: e.message });
    }
  }, []);
  useEffect(() => {
    carregar();
  }, [carregar]);

  const rec = dados?.recebimento;
  const carteira = rec?.modo === 'carteira';

  const pausarOuReligar = async () => {
    setPausar(false);
    try {
      await chamar('pagamentos', { action: rec.ativo ? 'loja_desconectar' : 'carteira_religar' });
      avisar(rec.ativo ? 'Vendas pausadas' : 'Vendas ligadas de novo');
      carregar();
    } catch (e) {
      avisar('Não deu', { erro: true, texto: e.message });
    }
  };

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Carteira</h1>
          <p>O dinheiro que o assistente vende no chat cai aqui. Você vê o saldo, o extrato e saca por Pix, sem sair do Helpy.</p>
        </div>
        {rec && <button type="button" className="btn btn-ghost btn-sm" onClick={carregar}><RefreshCw size={15} /> Atualizar</button>}
      </header>

      {dados === undefined && <div className="skeleton" style={{ height: 220 }} />}
      {dados?.erro && <div className="alert alert-erro" style={{ marginBottom: 16 }}><span>{dados.erro}</span></div>}

      {dados && !rec && <Ativar onPronto={carregar} />}

      {rec && (
        <div className="stack">
          {rec.ambiente === 'sandbox' && (
            <div className="alert"><span><b>Ambiente de teste:</b> o dinheiro aqui é de mentira. Nada é cobrado nem sacado de verdade.</span></div>
          )}

          {carteira && rec.situacao !== 'aprovada' && <Situacao dados={dados} />}
          {taxa > 0 && !profile?.cobranca_isenta && (
            <p className="faint" style={{ margin: 0, fontSize: 13.5 }}>
              Taxa do Helpy: {String(taxa).replace('.', ',')}% sobre cada venda paga pelo chat, somada no mês e cobrada no começo do mês
              seguinte, na mesma fatura do uso extra. Venda devolvida não paga taxa.
            </p>
          )}

          <section className="card kpi-faixa kpi-faixa-2">
            <div className="kpi carteira-saldo">
              <span className="eyebrow">Saldo disponível</span>
              <span className="kpi-valor">{dados.saldo == null ? '—' : <Counter value={Number(dados.saldo)} format={BRL} />}</span>
              {carteira ? (
                <button type="button" className="btn btn-primary btn-sm" disabled={!dados.saldo || rec.situacao !== 'aprovada'} onClick={() => setSacando(true)}
                  title={rec.situacao !== 'aprovada' ? 'O saque libera quando a carteira for aprovada' : undefined}>
                  Sacar por Pix
                </button>
              ) : (
                <a className="btn btn-ghost btn-sm" href={rec.ambiente === 'sandbox' ? 'https://sandbox.asaas.com' : 'https://www.asaas.com'} target="_blank" rel="noreferrer">
                  Sacar no Asaas <ExternalLink size={14} />
                </a>
              )}
            </div>
            <div className="kpi carteira-saldo">
              <span className="eyebrow">A receber</span>
              <span className="kpi-valor"><Counter value={Number(dados.a_receber ?? 0)} format={BRL} /></span>
              <span className="faint" style={{ fontSize: 13 }}>Vendas no cartão: o valor libera nos próximos dias.</span>
            </div>
          </section>

          <section className="card stack-sm">
            <div className="row" style={{ justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <h2 className="card-title" style={{ margin: 0 }}>{carteira ? 'Carteira Helpy' : 'Sua conta Asaas'}</h2>
                <p className="faint" style={{ margin: '2px 0 0' }}>{rec.conta_nome}</p>
              </div>
              <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                <span className={`badge ${rec.ativo && algumVende ? 'badge-closed' : 'badge-bot'}`}>{!rec.ativo ? 'Vendas pausadas' : algumVende ? 'Vendendo' : 'Pronta · venda desligada'}</span>
                <Link to="/painel/pedidos" className="btn btn-ghost btn-sm">Pedidos</Link>
                <button type="button" className="btn btn-quiet btn-sm" onClick={() => setPausar(true)}>{rec.ativo ? (carteira ? 'Pausar vendas' : 'Desligar') : 'Ligar vendas'}</button>
              </div>
            </div>
          </section>

          {rec.ativo && assistentes.length > 0 && (
            <section className="card">
              <h2 className="card-title">Vender pelo chat</h2>
              <p className="muted" style={{ margin: '4px 0 12px', fontSize: 14 }}>
                Ligado, o assistente confirma os itens e o total e manda o link de pagamento na conversa. Quando o pagamento cai, o pedido aparece em Pedidos já pago.
              </p>
              <ul className="venda-assistentes">
                {assistentes.map((a) => {
                  const vende = /^sim/i.test(a.vende ?? '');
                  const baixa = !/^n[aã]o/i.test(a.estoque ?? '');
                  return (
                    <li key={a.id}>
                      <b>{a.name}</b>
                      <label className="check-linha">
                        <input type="checkbox" checked={vende} disabled={mexendo === a.id} onChange={(e) => definirVenda(a, { vender: e.target.checked })} />
                        <span>Fechar a venda no chat</span>
                      </label>
                      <label className="check-linha" data-desligado={!vende || undefined}>
                        <input type="checkbox" checked={vende && baixa} disabled={!vende || mexendo === a.id} onChange={(e) => definirVenda(a, { estoque: e.target.checked })} />
                        <span>Baixar o estoque da tabela quando o pagamento cair</span>
                      </label>
                      {vende && <FreteDaVenda a={a} ocupado={mexendo === a.id} onSalvar={(frete) => definirVenda(a, { frete })} />}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          <section className="card">
            <h2 className="card-title">Extrato</h2>
            {(dados.extrato ?? []).length === 0 ? (
              <p className="muted" style={{ margin: 0 }}>Nada ainda. Quando o assistente vender, os pagamentos aparecem aqui.</p>
            ) : (
              <ul className="extrato">
                {dados.extrato.map((x) => (
                  <li key={x.id}>
                    <span className={`extrato-icone ${Number(x.valor) >= 0 ? 'entrada' : 'saida'}`}>
                      {Number(x.valor) >= 0 ? <ArrowDownLeft size={15} /> : <ArrowUpRight size={15} />}
                    </span>
                    <span className="extrato-desc">{x.descricao || (Number(x.valor) >= 0 ? 'Entrada' : 'Saída')}</span>
                    <span className="faint">{dataBr(x.data)}</span>
                    <b className={Number(x.valor) >= 0 ? 'entrada' : ''}>{Number(x.valor) >= 0 ? '+' : '−'} {reais(Math.abs(Number(x.valor)))}</b>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {carteira && (dados.saques ?? []).length > 0 && (
            <section className="card">
              <h2 className="card-title">Saques</h2>
              <ul className="extrato">
                {dados.saques.map((x) => (
                  <li key={x.id}>
                    <span className="extrato-icone saida"><ArrowUpRight size={15} /></span>
                    <span className="extrato-desc">Pix para {x.destino}</span>
                    <span className="faint">{quando(x.criado_em)} · {x.status === 'done' ? 'feito' : x.status === 'failed' ? 'falhou' : 'em andamento'}</span>
                    <b>{reais(Number(x.valor))}</b>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}

      {sacando && <Sacar dados={dados} onFechar={() => setSacando(false)} onPronto={() => { setSacando(false); carregar(); }} />}
      <Confirmar
        aberto={pausar}
        titulo={rec?.ativo ? (carteira ? 'Pausar as vendas?' : 'Desligar a conta Asaas?') : 'Ligar as vendas de novo?'}
        texto={rec?.ativo
          ? carteira
            ? 'O assistente para de mandar links de pagamento. O saldo e a carteira continuam seus.'
            : 'O assistente para de mandar links de pagamento. Sua conta no Asaas continua igual.'
          : 'O assistente volta a fechar vendas com link de pagamento.'}
        acao={rec?.ativo ? (carteira ? 'Pausar' : 'Desligar') : 'Ligar'}
        perigo={!!rec?.ativo}
        voltar="Voltar"
        onFechar={() => setPausar(false)}
        onConfirmar={pausarOuReligar}
      />
    </div>
  );
}

function Situacao({ dados }) {
  const [rotulo, classe] = SITUACAO[dados.recebimento.situacao] ?? ['Em preparação', 'badge-waiting'];
  const docs = (dados.documentos ?? []).filter((d) => d.link);
  return (
    <section className="card stack-sm carteira-situacao">
      <div className="row" style={{ gap: 10, alignItems: 'center' }}>
        <FileCheck2 size={20} />
        <h2 className="card-title" style={{ margin: 0 }}>Falta pouco para sacar</h2>
        <span className={`badge ${classe}`}>{rotulo}</span>
      </div>
      <p className="muted" style={{ margin: 0 }}>
        O Banco Central pede uma foto do documento e uma selfie de quem é dono da conta. Leva uns 2 minutos pelo celular.
        Você já pode vender enquanto isso: o saque libera quando a carteira for aprovada.
      </p>
      {docs.length > 0 ? (
        <div className="row row-wrap" style={{ gap: 8 }}>
          {docs.map((d, i) => (
            <a key={i} className="btn btn-primary btn-sm" href={d.link} target="_blank" rel="noreferrer">
              {d.titulo || 'Enviar documentos'} <ExternalLink size={14} />
            </a>
          ))}
        </div>
      ) : (
        dados.recebimento.situacao === 'analise' && <p className="faint" style={{ margin: 0 }}>Recebemos tudo. A análise costuma sair em até 1 dia útil.</p>
      )}
    </section>
  );
}

function Sacar({ dados, onFechar, onPronto }) {
  const avisar = useToast();
  const [valor, setValor] = useState('');
  const [indo, setIndo] = useState(false);
  const [erro, setErro] = useState('');
  const [tentativa, setTentativa] = useState(0);
  const numero = Number(valor.replace(/\./g, '').replace(',', '.'));

  // o saque só sai segurando o botão; Enter no campo não manda nada
  const ir = async () => {
    if (indo || !(numero >= 1)) return;
    setErro('');
    setIndo(true);
    try {
      const r = await chamar('pagamentos', { action: 'carteira_sacar', valor: numero });
      avisar('Saque pedido', { texto: `${reais(numero)} para a chave Pix ${r.destino}.` });
      onPronto();
    } catch (e2) {
      setErro(e2.message);
      setIndo(false);
      setTentativa((n) => n + 1); // o botão volta ao começo para tentar de novo
    }
  };

  return (
    <Modal aberto onFechar={onFechar} largura={440}>
      <form className="stack" onSubmit={(e) => e.preventDefault()}>
        <div>
          <h2 style={{ margin: 0 }}>Sacar por Pix</h2>
          <p className="faint" style={{ margin: '4px 0 0' }}>Disponível: {reais(Number(dados.saldo ?? 0))}</p>
        </div>
        <label className="field">
          <span className="label">Valor</span>
          <input className="input" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value.replace(/[^\d.,]/g, ''))} placeholder="0,00" autoFocus required />
        </label>
        <button type="button" className="link-btn" style={{ alignSelf: 'flex-start' }} onClick={() => setValor(Number(dados.saldo ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))}>Sacar tudo</button>
        <div className="alert">
          <ShieldCheck size={18} />
          <span>Por segurança, o dinheiro vai só para a chave Pix do <b>{dados.destino_saque}</b> da carteira. Cadastre essa chave no seu banco se ainda não tiver.</span>
        </div>
        {erro && <div className="alert alert-erro"><span>{erro}</span></div>}
        <div className="modal-foot">
          <button type="button" className="btn btn-ghost" onClick={onFechar}>Voltar</button>
          <HoldButton key={tentativa} size="md" radius={6} fillColor="#138a5e" disabled={indo || !(numero >= 1)} doneLabel="Pedindo o saque…" resetAfter={0} onHold={ir}>
            {numero >= 1 ? `Segure para sacar ${reais(numero)}` : 'Digite o valor'}
          </HoldButton>
        </div>
      </form>
    </Modal>
  );
}

/** Primeira vez: abrir a Carteira Helpy (ou usar uma conta Asaas que a empresa já tem). */
function Ativar({ onPronto }) {
  const { profile, user } = useAuth();
  const avisar = useToast();
  const precos = usePrecos();
  // a Carteira Helpy (subconta) só abre quando o Helpy tiver CNPJ no Asaas; até lá, só conta própria
  const [escolhido, setModo] = useState('carteira');
  const modo = precos.carteira ? escolhido : 'chave';
  const taxa = precos.vendas?.[planOf(profile).id];
  const [f, setF] = useState({
    nome: profile?.company_name || profile?.full_name || '', documento: '', email: user?.email ?? '', celular: '',
    nascimento: '', tipo_empresa: 'MEI', cep: '', endereco: '', numero: '', complemento: '', bairro: '', renda: '',
  });
  const [chave, setChave] = useState('');
  const [ambiente, setAmbiente] = useState('producao');
  const [indo, setIndo] = useState(false);
  const [erro, setErro] = useState('');
  const muda = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const pj = SO_DIGITOS(f.documento).length > 11;

  // CEP preenche endereço e bairro
  const buscarCep = async () => {
    const cep = SO_DIGITOS(f.cep);
    if (cep.length !== 8) return;
    try {
      const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`).then((x) => x.json());
      if (!r.erro) setF((x) => ({ ...x, endereco: x.endereco || r.logradouro || '', bairro: x.bairro || r.bairro || '' }));
    } catch { /* sem CEP automático, a pessoa digita */ }
  };

  const ativar = async (e) => {
    e.preventDefault();
    setErro('');
    setIndo(true);
    try {
      if (modo === 'carteira') {
        await chamar('pagamentos', { action: 'carteira_ativar', ...f, documento: SO_DIGITOS(f.documento) });
        avisar('Carteira criada', { texto: 'Agora envie os documentos para liberar o saque.' });
      } else {
        await chamar('pagamentos', { action: 'loja_conectar', chave, ambiente });
        avisar('Conta Asaas ligada');
      }
      onPronto();
    } catch (e2) {
      setErro(e2.message);
      setIndo(false);
    }
  };

  return (
    <section className="card stack carteira-ativar">
      <div className="row" style={{ gap: 12 }}>
        <span className="canal-icone canal-pagamento"><Wallet size={22} /></span>
        <div>
          <h2 className="card-title" style={{ margin: 0 }}>Ative a sua carteira</h2>
          <p className="muted" style={{ margin: '2px 0 0' }}>
            Com ela, o assistente fecha a venda no chat com Pix, cartão ou boleto e o dinheiro cai aqui. Sem mensalidade.
          </p>
        </div>
      </div>

      {/* quanto custa vender: sem letra miúda */}
      <div className="carteira-custos">
        <b>Quanto custa vender pelo chat</b>
        <ul>
          <li><span>Asaas</span> a taxa dele em cada pagamento (no Pix, cerca de R$ 1), descontada antes do dinheiro entrar. Veja a tabela no site do Asaas.</li>
          {taxa > 0 && <li><span>Helpy</span> {String(taxa).replace('.', ',')}% sobre cada venda paga, somados no mês e cobrados no começo do mês seguinte.</li>}
          <li><span>Devolução</span> o cliente recebe o valor cheio, que sai do seu saldo no Asaas. A taxa do Asaas daquele pagamento não volta; a do Helpy dessa venda não é cobrada.</li>
        </ul>
      </div>

      {precos.carteira ? (
        <div className="abas-mini" role="tablist">
          <button type="button" role="tab" aria-selected={modo === 'carteira'} className={`btn btn-sm ${modo === 'carteira' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setModo('carteira')}>Abrir a Carteira Helpy</button>
          <button type="button" role="tab" aria-selected={modo === 'chave'} className={`btn btn-sm ${modo === 'chave' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setModo('chave')}>Já tenho conta no Asaas</button>
        </div>
      ) : (
        <p className="faint" style={{ margin: 0, fontSize: 14 }}>
          Ligue a conta do Asaas da sua empresa (é grátis abrir uma em asaas.com). O dinheiro das vendas cai direto nela.
        </p>
      )}

      <form className="stack" onSubmit={ativar}>
        {modo === 'carteira' ? (
          <>
            <div className="grid-2">
              <label className="field">
                <span className="label">CPF ou CNPJ de quem recebe</span>
                <input className="input" inputMode="numeric" value={f.documento} onChange={(e) => setF((x) => ({ ...x, documento: mascaraDoc(e.target.value) }))} placeholder="000.000.000-00" required />
              </label>
              <label className="field">
                <span className="label">{pj ? 'Razão social' : 'Nome completo'}</span>
                <input className="input" value={f.nome} onChange={muda('nome')} required maxLength={100} />
              </label>
              {pj ? (
                <label className="field">
                  <span className="label">Tipo de empresa</span>
                  <select className="input" value={f.tipo_empresa} onChange={muda('tipo_empresa')}>
                    <option value="MEI">MEI</option>
                    <option value="LIMITED">Limitada (LTDA)</option>
                    <option value="INDIVIDUAL">Individual (EI)</option>
                    <option value="ASSOCIATION">Associação</option>
                  </select>
                </label>
              ) : (
                <label className="field">
                  <span className="label">Data de nascimento</span>
                  <input className="input" type="date" value={f.nascimento} onChange={muda('nascimento')} required />
                </label>
              )}
              <label className="field">
                <span className="label">Faturamento por mês (aprox.)</span>
                <input className="input" inputMode="decimal" value={f.renda} onChange={muda('renda')} placeholder="5.000" required />
              </label>
              <label className="field">
                <span className="label">E-mail</span>
                <input className="input" type="email" value={f.email} onChange={muda('email')} required />
                <span className="hint">Não pode ser um e-mail que já tenha conta no Asaas.</span>
              </label>
              <label className="field">
                <span className="label">Celular</span>
                <input className="input" inputMode="tel" value={f.celular} onChange={muda('celular')} placeholder="(11) 91234-5678" required />
              </label>
              <label className="field">
                <span className="label">CEP</span>
                <input className="input" inputMode="numeric" value={f.cep} onChange={muda('cep')} onBlur={buscarCep} placeholder="00000-000" required />
              </label>
              <label className="field">
                <span className="label">Endereço</span>
                <input className="input" value={f.endereco} onChange={muda('endereco')} required />
              </label>
              <label className="field">
                <span className="label">Número</span>
                <input className="input" value={f.numero} onChange={muda('numero')} required maxLength={10} />
              </label>
              <label className="field">
                <span className="label">Complemento</span>
                <input className="input" value={f.complemento} onChange={muda('complemento')} />
              </label>
              <label className="field">
                <span className="label">Bairro</span>
                <input className="input" value={f.bairro} onChange={muda('bairro')} required />
              </label>
            </div>
            <p className="faint" style={{ margin: 0, fontSize: 13 }}>
              A conta é aberta no seu nome no Asaas, instituição de pagamento autorizada pelo Banco Central, que guarda o dinheiro. O Helpy mostra tudo aqui e nunca saca para outra pessoa: o saque vai só para a chave Pix do seu CPF ou CNPJ.
            </p>
          </>
        ) : (
          <>
            <ol className="passos" style={{ margin: 0, paddingLeft: 20 }}>
              <li>No Asaas, abra <b>Integrações → Chave de API</b>, gere a chave (sem permissão de saque) e cole aqui.</li>
              <li>O saldo aparece aqui; o saque continua pelo site do Asaas.</li>
            </ol>
            <div className="grid-2">
              <label className="field">
                <span className="label">Chave de API do Asaas</span>
                <input
                  className="input" type="password" value={chave} placeholder="$aact_…" autoComplete="off" required
                  onChange={(e) => {
                    const v = e.target.value;
                    setChave(v);
                    // a própria chave diz de que ambiente ela é
                    if (/^\$?aact_prod_/i.test(v.trim())) setAmbiente('producao');
                    else if (/^\$?aact_hmlg_/i.test(v.trim())) setAmbiente('sandbox');
                  }}
                />
              </label>
              <label className="field">
                <span className="label">Ambiente</span>
                <select className="input" value={ambiente} onChange={(e) => setAmbiente(e.target.value)}>
                  <option value="producao">Produção (dinheiro de verdade)</option>
                  <option value="sandbox">Teste (sandbox)</option>
                </select>
              </label>
            </div>
          </>
        )}
        {erro && <div className="alert alert-erro"><span>{erro}</span></div>}
        <button type="submit" className="btn btn-primary" style={{ justifySelf: 'start', alignSelf: 'flex-start' }} disabled={indo}>
          {indo ? 'Abrindo…' : modo === 'carteira' ? 'Abrir a carteira' : 'Ligar a conta'}
        </button>
      </form>
    </section>
  );
}

const MODELOS_FRETE = ['R$ 12', 'Grátis acima de R$ 100, senão R$ 12', 'R$ 12 ou retirada na loja (Rua …, nº …, seg a sex 9h–18h)', 'Só retirada na loja (Rua …, nº …, seg a sex 9h–18h)'];

/**
 * Como a venda pelo chat resolve a entrega. Sem regra, o assistente não fecha
 * pedido com entrega (o cliente não paga sem saber o frete).
 */
function FreteDaVenda({ a, ocupado, onSalvar }) {
  const [texto, setTexto] = useState(a.frete ?? '');
  useEffect(() => setTexto(a.frete ?? ''), [a.frete]);
  const mudou = texto.trim() !== (a.frete ?? '').trim();
  return (
    <div className="frete-venda">
      <label className="field" style={{ margin: 0 }}>
        <span className="label">Entrega e frete</span>
        <input className="input" value={texto} maxLength={200} placeholder="Ex.: R$ 12 · ou só retirada no local" onChange={(e) => setTexto(e.target.value)} />
        <span className="hint">
          {texto.trim()
            ? 'O assistente aplica essa regra no link. Se aceitar retirada, escreva o endereço e o horário: o cliente fica sabendo onde buscar.'
            : 'Sem regra, o assistente não fecha pedido com entrega: o cliente não paga sem saber o frete.'}
        </span>
      </label>
      <div className="row row-wrap" style={{ gap: 6 }}>
        {MODELOS_FRETE.map((m) => (
          <button key={m} type="button" className="chip" aria-pressed={texto === m} onClick={() => setTexto(m)}>{m}</button>
        ))}
        {mudou && <button type="button" className="btn btn-primary btn-sm" disabled={ocupado} onClick={() => onSalvar(texto.trim())}>Salvar</button>}
      </div>
    </div>
  );
}
