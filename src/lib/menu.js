import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

// O menu mostra só o que a empresa usa: quem não vende não vê Pedidos nem
// Carteira, quem não marca horário não vê Agenda. Ligou no assistente (ou já
// tem pedido, horário ou recebimento), o item aparece.

const TUDO = { pedidos: true, agenda: true, carteira: true };
const campo = (k) => `config->fields->${k}->>value`;
const tem = (q) => q.then((r) => (r.error ? null : (r.count ?? 0) > 0)).catch(() => null);

export function useMenu(userId, tipo) {
  const chave = `helpy_menu:${userId}`;
  const [menu, setMenu] = useState(() => {
    try {
      return { ...TUDO, ...JSON.parse(localStorage.getItem(chave) || '{}') };
    } catch {
      return TUDO;
    }
  });

  useEffect(() => {
    if (!userId || tipo === 'cliente') return undefined;
    let vivo = true;
    const conta = (t) => supabase.from(t).select('*', { count: 'exact', head: true });
    const assist = () => supabase.from('assistants').select('id', { count: 'exact', head: true });
    const consultas = [
      tem(conta('pedidos')),
      tem(conta('agendamentos')),
      tipo === 'empresa' ? tem(assist().not(campo('venda_no_chat'), 'is', null).not(campo('venda_no_chat'), 'ilike', 'não%')) : null,
      tipo === 'empresa' ? tem(assist().ilike(campo('usar_agenda'), 'sim%')) : null,
      tipo === 'empresa' ? tem(supabase.from('agenda_config').select('owner_id', { count: 'exact', head: true }).eq('ativa', true)) : null,
      tipo === 'empresa' ? tem(assist().ilike(campo('venda_no_chat'), 'sim%')) : null,
      tipo === 'empresa' ? tem(assist().ilike(campo('agenda_pagamento'), 'sim%')) : null,
      tipo === 'empresa' ? tem(supabase.from('recebimentos').select('owner_id', { count: 'exact', head: true })) : null,
    ];
    Promise.all(consultas).then(([pedidos, agendamentos, vende, marca, agendaAtiva, vendeLink, cobraHorario, recebe]) => {
      if (!vivo) return;
      // consulta que falhou conta como "sim": na dúvida, o item aparece
      const sim = (...v) => v.some((x) => x !== false);
      const novo = tipo === 'empresa'
        ? { pedidos: sim(pedidos, vende), agenda: sim(agendamentos, marca, agendaAtiva), carteira: sim(vendeLink, cobraHorario, recebe) }
        : { pedidos: sim(pedidos), agenda: sim(agendamentos), carteira: false };
      setMenu(novo);
      try {
        localStorage.setItem(chave, JSON.stringify(novo));
      } catch {
        /* sem armazenamento: só não lembra entre visitas */
      }
    });
    return () => {
      vivo = false;
    };
  }, [userId, tipo, chave]);

  return (to) => {
    if (to === '/painel/pedidos') return menu.pedidos;
    if (to === '/painel/agenda') return menu.agenda;
    if (to === '/painel/carteira') return menu.carteira;
    return true;
  };
}
