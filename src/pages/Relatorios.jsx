import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDownRight, ArrowUpRight, BarChart3, RefreshCw, Table as TableIcon } from 'lucide-react';
import { chamar, supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { quando } from '@/lib/format';
import '@/styles/relatorios.css';

const PERIODOS = [
  { dias: 7, rotulo: '7 dias' },
  { dias: 30, rotulo: '30 dias' },
  { dias: 90, rotulo: '90 dias' },
];

const SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
// segunda primeiro: é como a semana de trabalho é lida
const ORDEM_SEMANA = [1, 2, 3, 4, 5, 6, 0];

const fmt = (n, casas = 0) =>
  n == null || Number.isNaN(Number(n))
    ? '—'
    : Number(n).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
const pct = (parte, todo) => (todo ? Math.round((parte / todo) * 100) : null);
const diaCurto = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '');
const diaLongo = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });

function minutos(m) {
  if (m == null) return '—';
  if (m < 1) return '< 1 min';
  if (m < 60) return `${fmt(m)} min`;
  const h = m / 60;
  return h < 24 ? `${fmt(h, h < 10 ? 1 : 0)} h` : `${fmt(h / 24, 1)} dias`;
}

/** Largura real do contêiner, para o SVG desenhar em pixels de verdade. */
function useLargura() {
  const ref = useRef(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(el.clientWidth);
    const obs = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return [ref, w];
}

/** Dica flutuante que acompanha o mouse dentro do gráfico. */
function useDica() {
  const caixa = useRef(null);
  const [dica, setDica] = useState(null);
  const mostrar = useCallback((evento, conteudo) => {
    const r = caixa.current?.getBoundingClientRect();
    if (!r) return;
    const x = (evento.clientX ?? r.left) - r.left;
    const y = (evento.clientY ?? r.top) - r.top;
    setDica({ x, y, conteudo, lado: x > r.width * 0.62 ? 'esq' : 'dir' });
  }, []);
  const esconder = useCallback(() => setDica(null), []);
  const elemento = dica && (
    <div
      className="rel-dica"
      role="status"
      style={{ left: dica.x, top: dica.y }}
      data-lado={dica.lado}
    >
      {dica.conteudo}
    </div>
  );
  return { caixa, mostrar, esconder, elemento };
}

const passoBonito = (max) => {
  if (max <= 4) return 1;
  const bruto = max / 4;
  const mag = 10 ** Math.floor(Math.log10(bruto));
  const n = bruto / mag;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * mag;
};

/** Barra com as pontas de cima arredondadas e a base reta, presa ao eixo. */
function barra(x, y, w, h, r) {
  if (h <= 0) return '';
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}

// ------------------------------------------------------------
// Conversas por dia: barras empilhadas (só o assistente / com a equipe)
// ------------------------------------------------------------
function ConversasPorDia({ serie }) {
  const [ref, largura] = useLargura();
  const { caixa, mostrar, esconder, elemento } = useDica();
  const [ativo, setAtivo] = useState(null);
  const [tabela, setTabela] = useState(false);

  const altura = 220;
  const m = { t: 12, r: 8, b: 26, l: 34 };
  const iw = Math.max(0, largura - m.l - m.r);
  const ih = altura - m.t - m.b;
  const max = Math.max(1, ...serie.map((d) => d.conversas));
  const passo = passoBonito(max);
  const topo = Math.ceil(max / passo) * passo;
  const y = (v) => m.t + ih - (v / topo) * ih;
  const col = serie.length ? iw / serie.length : 0;
  const bw = Math.max(2, Math.min(28, col - 2));
  const ticks = [];
  for (let v = 0; v <= topo; v += passo) ticks.push(v);
  const cadaRotulo = Math.max(1, Math.ceil(serie.length / Math.max(1, Math.floor(iw / 72))));

  return (
    <div className="card rel-card">
      <div className="card-head">
        <div>
          <h2 className="card-title">Conversas por dia</h2>
          <div className="rel-legenda">
            <span><i style={{ background: 'var(--g-assistente)' }} /> Resolvidas pelo assistente</span>
            <span><i style={{ background: 'var(--g-equipe)' }} /> Viraram chamado</span>
          </div>
        </div>
        <button type="button" className="btn btn-quiet btn-sm" onClick={() => setTabela((v) => !v)} aria-pressed={tabela}>
          {tabela ? <BarChart3 size={15} /> : <TableIcon size={15} />} {tabela ? 'Gráfico' : 'Tabela'}
        </button>
      </div>

      {tabela ? (
        <div className="rel-tabela-rolagem">
          <table className="rel-tabela">
            <thead>
              <tr><th>Dia</th><th>Conversas</th><th>Pelo assistente</th><th>Viraram chamado</th></tr>
            </thead>
            <tbody>
              {[...serie].reverse().map((d) => (
                <tr key={d.dia}>
                  <td>{diaCurto(d.dia)}</td>
                  <td className="num">{fmt(d.conversas)}</td>
                  <td className="num">{fmt(d.conversas - d.chamados)}</td>
                  <td className="num">{fmt(d.chamados)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rel-grafico" ref={caixa}>
          <div ref={ref} style={{ width: '100%' }}>
            {largura > 0 && (
              <svg width={largura} height={altura} role="img" aria-label="Conversas por dia no período">
                {ticks.map((v) => (
                  <g key={v}>
                    <line x1={m.l} x2={largura - m.r} y1={y(v)} y2={y(v)} className={v === 0 ? 'rel-eixo' : 'rel-grade'} />
                    <text x={m.l - 8} y={y(v)} dy="0.32em" textAnchor="end" className="rel-rotulo">{fmt(v)}</text>
                  </g>
                ))}
                {serie.map((d, i) => {
                  const x = m.l + i * col + (col - bw) / 2;
                  const sozinho = d.conversas - d.chamados;
                  const yBase = y(0);
                  const hA = (sozinho / topo) * ih;
                  const hE = (d.chamados / topo) * ih;
                  const gap = hA > 0 && hE > 0 ? 2 : 0;
                  return (
                    <g key={d.dia} opacity={ativo == null || ativo === i ? 1 : 0.45}>
                      {sozinho > 0 && (
                        <path d={barra(x, yBase - hA, bw, hA, hE > 0 ? 0 : 4)} fill="var(--g-assistente)" />
                      )}
                      {d.chamados > 0 && (
                        <path d={barra(x, yBase - hA - gap - hE, bw, hE, 4)} fill="var(--g-equipe)" />
                      )}
                    </g>
                  );
                })}
                {serie.map((d, i) =>
                  i % cadaRotulo === 0 || i === serie.length - 1 ? (
                    (i === serie.length - 1 || serie.length - 1 - i >= cadaRotulo) && (
                      <text key={d.dia} x={m.l + i * col + col / 2} y={altura - 8} textAnchor="middle" className="rel-rotulo">
                        {diaCurto(d.dia)}
                      </text>
                    )
                  ) : null,
                )}
                {/* alvos de passar o mouse: a coluna inteira, maior que a barra */}
                {serie.map((d, i) => (
                  <rect
                    key={d.dia}
                    x={m.l + i * col}
                    y={m.t}
                    width={col}
                    height={ih}
                    fill="transparent"
                    onMouseMove={(e) => {
                      setAtivo(i);
                      mostrar(e, (
                        <>
                          <b>{diaLongo(d.dia)}</b>
                          <span className="rel-dica-linha"><i style={{ background: 'var(--g-assistente)' }} />Pelo assistente <em>{fmt(d.conversas - d.chamados)}</em></span>
                          <span className="rel-dica-linha"><i style={{ background: 'var(--g-equipe)' }} />Viraram chamado <em>{fmt(d.chamados)}</em></span>
                          <span className="rel-dica-total">Total <em>{fmt(d.conversas)}</em></span>
                        </>
                      ));
                    }}
                    onMouseLeave={() => {
                      setAtivo(null);
                      esconder();
                    }}
                  />
                ))}
              </svg>
            )}
          </div>
          {elemento}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------
// Horários de pico: dia da semana × hora
// ------------------------------------------------------------
function HorariosDePico({ celulas }) {
  const { caixa, mostrar, esconder, elemento } = useDica();
  const mapa = useMemo(() => {
    const m = new Map();
    for (const c of celulas) m.set(`${c.semana}-${c.hora}`, c.conversas);
    return m;
  }, [celulas]);
  const max = Math.max(0, ...celulas.map((c) => c.conversas));
  const nivel = (v) => (!v ? 0 : Math.min(5, Math.ceil((v / max) * 5)));

  const pico = celulas.reduce((a, c) => (c.conversas > (a?.conversas ?? 0) ? c : a), null);

  return (
    <div className="card rel-card">
      <div className="card-head">
        <div>
          <h2 className="card-title">Horários de pico</h2>
          <p className="faint rel-sub">
            {pico
              ? `Mais movimento ${SEMANA[pico.semana].toLowerCase()} às ${pico.hora}h. Bom horário para ter alguém da equipe por perto.`
              : 'Aparece quando as conversas começarem.'}
          </p>
        </div>
      </div>
      <div className="rel-grafico" ref={caixa}>
        <div className="rel-calor" role="grid" aria-label="Conversas por dia da semana e hora">
          <span />
          {Array.from({ length: 24 }, (_, h) => (
            <span key={h} className="rel-calor-hora">{h % 3 === 0 ? `${h}h` : ''}</span>
          ))}
          {ORDEM_SEMANA.map((s) => (
            <div key={s} className="rel-calor-linha" role="row">
              <span className="rel-calor-dia">{SEMANA[s]}</span>
              {Array.from({ length: 24 }, (_, h) => {
                const v = mapa.get(`${s}-${h}`) ?? 0;
                return (
                  <span
                    key={h}
                    role="gridcell"
                    aria-label={`${SEMANA[s]} ${h}h: ${v} conversas`}
                    className="rel-calor-celula"
                    data-nivel={nivel(v)}
                    onMouseMove={(e) =>
                      mostrar(e, (
                        <>
                          <b>{SEMANA[s]}, {String(h).padStart(2, '0')}h–{String((h + 1) % 24).padStart(2, '0')}h</b>
                          <span className="rel-dica-total">Conversas <em>{fmt(v)}</em></span>
                        </>
                      ))
                    }
                    onMouseLeave={esconder}
                  />
                );
              })}
            </div>
          ))}
        </div>
        {elemento}
      </div>
      <div className="rel-escala" aria-hidden="true">
        <span>menos</span>
        {[0, 1, 2, 3, 4, 5].map((n) => <i key={n} className="rel-calor-celula" data-nivel={n} />)}
        <span>mais</span>
      </div>
    </div>
  );
}

// ------------------------------------------------------------
// Lista em barras (assuntos, motivos, notas)
// ------------------------------------------------------------
function ListaBarras({ itens, total, rotuloValor = (v) => fmt(v) }) {
  const { caixa, mostrar, esconder, elemento } = useDica();
  const max = Math.max(1, ...itens.map((i) => i.valor));
  return (
    <div className="rel-grafico" ref={caixa}>
      <ul className="rel-barras">
        {itens.map((it) => (
          <li
            key={it.chave}
            onMouseMove={(e) =>
              mostrar(e, (
                <>
                  <b>{it.rotulo}</b>
                  {it.exemplo && <span className="rel-dica-exemplo">“{it.exemplo}”</span>}
                  <span className="rel-dica-total">
                    {rotuloValor(it.valor)}
                    {total ? <em>{pct(it.valor, total)}%</em> : null}
                  </span>
                </>
              ))
            }
            onMouseLeave={esconder}
          >
            <div className="rel-barras-topo">
              <span className="rel-barras-rotulo">{it.rotulo}</span>
              <span className="rel-barras-valor num">{fmt(it.valor)}</span>
            </div>
            <div className="rel-barras-trilho">
              <span style={{ width: it.valor > 0 ? `${Math.max(2, (it.valor / max) * 100)}%` : 0 }} />
            </div>
          </li>
        ))}
      </ul>
      {elemento}
    </div>
  );
}

function Assuntos({ dias }) {
  const [estado, setEstado] = useState({ carregando: true });

  const carregar = useCallback(
    async (forcar = false) => {
      setEstado((s) => ({ ...s, carregando: true, erro: null }));
      try {
        const r = await chamar('dados-e-relatorios', { action: 'assuntos', dias, forcar });
        setEstado({ carregando: false, ...r });
      } catch (e) {
        setEstado({ carregando: false, erro: e.message });
      }
    },
    [dias],
  );

  useEffect(() => {
    carregar();
  }, [carregar]);

  const itens = (estado.assuntos ?? []).map((a) => ({ chave: a.assunto, rotulo: a.assunto, valor: a.vezes, exemplo: a.exemplo }));

  return (
    <div className="card rel-card">
      <div className="card-head">
        <div>
          <h2 className="card-title">O que mais perguntam</h2>
          <p className="faint rel-sub">
            A IA agrupa a primeira pergunta de cada conversa por assunto
            {estado.gerado_em ? ` · atualizado ${quando(estado.gerado_em)}` : ''}.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-quiet btn-sm btn-icon"
          onClick={() => carregar(true)}
          disabled={estado.carregando}
          aria-label="Atualizar assuntos"
          title="Atualizar"
        >
          <RefreshCw size={15} className={estado.carregando ? 'spin' : ''} />
        </button>
      </div>
      {estado.carregando && !itens.length ? (
        <div className="stack stack-sm">
          {[80, 64, 52, 40, 30].map((w) => <div key={w} className="skeleton" style={{ height: 30, width: `${w}%` }} />)}
        </div>
      ) : estado.erro ? (
        <p className="faint">Não deu para agrupar agora: {estado.erro}</p>
      ) : itens.length === 0 ? (
        <p className="faint">
          {estado.amostra
            ? `Só ${estado.amostra} ${estado.amostra === 1 ? 'pergunta' : 'perguntas'} no período. Com mais conversas os assuntos aparecem aqui.`
            : 'Quando os clientes começarem a conversar, os assuntos mais pedidos aparecem aqui.'}
        </p>
      ) : (
        <>
          <ListaBarras itens={itens} total={estado.amostra} rotuloValor={(v) => `${fmt(v)} ${v === 1 ? 'conversa' : 'conversas'}`} />
          <p className="faint rel-rodape">Base: {fmt(estado.amostra)} conversas com pergunta.</p>
        </>
      )}
    </div>
  );
}

// ------------------------------------------------------------
// Página
// ------------------------------------------------------------
function Numero({ rotulo, valor, detalhe, variacao }) {
  return (
    <div className="card rel-numero">
      <span className="rel-numero-rotulo">{rotulo}</span>
      <span className="rel-numero-valor">{valor}</span>
      {(detalhe || variacao != null) && (
        <span className="rel-numero-detalhe">
          {variacao != null && (
            <b data-sinal={variacao > 0 ? 'mais' : variacao < 0 ? 'menos' : 'igual'}>
              {variacao > 0 ? <ArrowUpRight size={13} /> : variacao < 0 ? <ArrowDownRight size={13} /> : null}
              {variacao > 0 ? '+' : ''}
              {variacao}%
            </b>
          )}
          {detalhe}
        </span>
      )}
    </div>
  );
}

export default function Relatorios() {
  const { user } = useAuth();
  const [dias, setDias] = useState(30);
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState(null);

  useEffect(() => {
    if (!user) return;
    let vivo = true;
    setErro(null);
    const fuso = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Sao_Paulo';
    supabase.rpc('helpy_relatorio', { dias, fuso }).then(({ data, error }) => {
      if (!vivo) return;
      if (error) setErro(error.message);
      else setDados(data);
    });
    return () => {
      vivo = false;
    };
  }, [user, dias]);

  const r = dados?.resumo;
  const variacao = r && r.conversas_antes ? Math.round(((r.conversas - r.conversas_antes) / r.conversas_antes) * 100) : null;
  const notas = dados
    ? [5, 4, 3, 2, 1].map((n) => ({ chave: String(n), rotulo: `${n} ${n === 1 ? 'estrela' : 'estrelas'}`, valor: Number(dados.notas_dist?.[n] ?? 0) }))
    : [];

  return (
    <div className="page rel-page">
      <header className="page-head">
        <div>
          <h1>Relatórios</h1>
          <p>Como o seu atendimento está indo: volume, o que resolve sozinho, quando o movimento aperta e o que os clientes mais querem saber.</p>
        </div>
        <div className="tabs rel-periodo" role="tablist" aria-label="Período">
          {PERIODOS.map((p) => (
            <button key={p.dias} type="button" role="tab" className="tab" aria-selected={dias === p.dias} onClick={() => setDias(p.dias)}>
              {p.rotulo}
            </button>
          ))}
        </div>
      </header>

      {erro && <div className="alert alert-erro" style={{ marginBottom: 16 }}>Não foi possível carregar: {erro}</div>}

      {!dados && !erro ? (
        <div className="rel-numeros">
          {Array.from({ length: 6 }, (_, i) => <div key={i} className="card skeleton" style={{ height: 112 }} />)}
        </div>
      ) : dados ? (
        <>
          <section className="rel-numeros">
            <Numero
              rotulo="Conversas"
              valor={fmt(r.conversas)}
              variacao={variacao}
              detalhe={variacao != null ? ` vs. ${dias} dias antes` : r.conversas ? `em ${dias} dias` : 'nenhuma ainda'}
            />
            <Numero
              rotulo="Resolvidas pelo assistente"
              valor={r.com_resposta ? `${pct(r.resolvidas_sozinho, r.com_resposta)}%` : '—'}
              detalhe={r.com_resposta ? `${fmt(r.resolvidas_sozinho)} sem precisar da equipe` : 'sem conversas no período'}
            />
            <Numero
              rotulo="Viraram chamado"
              valor={fmt(r.chamados)}
              detalhe={r.chamados_abertos ? `${fmt(r.chamados_abertos)} ainda abertos` : 'nenhum aberto'}
            />
            <Numero
              rotulo="Tempo até a equipe assumir"
              valor={minutos(r.resposta_equipe_min)}
              detalhe="mediana dos chamados"
            />
            <Numero
              rotulo="Nota dos clientes"
              valor={r.nota_media ? fmt(r.nota_media, 1) : '—'}
              detalhe={r.notas ? `${fmt(r.notas)} ${r.notas === 1 ? 'avaliação' : 'avaliações'}` : 'sem avaliações'}
            />
            <Numero
              rotulo="Contatos e horários"
              valor={fmt(r.leads)}
              detalhe={`contatos captados · ${fmt(r.agendamentos)} ${r.agendamentos === 1 ? 'horário marcado' : 'horários marcados'}`}
            />
          </section>

          {r.conversas === 0 && (
            <div className="alert" style={{ marginBottom: 16 }}>
              <span>
                Ainda não há conversas de clientes neste período (os testes do painel não contam).{' '}
                <Link to="/painel/assistentes">Pegue o link do seu assistente</Link> e divulgue para os números aparecerem.
              </span>
            </div>
          )}

          <ConversasPorDia serie={dados.por_dia ?? []} />

          <section className="rel-duas">
            <Assuntos dias={dias} />
            <HorariosDePico celulas={dados.por_hora ?? []} />
          </section>

          <section className="rel-duas">
            <div className="card rel-card">
              <div className="card-head">
                <div>
                  <h2 className="card-title">Perguntas sem resposta</h2>
                  <p className="faint rel-sub">O que o assistente não soube. Ensine e ele para de chamar a equipe por isso.</p>
                </div>
              </div>
              {dados.lacunas?.length ? (
                <ListaBarras
                  itens={dados.lacunas.map((g) => ({ chave: g.id, rotulo: g.assunto, valor: g.vezes, exemplo: g.pergunta }))}
                  rotuloValor={(v) => `${fmt(v)} ${v === 1 ? 'vez' : 'vezes'}`}
                />
              ) : (
                <p className="faint">Nenhuma pergunta ficou sem resposta no período.</p>
              )}
            </div>

            <div className="card rel-card">
              <div className="card-head">
                <div>
                  <h2 className="card-title">Por que viraram chamado</h2>
                  <p className="faint rel-sub">Os motivos que o assistente anotou ao chamar a equipe.</p>
                </div>
              </div>
              {dados.motivos_chamado?.length ? (
                <ListaBarras
                  itens={dados.motivos_chamado.map((m) => ({ chave: m.motivo, rotulo: m.motivo[0].toUpperCase() + m.motivo.slice(1), valor: m.vezes }))}
                  total={r.chamados}
                  rotuloValor={(v) => `${fmt(v)} ${v === 1 ? 'chamado' : 'chamados'}`}
                />
              ) : (
                <p className="faint">Nenhum chamado no período.</p>
              )}
            </div>
          </section>

          <section className="rel-duas">
            <div className="card rel-card">
              <div className="card-head">
                <h2 className="card-title">Notas</h2>
              </div>
              {r.notas ? (
                <ListaBarras itens={notas} total={r.notas} rotuloValor={(v) => `${fmt(v)} ${v === 1 ? 'avaliação' : 'avaliações'}`} />
              ) : (
                <p className="faint">Ao encerrar, o cliente pode dar uma nota de 1 a 5. Elas aparecem aqui.</p>
              )}
            </div>

            <div className="card rel-card">
              <div className="card-head">
                <h2 className="card-title">Por assistente</h2>
              </div>
              {dados.por_assistente?.length ? (
                <div className="rel-tabela-rolagem">
                  <table className="rel-tabela">
                    <thead>
                      <tr><th>Assistente</th><th>Conversas</th><th>Chamados</th><th>Nota</th></tr>
                    </thead>
                    <tbody>
                      {dados.por_assistente.map((a) => (
                        <tr key={a.id}>
                          <td>{a.nome}</td>
                          <td className="num">{fmt(a.conversas)}</td>
                          <td className="num">{fmt(a.chamados)} <span className="faint">({pct(a.chamados, a.conversas)}%)</span></td>
                          <td className="num">{a.nota ? fmt(a.nota, 1) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="faint">Sem conversas no período.</p>
              )}
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
