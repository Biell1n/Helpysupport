import { useEffect, useState } from 'react';
import { chamar } from '@/lib/supabase';
import { PLANS, PRECOS_PADRAO } from '@/lib/plans';

// Os preços cobrados vêm do servidor (com os preços de teste ligados, tudo vai
// para o mínimo do Asaas). Pedido uma vez por sessão e guardado aqui.
let guardados = null;
let pedido = null;

function buscar() {
  pedido ??= chamar('pagamentos', { action: 'precos' })
    .then((r) => {
      // resposta incompleta não quebra a tela: o que faltar fica com o padrão
      const p = { ...PRECOS_PADRAO, ...(r ?? {}), planos: { ...PRECOS_PADRAO.planos, ...(r?.planos ?? {}) }, extra: { ...PRECOS_PADRAO.extra, ...(r?.extra ?? {}) } };
      if (typeof p.vaga !== 'number') p.vaga = PRECOS_PADRAO.vaga;
      // no teste o Essencial tem cota pequena, para dar para testar o uso extra
      if (p.teste && p.cota_teste) Object.assign(PLANS.essencial, p.cota_teste);
      guardados = p;
      return p;
    })
    .catch(() => {
      pedido = null;
      return PRECOS_PADRAO;
    });
  return pedido;
}

/** Preços em vigor. Começa com os padrão e troca quando o servidor responde. */
export function usePrecos() {
  const [precos, setPrecos] = useState(guardados ?? PRECOS_PADRAO);
  useEffect(() => {
    if (guardados) return undefined;
    let vivo = true;
    buscar().then((p) => vivo && setPrecos(p));
    return () => {
      vivo = false;
    };
  }, []);
  return precos;
}
