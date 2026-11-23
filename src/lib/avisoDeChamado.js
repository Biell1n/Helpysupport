import { useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';

const CHAVE_SOM = 'helpy_som_chamado';

/** Som e aviso do navegador ligados? (o som vem ligado; o aviso do navegador depende da permissão) */
export function somLigado() {
  try {
    return localStorage.getItem(CHAVE_SOM) !== 'nao';
  } catch {
    return true;
  }
}
export function ligarSom(ligado) {
  try {
    localStorage.setItem(CHAVE_SOM, ligado ? 'sim' : 'nao');
  } catch {
    /* sem armazenamento: segue o padrão */
  }
}

/** Dois toques curtos, sem arquivo de áudio. O navegador só toca depois do primeiro clique na página. */
function tocar() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    [[880, 0], [1320, 0.16]].forEach(([freq, quando]) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, ctx.currentTime + quando);
      g.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + quando + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + quando + 0.14);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + quando);
      o.stop(ctx.currentTime + quando + 0.16);
    });
    setTimeout(() => ctx.close().catch(() => {}), 600);
  } catch {
    /* sem áudio: só o aviso visual */
  }
}

/**
 * Chamado novo na fila: toca um som e, com a aba em segundo plano, mostra o aviso do navegador
 * (se a pessoa deixou). Confere a cada 15 segundos.
 */
export function useAvisoDeChamado(ativo, onNovo) {
  const visto = useRef(null);
  const aviso = useRef(onNovo);
  aviso.current = onNovo;

  useEffect(() => {
    if (!ativo) return undefined;
    let vivo = true;
    const conferir = async () => {
      const { data } = await supabase.from('conversations')
        .select('id, numero, titulo, lead_nome, escalado_em')
        .eq('status', 'waiting').eq('teste', false).not('escalado_em', 'is', null)
        .order('escalado_em', { ascending: false }).limit(1);
      if (!vivo || !data) return;
      const ultimo = data[0];
      // a primeira leitura só marca onde a fila estava: avisa só o que chegar depois
      if (visto.current === null) {
        visto.current = ultimo?.escalado_em ?? '';
        return;
      }
      if (!ultimo || ultimo.escalado_em <= visto.current) return;
      visto.current = ultimo.escalado_em;
      if (somLigado()) tocar();
      const titulo = 'Chamado novo';
      const corpo = `${ultimo.lead_nome ? `${ultimo.lead_nome}: ` : ''}${ultimo.titulo || 'Um cliente quer falar com a equipe'}`;
      if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
        try {
          const n = new Notification(titulo, { body: corpo, tag: `chamado-${ultimo.id}` });
          n.onclick = () => {
            window.focus();
            window.location.assign(`/painel/atendimentos?id=${ultimo.id}`);
          };
        } catch {
          /* alguns celulares não deixam criar aviso por aqui */
        }
      }
      aviso.current?.(ultimo, corpo);
    };
    conferir();
    const t = setInterval(conferir, 15000);
    return () => {
      vivo = false;
      clearInterval(t);
    };
  }, [ativo]);
}
