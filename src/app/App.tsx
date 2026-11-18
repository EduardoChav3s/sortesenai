import { useEffect } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthGate } from '@/auth/AuthGate';
import { authDeps } from '@/data/client';
import { LoginPage } from '@/auth/LoginPage';

// Dev-only preview of the login page that never touches the real session.
const previewDeps = {
  signInGoogle: async () => {},
  signInPassword: async () => {},
  signUp: async () => ({ needsConfirm: true }),
  isAdmin: async () => false,
  signOut: async () => {},
};
import { Shell } from './Shell';
import { RollPage } from '@/features/roll/RollPage';
import { CollectionPage } from '@/features/collection/CollectionPage';
import { GamesPage } from '@/features/games/GamesPage';
import { ShopPage } from '@/features/shop/ShopPage';
import { RankingPage } from '@/features/ranking/RankingPage';
import { ProfilePage } from '@/features/profile/ProfilePage';
import { SuggestPage } from '@/features/suggest/SuggestPage';
import { AdminPage } from '@/features/admin/AdminPage';
import { MorePage } from '@/features/more/MorePage';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 15_000 } } });

export function App() {
  if (import.meta.env.DEV && window.location.pathname === '/_login') return <LoginPage deps={previewDeps} />;
  useEffect(() => {
    document.title = 'SorteSenai';
  }, []);
  return (
    <QueryClientProvider client={queryClient}>
    <AuthGate deps={authDeps}>
    <BrowserRouter>
      <Routes>
        <Route element={<Shell />}>
          <Route index element={<RollPage />} />
          <Route path="colecao" element={<CollectionPage />} />
          <Route path="jogos" element={<GamesPage />} />
          <Route path="loja" element={<ShopPage />} />
          <Route path="ranking" element={<RankingPage />} />
          <Route path="perfil" element={<ProfilePage />} />
          <Route path="sugerir" element={<SuggestPage />} />
          <Route path="admin" element={<AdminPage />} />
          <Route path="mais" element={<MorePage />} />
        </Route>
      </Routes>
    </BrowserRouter>
    </AuthGate>
    </QueryClientProvider>
  );
}
