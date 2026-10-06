import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { configurado } from '@/lib/supabase';
import { AuthProvider } from '@/contexts/AuthContext';
import { ToastProvider } from '@/components/Toasts';
import AppShell, { Carregando, ExigeLogin } from '@/components/AppShell';
import Landing from '@/pages/Landing';
import Configurar from '@/pages/Configurar';

const Entrar = lazy(() => import('@/pages/auth/Entrar'));
const CriarConta = lazy(() => import('@/pages/auth/CriarConta'));
const Recuperar = lazy(() => import('@/pages/auth/Recuperar'));
const NovaSenha = lazy(() => import('@/pages/auth/NovaSenha'));
const Painel = lazy(() => import('@/pages/Painel'));
const Assistentes = lazy(() => import('@/pages/Assistentes'));
const Builder = lazy(() => import('@/pages/builder/Builder'));
const Testar = lazy(() => import('@/pages/Testar'));
const Atendimentos = lazy(() => import('@/pages/Atendimentos'));
const Dados = lazy(() => import('@/pages/Dados'));
const Agenda = lazy(() => import('@/pages/Agenda'));
const Plano = lazy(() => import('@/pages/Plano'));
const Conta = lazy(() => import('@/pages/Conta'));
const ChatPublico = lazy(() => import('@/pages/ChatPublico'));
const Legal = lazy(() => import('@/pages/Legal'));
const NaoEncontrada = lazy(() => import('@/pages/NaoEncontrada'));

export default function App() {
  if (!configurado) return <Configurar />;

  return (
    <AuthProvider>
      <ToastProvider>
        <Suspense fallback={<Carregando />}>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/entrar" element={<Entrar />} />
            <Route path="/criar-conta" element={<CriarConta />} />
            <Route path="/recuperar-senha" element={<Recuperar />} />
            <Route path="/nova-senha" element={<NovaSenha />} />
            <Route path="/termos" element={<Legal tipo="termos" />} />
            <Route path="/privacidade" element={<Legal tipo="privacidade" />} />
            <Route path="/c/:token" element={<ChatPublico />} />

            <Route
              path="/painel"
              element={
                <ExigeLogin>
                  <AppShell />
                </ExigeLogin>
              }
            >
              <Route index element={<Painel />} />
              <Route path="assistentes" element={<Assistentes />} />
              <Route path="assistentes/:id/testar" element={<Testar />} />
              <Route path="atendimentos" element={<Atendimentos />} />
              <Route path="dados" element={<Dados />} />
              <Route path="agenda" element={<Agenda />} />
              <Route path="plano" element={<Plano />} />
              <Route path="conta" element={<Conta />} />
            </Route>

            {/* o builder ocupa a tela inteira, sem a barra lateral */}
            <Route path="/painel/assistentes/novo" element={<ExigeLogin><Builder /></ExigeLogin>} />
            <Route path="/painel/assistentes/:id/editar" element={<ExigeLogin><Builder /></ExigeLogin>} />

            {/* endereços antigos do Horizons */}
            <Route path="/auth" element={<Navigate to="/entrar" replace />} />
            <Route path="/dashboard/*" element={<Navigate to="/painel" replace />} />

            <Route path="*" element={<NaoEncontrada />} />
          </Routes>
        </Suspense>
      </ToastProvider>
    </AuthProvider>
  );
}
