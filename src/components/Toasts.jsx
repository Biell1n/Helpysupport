import { createContext, useCallback, useContext, useState } from 'react';

const ToastContext = createContext(() => {});

export function ToastProvider({ children }) {
  const [itens, setItens] = useState([]);

  const avisar = useCallback((titulo, opcoes = {}) => {
    const id = Math.random().toString(36).slice(2);
    setItens((p) => [...p, { id, titulo, ...opcoes }]);
    // aviso com ação (ex.: Desfazer) fica mais tempo, para dar tempo de clicar
    setTimeout(() => setItens((p) => p.filter((t) => t.id !== id)), opcoes.acao ? 8000 : opcoes.erro ? 6000 : 3500);
  }, []);

  const fechar = (id) => setItens((p) => p.filter((t) => t.id !== id));

  return (
    <ToastContext.Provider value={avisar}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {itens.map((t) => (
          <div key={t.id} className={`toast${t.erro ? ' toast-erro' : ''}`}>
            <b>{t.titulo}</b>
            {t.texto && <span>{t.texto}</span>}
            {t.acao && (
              <button
                type="button"
                className="toast-acao"
                onClick={() => {
                  fechar(t.id);
                  t.acao.onClick();
                }}
              >
                {t.acao.rotulo}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/** avisar('Salvo') · avisar('Não deu', { erro: true, texto: 'detalhe' }) · avisar('Apagado', { acao: { rotulo: 'Desfazer', onClick } }) */
export const useToast = () => useContext(ToastContext);
