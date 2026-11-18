// React Query hooks over the real database. In demo mode (no Supabase keys) they stay idle
// and pages keep showing the sample data from src/design/sample.ts.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, fetchWallet, uploadImage } from './client';
import { rollMany } from './api';
import type { FeedEvent } from './types';

export const isLive = api !== null;

export function useWallet() {
  return useQuery({ queryKey: ['wallet'], queryFn: fetchWallet, enabled: isLive });
}
export function useLuck() {
  return useQuery({ queryKey: ['luck'], queryFn: () => api!.luck(), enabled: isLive });
}
export function useCollection() {
  return useQuery({ queryKey: ['collection'], queryFn: () => api!.getCollection(), enabled: isLive });
}
export function useFeed(limit = 8) {
  return useQuery({ queryKey: ['feed', limit], queryFn: () => api!.feed(limit), enabled: isLive, refetchInterval: 20_000 });
}

export function usePull() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api!.pull(),
    onSuccess: () => {
      for (const key of ['wallet', 'luck', 'collection', 'feed']) qc.invalidateQueries({ queryKey: [key] });
    },
  });
}

/** Ten pulls in a row. Keeps the cards that came before an error (e.g. coins ran out). */
export function usePullMany() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (n: number) => rollMany(() => api!.pull(), n),
    onSettled: () => {
      for (const key of ['wallet', 'luck', 'collection', 'feed']) qc.invalidateQueries({ queryKey: [key] });
    },
  });
}

export const useDailyStatus = () => useQuery({ queryKey: ['daily'], queryFn: () => api!.dailyStatus(), enabled: isLive });

export function useClaimDaily() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api!.claimDaily(),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['wallet'] });
      qc.invalidateQueries({ queryKey: ['daily'] });
    },
  });
}

// ---------------------------------------------------------------- mural rows
export interface FeedRow {
  id: string;
  player: { name: string; initials: string; hue: number };
  card: string;
  odds_n: number;
  ago: string;
}

function hueOf(s: string) {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % 360;
}

function ago(fromIso: string, now: number) {
  const min = Math.max(0, Math.round((now - new Date(fromIso).getTime()) / 60_000));
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  return h < 24 ? `há ${h} h` : `há ${Math.round(h / 24)} d`;
}

export function toFeedRow(e: FeedEvent, now: number): FeedRow {
  const name = e.player.nickname;
  return {
    id: String(e.id),
    player: { name, initials: name.slice(0, 2).toUpperCase(), hue: hueOf(name) },
    card: e.card.title,
    odds_n: Number(e.odds_n_at_pull),
    ago: ago(e.created_at, now),
  };
}

// ---------------------------------------------------------------- remaining pages
import { fetchAllowedEmails, fetchMySuggestions, fetchRole, fetchShop, myUserId } from './client';
import type { RankingKind } from './types';

function useInvalidate() {
  const qc = useQueryClient();
  return (...keys: string[]) => keys.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
}

export const useRanking = (kind: RankingKind) =>
  useQuery({ queryKey: ['ranking', kind], queryFn: () => api!.ranking(kind), enabled: isLive });
export const useMyProfile = () =>
  useQuery({ queryKey: ['profile', 'me'], queryFn: async () => api!.profile((await myUserId())!), enabled: isLive });
export const useShop = () => useQuery({ queryKey: ['shop'], queryFn: fetchShop, enabled: isLive });
export const useGameLimits = () => useQuery({ queryKey: ['limits'], queryFn: () => api!.gameLimits(), enabled: isLive });
export const useMySuggestions = () => useQuery({ queryKey: ['suggestions'], queryFn: fetchMySuggestions, enabled: isLive });
export const useRole = () => useQuery({ queryKey: ['role'], queryFn: fetchRole, enabled: isLive });
export const useAdminCards = () => useQuery({ queryKey: ['admin-cards'], queryFn: () => api!.adminListCards(), enabled: isLive });
export const useAllowedEmails = () => useQuery({ queryKey: ['emails'], queryFn: fetchAllowedEmails, enabled: isLive });

export function useShopActions() {
  const inv = useInvalidate();
  const done = () => inv('shop', 'wallet', 'luck');
  return {
    buyItem: useMutation({ mutationFn: (id: string) => api!.buyItem(id), onSuccess: done }),
    usePotion: useMutation({ mutationFn: (id: string) => api!.usePotion(id), onSuccess: done }),
    buyTitle: useMutation({ mutationFn: (id: string) => api!.buyTitle(id), onSuccess: done }),
  };
}
export function useCreateSuggestion() {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: async (v: { text: string; image?: File | null }) => {
      const path = v.image ? await uploadImage('suggestions', v.image) : null;
      return api!.createSuggestion(v.text, path);
    },
    onSuccess: () => inv('suggestions'),
  });
}

/** Profile edits: nickname, bio, title, banner. A banner file is uploaded first and its path saved. */
export function useUpdateProfile() {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: async (v: { nickname?: string; bio?: string; title_id?: string | null; banner?: File }) => {
      const { banner, ...rest } = v;
      const p: Record<string, unknown> = { ...rest };
      if (banner) p.banner_url = await uploadImage('profile', banner);
      return api!.updateProfile(p);
    },
    onSuccess: () => inv('profile', 'wallet', 'ranking', 'feed'),
  });
}

/** Coins changed by a minigame: refresh the balance and the daily limits. */
export function useGameDone() {
  const inv = useInvalidate();
  return () => inv('wallet', 'limits');
}
export function useAdminActions() {
  const inv = useInvalidate();
  return {
    setActive: useMutation({ mutationFn: (v: { id: string; active: boolean }) => api!.adminSetCardActive(v.id, v.active), onSuccess: () => inv('admin-cards') }),
    upsertCard: useMutation({
      mutationFn: async (p: { title: string; joke: string; odds_n: number; image?: File | null }) => {
        const image_path = p.image ? await uploadImage('cards', p.image) : undefined;
        return api!.adminUpsertCard({ title: p.title, joke: p.joke, odds_n: p.odds_n, ...(image_path ? { image_path } : {}) });
      },
      onSuccess: () => inv('admin-cards', 'collection'),
    }),
    setImage: useMutation({
      mutationFn: async (p: { card: { id: string; title: string; joke: string; odds_n: number }; image: File }) => {
        const image_path = await uploadImage('cards', p.image);
        return api!.adminUpsertCard({ id: p.card.id, title: p.card.title, joke: p.card.joke, odds_n: p.card.odds_n, image_path });
      },
      onSuccess: () => inv('admin-cards', 'collection'),
    }),
    addEmail: useMutation({ mutationFn: (e: string) => api!.adminAddEmail(e), onSuccess: () => inv('emails') }),
    removeEmail: useMutation({ mutationFn: (e: string) => api!.adminRemoveEmail(e), onSuccess: () => inv('emails') }),
  };
}

/** Avatar chip for a real player: initials and a stable color from the nickname. */
export const playerChip = (id: string, nickname: string) => ({ id, name: nickname, initials: nickname.slice(0, 2).toUpperCase(), hue: hueOf(nickname), title: null as string | null });

/** Trades repeated cards for coins, one card at a time. Keeps what worked if one fails. */
export function useRecycle() {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: async (list: { id: string; quantity: number }[]) => {
      let gained = 0;
      for (const it of list) gained += Number((await api!.recycle(it.id, it.quantity)).gained);
      return { gained };
    },
    onSettled: () => inv('wallet', 'collection', 'ranking', 'profile'),
  });
}
