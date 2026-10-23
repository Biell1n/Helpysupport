import { Monitor, Moon, Sun } from 'lucide-react';
import { useTema } from '@/lib/tema';

const OPCOES = [
  ['claro', 'Claro', Sun],
  ['escuro', 'Escuro', Moon],
  ['sistema', 'Automático', Monitor],
];

/** Claro, escuro ou automático (igual ao sistema). Com `compacto`, só os ícones. */
export default function EscolherTema({ compacto = false }) {
  const [tema, trocar] = useTema();
  return (
    <div className="tema-escolha" role="group" aria-label="Tema da tela">
      {OPCOES.map(([id, nome, Icone]) => (
        <button key={id} type="button" aria-pressed={tema === id} onClick={() => trocar(id)} title={compacto ? nome : undefined} aria-label={compacto ? nome : undefined}>
          <Icone />
          {!compacto && nome}
        </button>
      ))}
    </div>
  );
}
