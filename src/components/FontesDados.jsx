import { useRef, useState } from 'react';
import { ArrowLeft, Check, FileSpreadsheet, Link2, Loader2, PlugZap, RefreshCw, Table2, Upload } from 'lucide-react';
import { chamar, supabase } from '@/lib/supabase';
import { quando } from '@/lib/format';
import { colunasDe, lerArquivo, LIMITE_LINHAS, registrosDe } from '@/lib/planilha';
import { Modal } from '@/components/Modal';

const FONTES = [
  { id: 'manual', icone: Table2, titulo: 'Começar do zero', texto: 'Uma planilha em branco para digitar ou colar aqui no Helpy.' },
  { id: 'arquivo', icone: FileSpreadsheet, titulo: 'Importar Excel ou CSV', texto: 'Envie um .xlsx ou .csv. As colunas vêm do cabeçalho.' },
  { id: 'url', icone: Link2, titulo: 'Ligar a uma planilha online', texto: 'Google Planilhas ou link de CSV. Mudou lá, o Helpy atualiza.' },
  { id: 'api', icone: PlugZap, titulo: 'Conectar ao seu sistema', texto: 'ERP (TOTVS Protheus, SAP) ou banco de dados por uma API.' },
];

async function inserirEmLotes(tabelaId, registros) {
  for (let i = 0; i < registros.length; i += 500) {
    const { error } = await supabase
      .from('tabela_linhas')
      .insert(registros.slice(i, i + 500).map((dados) => ({ tabela_id: tabelaId, dados })));
    if (error) throw error;
  }
}

async function criarTabelaBase({ userId, nome, assistentes, extra = {} }) {
  const { data, error } = await supabase.from('tabelas').insert({ owner_id: userId, nome, ...extra }).select().single();
  if (error) throw error;
  // nasce ligada a todos os assistentes: é o que quase todo mundo quer
  if (assistentes.length) {
    await supabase.from('assistente_tabelas').insert(assistentes.map((a) => ({ assistant_id: a.id, tabela_id: data.id })));
  }
  return data;
}

function Previa({ cabecalho, linhas, total }) {
  return (
    <div className="fonte-previa">
      <div className="sheet-wrap" style={{ maxHeight: 220 }}>
        <table className="sheet">
          <thead>
            <tr>{cabecalho.map((c, i) => <th key={i}><span className="sheet-ro fonte-previa-th">{c}</span></th>)}</tr>
          </thead>
          <tbody>
            {linhas.slice(0, 5).map((l, i) => (
              <tr key={i}>{cabecalho.map((_, j) => <td key={j}><span className="sheet-cell sheet-ro">{l[j] ?? ''}</span></td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="hint" style={{ marginTop: 8 }}>
        {total} {total === 1 ? 'linha' : 'linhas'} encontradas{total > 5 ? ' · mostrando as 5 primeiras' : ''}
        {total > LIMITE_LINHAS ? ` · só as ${LIMITE_LINHAS} primeiras entram` : ''}.
      </p>
    </div>
  );
}

// ------------------------------------------------------------
// Arquivo (.xlsx / .csv)
// ------------------------------------------------------------
function SeletorArquivo({ onLido }) {
  const input = useRef(null);
  const [lendo, setLendo] = useState(false);
  const [erro, setErro] = useState('');
  const [arrastando, setArrastando] = useState(false);

  const ler = async (arquivo) => {
    if (!arquivo) return;
    setErro('');
    setLendo(true);
    try {
      if (arquivo.size > 15 * 1024 * 1024) throw new Error('O arquivo passa de 15 MB.');
      const abas = await lerArquivo(arquivo);
      if (!abas.length) throw new Error('Não achamos nenhuma linha nesse arquivo.');
      onLido({ nomeArquivo: arquivo.name.replace(/\.[^.]+$/, ''), abas });
    } catch (e) {
      setErro(e.message || 'Não deu para ler o arquivo.');
    } finally {
      setLendo(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className="fonte-soltar"
        data-arrastando={arrastando || undefined}
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setArrastando(true);
        }}
        onDragLeave={() => setArrastando(false)}
        onDrop={(e) => {
          e.preventDefault();
          setArrastando(false);
          ler(e.dataTransfer.files?.[0]);
        }}
      >
        {lendo ? <Loader2 className="spin" /> : <Upload />}
        <b>{lendo ? 'Lendo a planilha…' : 'Escolha ou arraste o arquivo'}</b>
        <span>.xlsx do Excel ou .csv · a primeira linha deve ter os nomes das colunas</span>
      </button>
      <input
        ref={input}
        type="file"
        accept=".xlsx,.csv,.txt,.tsv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
        hidden
        onChange={(e) => {
          ler(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      {erro && <div className="alert alert-erro" style={{ marginTop: 12 }}>{erro}</div>}
    </>
  );
}

function EscolherAba({ abas, aba, setAba }) {
  if (abas.length < 2) return null;
  return (
    <label className="field">
      <span className="label">Aba da planilha</span>
      <select className="select" value={aba} onChange={(e) => setAba(Number(e.target.value))}>
        {abas.map((a, i) => <option key={i} value={i}>{a.nome} ({a.linhas.length - 1} linhas)</option>)}
      </select>
    </label>
  );
}

// ------------------------------------------------------------
// Nova tabela: escolha da fonte e cada caminho
// ------------------------------------------------------------
export function NovaTabela({ aberto, onFechar, onCriada, assistentes, userId }) {
  const [fonte, setFonte] = useState(null);
  const [nome, setNome] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  // arquivo
  const [lido, setLido] = useState(null);
  const [aba, setAba] = useState(0);

  // link
  const [url, setUrl] = useState('');
  const [previa, setPrevia] = useState(null);

  // api
  const [api, setApi] = useState({ url: '', header_nome: 'Authorization', header_valor: '', param_busca: '', caminho: '' });
  const [teste, setTeste] = useState(null);
  const [campos, setCampos] = useState([]);
  const [testando, setTestando] = useState(false);

  const limpar = () => {
    setFonte(null);
    setNome('');
    setErro('');
    setLido(null);
    setAba(0);
    setUrl('');
    setPrevia(null);
    setApi({ url: '', header_nome: 'Authorization', header_valor: '', param_busca: '', caminho: '' });
    setTeste(null);
    setCampos([]);
  };

  const fechar = () => {
    limpar();
    onFechar();
  };

  const concluir = async (fn) => {
    setErro('');
    setSalvando(true);
    try {
      const id = await fn();
      limpar();
      onCriada(id);
    } catch (e) {
      setErro(e.message || 'Algo deu errado.');
    } finally {
      setSalvando(false);
    }
  };

  const criarManual = () =>
    concluir(async () => {
      const t = await criarTabelaBase({ userId, nome: nome.trim(), assistentes });
      await supabase.from('tabela_colunas').insert([
        { tabela_id: t.id, chave: 'nome', rotulo: 'Nome', tipo: 'texto', ordem: 0, obrigatoria: true, identifica: true, chave_primaria: true },
        { tabela_id: t.id, chave: 'preco', rotulo: 'Preço', tipo: 'moeda', ordem: 1 },
      ]);
      return t.id;
    });

  const linhasAba = lido?.abas[aba]?.linhas ?? [];
  const criarDoArquivo = () =>
    concluir(async () => {
      const [cabecalho, ...resto] = linhasAba;
      const colunas = colunasDe(cabecalho, resto);
      const t = await criarTabelaBase({ userId, nome: nome.trim(), assistentes });
      const { error } = await supabase
        .from('tabela_colunas')
        .insert(colunas.map((c, i) => ({ ...c, tabela_id: t.id, identifica: i === 0 })));
      if (error) throw error;
      await inserirEmLotes(t.id, registrosDe(colunas, resto));
      return t.id;
    });

  const verPrevia = async () => {
    setErro('');
    setPrevia(null);
    setSalvando(true);
    try {
      setPrevia(await chamar('dados-e-relatorios', { action: 'previa_url', url }));
    } catch (e) {
      setErro(e.message);
    } finally {
      setSalvando(false);
    }
  };

  const criarDoLink = () =>
    concluir(async () => {
      const t = await criarTabelaBase({ userId, nome: nome.trim(), assistentes, extra: { fonte: 'url', fonte_url: url.trim() } });
      const colunas = colunasDe(previa.cabecalho, previa.linhas);
      await supabase.from('tabela_colunas').insert(colunas.map((c, i) => ({ ...c, tabela_id: t.id, identifica: i === 0 })));
      await chamar('dados-e-relatorios', { action: 'sincronizar_url', tabela_id: t.id });
      return t.id;
    });

  const testarApi = async () => {
    setErro('');
    setTeste(null);
    setTestando(true);
    try {
      const r = await chamar('dados-e-relatorios', { action: 'testar_api', config: api });
      setTeste(r);
      setCampos(r.campos.slice(0, 12));
    } catch (e) {
      setErro(e.message);
    } finally {
      setTestando(false);
    }
  };

  const criarDaApi = () =>
    concluir(async () => {
      const t = await criarTabelaBase({ userId, nome: nome.trim(), assistentes, extra: { fonte: 'api', api_config: api } });
      // a chave guarda o nome do campo como vem da API; o rótulo é o que o assistente lê
      if (campos.length) {
        const { error } = await supabase
          .from('tabela_colunas')
          .insert(campos.map((c, i) => ({ tabela_id: t.id, chave: c.slice(0, 120), rotulo: c.slice(0, 80), tipo: 'texto', ordem: i, identifica: i === 0 })));
        if (error) throw error;
      }
      return t.id;
    });

  const nomeCampo = (
    <label className="field">
      <span className="label">Nome da tabela</span>
      <input className="input" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Produtos, Cardápio, Estoque" />
    </label>
  );

  return (
    <Modal aberto={aberto} onFechar={fechar} largura={fonte ? 720 : 640}>
      {!fonte ? (
        <>
          <h2>Nova tabela</h2>
          <p className="muted" style={{ marginBottom: 16 }}>De onde vêm os dados que o assistente vai consultar?</p>
          <div className="fonte-opcoes">
            {FONTES.map(({ id, icone: Icone, titulo, texto }) => (
              <button key={id} type="button" className="fonte-opcao" onClick={() => setFonte(id)}>
                <Icone />
                <b>{titulo}</b>
                <span>{texto}</span>
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <button type="button" className="btn btn-quiet btn-sm" style={{ marginLeft: -10, marginBottom: 6 }} onClick={limpar}>
            <ArrowLeft size={15} /> Outras fontes
          </button>

          {fonte === 'manual' && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (nome.trim()) criarManual();
              }}
            >
              <h2>Começar do zero</h2>
              <p className="muted" style={{ marginBottom: 16 }}>Ela nasce com as colunas Nome e Preço. Você muda depois.</p>
              {nomeCampo}
              {erro && <div className="alert alert-erro">{erro}</div>}
              <div className="modal-foot">
                <button className="btn btn-primary" disabled={!nome.trim() || salvando}>Criar tabela</button>
              </div>
            </form>
          )}

          {fonte === 'arquivo' && (
            <>
              <h2>Importar Excel ou CSV</h2>
              <p className="muted" style={{ marginBottom: 16 }}>O arquivo é lido aqui no seu navegador. Depois a tabela fica editável no Helpy.</p>
              {!lido ? (
                <SeletorArquivo
                  onLido={(r) => {
                    setLido(r);
                    setNome((n) => n || r.nomeArquivo);
                  }}
                />
              ) : (
                <div className="stack">
                  <EscolherAba abas={lido.abas} aba={aba} setAba={setAba} />
                  {linhasAba.length > 0 && <Previa cabecalho={linhasAba[0]} linhas={linhasAba.slice(1)} total={linhasAba.length - 1} />}
                  {nomeCampo}
                </div>
              )}
              {erro && <div className="alert alert-erro">{erro}</div>}
              {lido && (
                <div className="modal-foot">
                  <button type="button" className="btn btn-ghost" onClick={() => setLido(null)}>Outro arquivo</button>
                  <button type="button" className="btn btn-primary" disabled={!nome.trim() || linhasAba.length < 1 || salvando} onClick={criarDoArquivo}>
                    {salvando ? <Loader2 className="spin" /> : <Check />} Importar {Math.max(0, Math.min(LIMITE_LINHAS, linhasAba.length - 1))} linhas
                  </button>
                </div>
              )}
            </>
          )}

          {fonte === 'url' && (
            <>
              <h2>Ligar a uma planilha online</h2>
              <p className="muted" style={{ marginBottom: 16 }}>
                O Helpy copia a planilha e confere de novo a cada 6 horas (ou quando você clicar em atualizar). Você continua editando onde já edita.
              </p>
              <div className="fonte-dica">
                <b>Google Planilhas:</b> Arquivo → Compartilhar → <i>Publicar na Web</i> → escolha a aba e o formato <i>CSV</i> → copie o link.
                Também serve o link de compartilhamento quando a planilha está aberta para “qualquer pessoa com o link”.
                <br />
                <b>Excel / OneDrive / outros:</b> qualquer link público que baixe um arquivo .csv.
              </div>
              <div className="row" style={{ alignItems: 'flex-end', marginTop: 14 }}>
                <label className="field" style={{ flex: 1, marginBottom: 0 }}>
                  <span className="label">Link da planilha</span>
                  <input className="input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://docs.google.com/spreadsheets/d/…" />
                </label>
                <button type="button" className="btn btn-ghost" disabled={!url.trim() || salvando} onClick={verPrevia}>
                  {salvando && !previa ? <Loader2 className="spin" /> : null} Ver prévia
                </button>
              </div>
              {previa && (
                <div className="stack" style={{ marginTop: 16 }}>
                  <Previa cabecalho={previa.cabecalho} linhas={previa.linhas} total={previa.total} />
                  {nomeCampo}
                </div>
              )}
              {erro && <div className="alert alert-erro" style={{ marginTop: 12 }}>{erro}</div>}
              {previa && (
                <div className="modal-foot">
                  <button type="button" className="btn btn-primary" disabled={!nome.trim() || salvando} onClick={criarDoLink}>
                    {salvando ? <Loader2 className="spin" /> : <Link2 />} Ligar planilha
                  </button>
                </div>
              )}
            </>
          )}

          {fonte === 'api' && (
            <>
              <h2>Conectar ao seu sistema</h2>
              <p className="muted" style={{ marginBottom: 14 }}>
                O assistente consulta ao vivo, na hora da pergunta: estoque e preço sempre atuais. Nada é copiado e o Helpy só lê.
              </p>
              <details className="fonte-dica">
                <summary>Como conectar TOTVS Protheus, SAP ou banco de dados</summary>
                <ul>
                  <li><b>TOTVS Protheus:</b> use o REST do Protheus (ex.: <code>https://seuservidor:porta/rest/api/…</code>). Cabeçalho <code>Authorization</code> com <code>Basic</code> + usuário:senha em base64.</li>
                  <li><b>SAP (S/4HANA, Business One):</b> serviço OData publicado pelo SAP Gateway ou Service Layer. A lista costuma vir em <code>d.results</code> ou <code>value</code>, o Helpy acha sozinho.</li>
                  <li><b>Banco SQL (MySQL, SQL Server, Postgres…):</b> o banco precisa de uma API na frente, por segurança: PostgREST, Hasura, Supabase ou um endpoint simples feito pela sua TI. Nunca exponha o banco direto.</li>
                  <li>O endereço precisa estar acessível pela internet (HTTPS). Rede interna e VPN não alcançam.</li>
                </ul>
              </details>
              <div className="fonte-grade" style={{ marginTop: 14 }}>
                <label className="field fonte-largo">
                  <span className="label">Endereço (URL) que devolve a lista em JSON</span>
                  <input className="input" value={api.url} onChange={(e) => setApi({ ...api, url: e.target.value })} placeholder="https://erp.suaempresa.com.br/rest/produtos" />
                </label>
                <label className="field">
                  <span className="label">Cabeçalho de acesso</span>
                  <input className="input" value={api.header_nome} onChange={(e) => setApi({ ...api, header_nome: e.target.value })} placeholder="Authorization" />
                </label>
                <label className="field">
                  <span className="label">Valor</span>
                  <input className="input" type="password" autoComplete="off" value={api.header_valor} onChange={(e) => setApi({ ...api, header_valor: e.target.value })} placeholder="Bearer … ou Basic …" />
                </label>
                <label className="field">
                  <span className="label">Parâmetro de busca <small className="faint">(opcional)</small></span>
                  <input className="input" value={api.param_busca} onChange={(e) => setApi({ ...api, param_busca: e.target.value })} placeholder="q, busca, search" />
                  <span className="hint">Se a API filtra pela URL. Sem isso o Helpy filtra o que vier.</span>
                </label>
                <label className="field">
                  <span className="label">Onde está a lista <small className="faint">(opcional)</small></span>
                  <input className="input" value={api.caminho} onChange={(e) => setApi({ ...api, caminho: e.target.value })} placeholder="value, d.results, data.items" />
                  <span className="hint">Em branco, o Helpy descobre.</span>
                </label>
              </div>
              <button type="button" className="btn btn-ghost" disabled={!api.url.trim() || testando} onClick={testarApi}>
                {testando ? <Loader2 className="spin" /> : <PlugZap />} Testar conexão
              </button>

              {teste && (
                <div className="stack" style={{ marginTop: 16 }}>
                  <div className="alert alert-ok"><Check /> Conectou. {teste.total} {teste.total === 1 ? 'registro veio' : 'registros vieram'} na resposta.</div>
                  {teste.campos.length > 0 && (
                    <>
                      <div>
                        <span className="label">Campos que o assistente pode ler</span>
                        <div className="row row-wrap" style={{ marginTop: 6, gap: 6 }}>
                          {teste.campos.map((c) => (
                            <button
                              key={c}
                              type="button"
                              className="chip"
                              aria-pressed={campos.includes(c)}
                              onClick={() => setCampos((p) => (p.includes(c) ? p.filter((x) => x !== c) : [...p, c]))}
                            >
                              {c}
                            </button>
                          ))}
                        </div>
                        <span className="hint">Desmarque o que não deve ir para o cliente (custo, margem, dados internos).</span>
                      </div>
                      <Previa
                        cabecalho={campos}
                        linhas={teste.linhas.map((l) => campos.map((c) => l[c] ?? ''))}
                        total={teste.total}
                      />
                    </>
                  )}
                  {nomeCampo}
                </div>
              )}
              {erro && <div className="alert alert-erro" style={{ marginTop: 12 }}>{erro}</div>}
              {teste && (
                <div className="modal-foot">
                  <button type="button" className="btn btn-primary" disabled={!nome.trim() || !campos.length || salvando} onClick={criarDaApi}>
                    {salvando ? <Loader2 className="spin" /> : <PlugZap />} Conectar
                  </button>
                </div>
              )}
            </>
          )}
        </>
      )}
    </Modal>
  );
}

// ------------------------------------------------------------
// Importar arquivo numa tabela que já existe
// ------------------------------------------------------------
export function ImportarParaTabela({ aberto, onFechar, tabela, colunas, onImportou }) {
  const [lido, setLido] = useState(null);
  const [aba, setAba] = useState(0);
  const [substituir, setSubstituir] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  const linhas = lido?.abas[aba]?.linhas ?? [];
  const cabecalho = linhas[0] ?? [];
  const porRotulo = new Map(colunas.map((c) => [c.rotulo.trim().toLowerCase(), c]));
  const novas = cabecalho.filter((h) => h && !porRotulo.has(String(h).trim().toLowerCase()));

  const fechar = () => {
    setLido(null);
    setAba(0);
    setErro('');
    setSubstituir(false);
    onFechar();
  };

  const importar = async () => {
    setErro('');
    setSalvando(true);
    try {
      const resto = linhas.slice(1);
      const sugeridas = colunasDe(cabecalho, resto);
      const usadas = new Set(colunas.map((c) => c.chave));
      let ordem = colunas.length;
      const criar = [];
      const mapa = cabecalho.map((h, i) => {
        const existente = porRotulo.get(String(h).trim().toLowerCase());
        if (existente) return existente;
        if (!String(h).trim()) return null;
        const s = { ...sugeridas[i] };
        while (usadas.has(s.chave)) s.chave = `${s.chave}_n`;
        usadas.add(s.chave);
        const nova = { ...s, ordem: ordem++, tabela_id: tabela.id };
        criar.push(nova);
        return nova;
      });
      if (criar.length) {
        const { error } = await supabase.from('tabela_colunas').insert(criar);
        if (error) throw error;
      }
      if (substituir) {
        const { error } = await supabase.from('tabela_linhas').delete().eq('tabela_id', tabela.id);
        if (error) throw error;
      }
      const registros = registrosDe(mapa, resto);
      await inserirEmLotes(tabela.id, registros);
      fechar();
      onImportou(registros.length);
    } catch (e) {
      setErro(e.message || 'Não deu para importar.');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Modal aberto={aberto} onFechar={fechar} largura={720}>
      <h2>Importar para {tabela?.nome}</h2>
      <p className="muted" style={{ marginBottom: 16 }}>
        As colunas são casadas pelo nome do cabeçalho. Colunas que ainda não existem aqui são criadas.
      </p>
      {!lido ? (
        <SeletorArquivo onLido={setLido} />
      ) : (
        <div className="stack">
          <EscolherAba abas={lido.abas} aba={aba} setAba={setAba} />
          <Previa cabecalho={cabecalho} linhas={linhas.slice(1)} total={linhas.length - 1} />
          {novas.length > 0 && <p className="hint">Colunas novas: {novas.join(', ')}.</p>}
          <label className="check">
            <input type="checkbox" checked={substituir} onChange={(e) => setSubstituir(e.target.checked)} />
            <span>Apagar as linhas atuais antes (substituir tudo)</span>
          </label>
        </div>
      )}
      {erro && <div className="alert alert-erro" style={{ marginTop: 12 }}>{erro}</div>}
      {lido && (
        <div className="modal-foot">
          <button type="button" className="btn btn-ghost" onClick={() => setLido(null)}>Outro arquivo</button>
          <button type="button" className="btn btn-primary" disabled={salvando || linhas.length < 2} onClick={importar}>
            {salvando ? <Loader2 className="spin" /> : <Check />} {substituir ? 'Substituir' : 'Adicionar'} {Math.min(LIMITE_LINHAS, linhas.length - 1)} linhas
          </button>
        </div>
      )}
    </Modal>
  );
}

// ------------------------------------------------------------
// Faixa de uma tabela ligada a link ou API
// ------------------------------------------------------------
export function FaixaFonte({ tabela, onAtualizou, avisar }) {
  const [ocupado, setOcupado] = useState(false);
  const [teste, setTeste] = useState(null);
  const [busca, setBusca] = useState('');

  if (tabela.fonte === 'url') {
    const atualizar = async () => {
      setOcupado(true);
      try {
        const r = await chamar('dados-e-relatorios', { action: 'sincronizar_url', tabela_id: tabela.id });
        avisar(`Planilha atualizada: ${r.linhas} linhas`);
        onAtualizou();
      } catch (e) {
        avisar('Não deu para atualizar', { erro: true, texto: e.message });
        onAtualizou();
      } finally {
        setOcupado(false);
      }
    };
    return (
      <div className="card card-tight fonte-faixa">
        <Link2 />
        <div style={{ flex: 1, minWidth: 0 }}>
          <b>Ligada a uma planilha online</b>
          <span className="fonte-faixa-url">{tabela.fonte_url}</span>
          <span className="faint" style={{ fontSize: 12.5 }}>
            {tabela.sincronizada_em ? `Atualizada ${quando(tabela.sincronizada_em)}` : 'Ainda não atualizada'} · edite na planilha original; aqui é só leitura.
          </span>
          {tabela.sincronizacao_erro && <span className="fonte-faixa-erro">Última tentativa falhou: {tabela.sincronizacao_erro}</span>}
        </div>
        <button type="button" className="btn btn-ghost btn-sm" disabled={ocupado} onClick={atualizar}>
          <RefreshCw size={15} className={ocupado ? 'spin' : ''} /> Atualizar agora
        </button>
      </div>
    );
  }

  const testar = async (e) => {
    e?.preventDefault();
    setOcupado(true);
    try {
      setTeste(await chamar('dados-e-relatorios', { action: 'testar_api', tabela_id: tabela.id, busca }));
    } catch (err) {
      setTeste({ erro: err.message });
    } finally {
      setOcupado(false);
    }
  };

  return (
    <div className="card card-tight stack stack-sm">
      <div className="fonte-faixa" style={{ padding: 0, border: 0 }}>
        <PlugZap />
        <div style={{ flex: 1, minWidth: 0 }}>
          <b>Conectada ao seu sistema</b>
          <span className="fonte-faixa-url">{tabela.api_config?.url}</span>
          <span className="faint" style={{ fontSize: 12.5 }}>O assistente consulta ao vivo a cada pergunta. Os campos lidos são as colunas abaixo.</span>
        </div>
      </div>
      <form className="row" onSubmit={testar}>
        <input className="input" style={{ maxWidth: 320 }} value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Teste uma busca, ex.: pomada" aria-label="Busca de teste" />
        <button className="btn btn-ghost btn-sm" disabled={ocupado}>
          {ocupado ? <Loader2 className="spin" /> : <PlugZap />} Consultar agora
        </button>
      </form>
      {teste?.erro && <div className="alert alert-erro">{teste.erro}</div>}
      {teste && !teste.erro && (
        <Previa
          cabecalho={teste.campos}
          linhas={teste.linhas.map((l) => teste.campos.map((c) => l[c] ?? ''))}
          total={teste.total}
        />
      )}
    </div>
  );
}
