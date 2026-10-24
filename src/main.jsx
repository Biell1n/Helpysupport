import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import '@fontsource-variable/archivo/wdth.css';
import '@fontsource/dm-mono/400.css';
import '@fontsource/dm-mono/500.css';
import '@/styles/base.css';
import '@/styles/app.css';
import '@/styles/landing.css';
import '@/styles/tema-escuro.css';
import { iniciarTema } from '@/lib/tema';
import App from '@/App';
import SemTelaBranca, { recarregarParaVersaoNova } from '@/components/SemTelaBranca';

iniciarTema();

// tela aberta antes de uma atualização do site: o arquivo antigo some, então recarrega
window.addEventListener('vite:preloadError', (e) => {
  if (recarregarParaVersaoNova()) e.preventDefault();
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <SemTelaBranca>
        <App />
      </SemTelaBranca>
    </BrowserRouter>
  </React.StrictMode>,
);
