import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthGate } from '@/auth/AuthGate';
import { authDeps } from '@/data/client';
import { LoginPage } from '@/auth/LoginPage';
import { LoginMusic } from '@/auth/LoginMusic';

// Dev-only preview of the login page that never touches the real session.
const previewDeps = {
  signInGoogle: async () => {},
  signInPassword: async () => {},
  signUp: async () => ({ needsConfirm: true }),
  isAdmin: async () => false,
  signOut: async () => {},
  resetPassword: async () => {},
  updatePassword: async () => {},
};
import { Shell } from './Shell';
import { ErrorScreen, NotFoundPage } from './Problems';
import { RollPage } from '@/features/roll/RollPage';

// The roll screen comes with the first download. Every other page is its own small file: the first visit
// downloads and starts less, and the other pages are fetched in the background once the site is idle,
// so opening them stays instant.
const pages = {
  collection: () => import('@/features/collection/CollectionPage').then((m) => ({ default: m.CollectionPage })),
  games: () => import('@/features/games/GamesPage').then((m) => ({ default: m.GamesPage })),
  shop: () => import('@/features/shop/ShopPage').then((m) => ({ default: m.ShopPage })),
  ranking: () => import('@/features/ranking/RankingPage').then((m) => ({ default: m.RankingPage })),
  profile: () => import('@/features/profile/ProfilePage').then((m) => ({ default: m.ProfilePage })),
  suggest: () => import('@/features/suggest/SuggestPage').then((m) => ({ default: m.SuggestPage })),
  admin: () => import('@/features/admin/AdminPage').then((m) => ({ default: m.AdminPage })),
  more: () => import('@/features/more/MorePage').then((m) => ({ default: m.MorePage })),
  artifacts: () => import('@/features/artifacts/ArtifactsPage').then((m) => ({ default: m.ArtifactsPage })),
  friends: () => import('@/features/friends/FriendsPage').then((m) => ({ default: m.FriendsPage })),
  player: () => import('@/features/player/PlayerPage').then((m) => ({ default: m.PlayerPage })),
  chat: () => import('@/features/chat/ChatPage').then((m) => ({ default: m.ChatPage })),
};
const CollectionPage = lazy(pages.collection);
const GamesPage = lazy(pages.games);
const ShopPage = lazy(pages.shop);
const RankingPage = lazy(pages.ranking);
const ProfilePage = lazy(pages.profile);
const SuggestPage = lazy(pages.suggest);
const AdminPage = lazy(pages.admin);
const MorePage = lazy(pages.more);
const ArtifactsPage = lazy(pages.artifacts);
const FriendsPage = lazy(pages.friends);
const PlayerPage = lazy(pages.player);
const ChatPage = lazy(pages.chat);

/** Fetches the other pages after the first screen is up, one by one, when the browser has nothing else to do. */
function usePrefetchPages() {
  useEffect(() => {
    if (import.meta.env.MODE === 'test') return;
    const idle = (cb: () => void) =>
      typeof window.requestIdleCallback === 'function' ? window.requestIdleCallback(cb, { timeout: 4000 }) : setTimeout(cb, 2500);
    let gone = false;
    // admin pages are only for admins: they load when opened
    const queue = Object.entries(pages).filter(([name]) => name !== 'admin').map(([, load]) => load);
    const next = () => {
      const load = queue.shift();
      if (!load || gone) return;
      load().then(() => idle(next), () => undefined);
    };
    idle(next);
    return () => {
      gone = true;
    };
  }, []);
}

/** A lazily loaded page. While its file arrives (rare: they are prefetched) the page area stays empty. */
const page = (el: JSX.Element) => <Suspense fallback={null}>{el}</Suspense>;

const queryClient =new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 15_000 } } });

export function App() {
  if (import.meta.env.DEV && window.location.pathname === '/_login')
    return (
      <>
        <LoginPage deps={previewDeps} />
        <LoginMusic />
      </>
    );
  useEffect(() => {
    document.title = 'SorteSenai';
  }, []);
  usePrefetchPages();
  return (
    <ErrorScreen>
    <QueryClientProvider client={queryClient}>
    <AuthGate deps={authDeps}>
    <BrowserRouter>
      <Routes>
        <Route element={<Shell />}>
          <Route index element={<RollPage />} />
          <Route path="colecao" element={page(<CollectionPage />)} />
          <Route path="jogos" element={page(<GamesPage />)} />
          <Route path="loja" element={page(<ShopPage />)} />
          <Route path="ranking" element={page(<RankingPage />)} />
          <Route path="perfil" element={page(<ProfilePage />)} />
          <Route path="ideia" element={page(<SuggestPage />)} />
          <Route path="sugerir" element={<Navigate to="/ideia" replace />} />
          <Route path="artefatos" element={page(<ArtifactsPage />)} />
          <Route path="amigos" element={page(<FriendsPage />)} />
          <Route path="jogador/:id" element={page(<PlayerPage />)} />
          <Route path="*" element={<NotFoundPage />} />
          <Route path="admin" element={page(<AdminPage />)} />
          <Route path="mais" element={page(<MorePage />)} />
          <Route path="chat" element={<Suspense fallback={<p className="page-sub">Abrindo o chat…</p>}><ChatPage /></Suspense>} />
        </Route>
      </Routes>
    </BrowserRouter>
    </AuthGate>
    </QueryClientProvider>
    </ErrorScreen>
  );
}
