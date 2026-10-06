import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import '@fontsource-variable/bricolage-grotesque/opsz.css';
import '@fontsource-variable/onest';
import '@fontsource/martian-mono/400.css';
import '@fontsource/martian-mono/500.css';
import '@/styles/base.css';
import '@/styles/app.css';
import '@/styles/landing.css';
import App from '@/App';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
