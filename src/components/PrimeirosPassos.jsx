// Primeiros passos do Painel: o que falta para o assistente atender de
// verdade, marcado sozinho conforme a conta avança.
// Adaptado do Onboarding Checklist de Ravi Katiyar (via 21st.dev), com motion.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';
import { ArrowRight, CheckCircle2, Circle, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';

const CHAVE = 'helpy_primeiros_passos_fechado';

/** Lê da conta o que já foi feito. Cada passo diz como e onde se resolve. */
async function verificar(assistentes) {
  const um = (q) => q.then((r) => (r.count ?? 0) > 0).catch(() => false);
  const [testou, conversou, canal, carteira, vende, equipe] = await Promise.all([
    um(supabase.from('conversations').select('id', { count: 'exact', head: true }).eq('teste', true)),
    um(supabase.from('conversations').select('id', { count: 'exact', head: true }).eq('teste', false)),
    um(supabase.from('canais').select('id', { count: 'exact', head: true })),
    um(supabase.from('recebimentos').select('owner_id', { count: 'exact', head: true })),
    // só conta como feito quando algum assistente fecha a venda (não basta ligar a conta)
    um(supabase.from('assistants').select('id', { count: 'exact', head: true }).ilike('config->fields->venda_no_chat->>value', 'sim%')),
    um(supabase.from('equipe').select('user_id', { count: 'exact', head: true })),
  ]);
  const primeiro = assistentes[0];
  return [
    { id: 'montar', texto: 'Montar o assistente', ajuda: 'Conte como o negócio funciona.', feito: assistentes.length > 0, para: '/painel/assistentes/novo', acao: 'Começar' },
    { id: 'testar', texto: 'Conversar com ele como cliente', ajuda: 'Veja as respostas antes de divulgar.', feito: testou, para: primeiro ? `/painel/assistentes/${primeiro.id}/testar` : '/painel/assistentes', acao: 'Testar' },
    { id: 'divulgar', texto: 'Pôr no ar', ajuda: 'Link, QR code, WhatsApp, Instagram ou Discord.', feito: canal || conversou, para: '/painel/canais', acao: 'Ver canais' },
    { id: 'carteira', texto: 'Receber pelo chat', ajuda: 'Opcional: o assistente fecha a venda com Pix.', feito: carteira && vende, para: '/painel/carteira', acao: 'Ativar' },
    { id: 'equipe', texto: 'Chamar a equipe', ajuda: 'Opcional: quem responde os chamados.', feito: equipe, para: '/painel/equipe', acao: 'Convidar' },
  ];
}

export default function PrimeirosPassos({ assistentes }) {
  const parado = useReducedMotion();
  const [passos, setPassos] = useState(null);
  const [fechado, setFechado] = useState(() => {
    try { return localStorage.getItem(CHAVE) === '1'; } catch { return false; }
  });

  useEffect(() => {
    if (!assistentes || fechado) return;
    let vivo = true;
    verificar(assistentes).then((p) => vivo && setPassos(p));
    return () => { vivo = false; };
  }, [assistentes, fechado]);

  if (fechado || !passos) return null;
  const feitos = passos.filter((p) => p.feito).length;
  if (feitos === passos.length) return null;
  const proximo = passos.find((p) => !p.feito);

  const fechar = () => {
    try { localStorage.setItem(CHAVE, '1'); } catch { /* sem armazenamento: some só nesta visita */ }
    setFechado(true);
  };

  const entra = parado ? {} : { hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0, transition: { duration: 0.45, ease: 'easeOut', when: 'beforeChildren', staggerChildren: 0.07 } } };
  const item = parado ? {} : { hidden: { opacity: 0, x: -14 }, visible: { opacity: 1, x: 0, transition: { duration: 0.35, ease: 'easeOut' } } };

  return (
    <motion.section className="card primeiros-passos" initial="hidden" animate="visible" variants={entra} aria-labelledby="pp-titulo">
      <button type="button" className="pp-fechar" onClick={fechar} aria-label="Esconder os primeiros passos"><X size={16} /></button>
      <div className="pp-lista">
        <p className="eyebrow" style={{ margin: 0 }}>Primeiros passos · {feitos} de {passos.length}</p>
        <h2 id="pp-titulo">Falta pouco para o seu assistente atender sozinho</h2>
        <div className="pp-barra" aria-hidden="true"><i style={{ width: `${(feitos / passos.length) * 100}%` }} /></div>
        <ul>
          {passos.map((p) => (
            <motion.li key={p.id} variants={item} data-feito={p.feito} data-proximo={p === proximo}>
              {p.feito ? <CheckCircle2 size={20} className="pp-ok" /> : <Circle size={20} className="pp-falta" />}
              <div>
                <b>{p.texto}</b>
                <span>{p.ajuda}</span>
              </div>
              {!p.feito && (
                <Link to={p.para} className={`btn btn-sm ${p === proximo ? 'btn-primary' : 'btn-quiet'}`}>
                  {p.acao} {p === proximo && <ArrowRight size={14} />}
                </Link>
              )}
            </motion.li>
          ))}
        </ul>
      </div>
    </motion.section>
  );
}
