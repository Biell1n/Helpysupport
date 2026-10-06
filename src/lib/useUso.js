import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

/** Uso do mês: atendimentos, chamados abertos, assistentes, tabelas, custo. */
export function useUso() {
  const [uso, setUso] = useState(null);

  const carregar = useCallback(async () => {
    const { data } = await supabase.rpc('helpy_uso');
    if (data) setUso(data);
  }, []);

  useEffect(() => {
    carregar();
    const t = setInterval(carregar, 30000);
    return () => clearInterval(t);
  }, [carregar]);

  return [uso, carregar];
}
