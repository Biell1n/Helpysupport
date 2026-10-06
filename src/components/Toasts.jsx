import { createContext, useCallback, useContext, useState } from 'react';

const ToastContext = createContext(() => {});

export function ToastProvider({ children }) {
  const [itens, setItens] = useState([]);

  const avisar = useCallback((titulo, opcoes = {}) => {
    const id = Math.random().toString(36).slice(2);
    setItens((p) => [...p, { id, titulo, ...opcoes }]);
    setTimeout(() => setItens((p) => p.filter((t) => t.id !== id)), opcoes.erro ? 6000 : 3500);
  }, []);

  return (
    <ToastContext.Provider value={avisar}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {itens.map((t) => (
          <div key={t.id} className={`toast${t.erro ? ' toast-erro' : ''}`}>
            <b>{t.titulo}</b>
            {t.texto}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/** avisar('Salvo') · avisar('Não deu', { erro: true, texto: 'detalhe' }) */
export const useToast = () => useContext(ToastContext);
