import { PRECOS_PADRAO, reais } from '@/lib/plans';

/** Preço no ciclo escolhido. No anual mostra quanto sai por mês e o total do ano. */
export default function PrecoDoPlano({ p, ciclo, precos = PRECOS_PADRAO }) {
  const v = precos.planos[p.id]?.[ciclo] ?? (ciclo === 'anual' ? p.preco * 12 : p.precoMensal);
  if (ciclo === 'mensal') {
    return <p className="lp-preco">{reais(v)}<small>/mês</small></p>;
  }
  return (
    <>
      <p className="lp-preco">
        <s className="lp-preco-cheio">{reais(precos.planos[p.id]?.mensal ?? p.precoMensal)}</s>
        {reais(v / 12)}<small>/mês</small>
      </p>
      <p className="lp-preco-nota">{reais(v)} por ano, de uma vez</p>
    </>
  );
}
