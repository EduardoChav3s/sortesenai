// React Query hooks over the real database. In demo mode (no Supabase keys) they stay idle
// and pages keep showing the sample data from src/design/sample.ts.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, copyIdeaPhotoToCards, fetchWallet, removeImage, uploadImage } from './client';
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
      for (const key of ['wallet', 'luck', 'collection', 'feed', 'level', 'missions']) qc.invalidateQueries({ queryKey: [key] });
    },
  });
}

/** Ten pulls in a row. Keeps the cards that came before an error (e.g. coins ran out). */
export function usePullMany() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (n: number) => rollMany(() => api!.pull(), n),
    onSettled: () => {
      for (const key of ['wallet', 'luck', 'collection', 'feed', 'level', 'missions']) qc.invalidateQueries({ queryKey: [key] });
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
      qc.invalidateQueries({ queryKey: ['level'] });
      qc.invalidateQueries({ queryKey: ['missions'] });
    },
  });
}

// ---------------------------------------------------------------- mural rows
export interface FeedRow {
  id: string;
  player: { id: string; name: string; initials: string; hue: number; avatar: string | null };
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
    player: { id: e.player.id, name, initials: name.slice(0, 2).toUpperCase(), hue: hueOf(name), avatar: e.player.avatar_url ?? null },
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
export const useAdminSuggestions = (status: 'pending' | 'approved' | 'rejected') =>
  useQuery({ queryKey: ['admin-suggestions', status], queryFn: () => api!.adminListSuggestions(status), enabled: isLive });
export const useAdminPlayers = () => useQuery({ queryKey: ['admin-players'], queryFn: () => api!.adminListPlayers(), enabled: isLive });
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
    mutationFn: async (v: { nickname?: string; bio?: string; title_id?: string | null; showcase?: string[]; banner?: File; photo?: File }) => {
      const { banner, photo, ...rest } = v;
      const p: Record<string, unknown> = { ...rest };
      if (banner) p.banner_url = await uploadImage('profile', banner);
      if (photo) p.avatar_url = await uploadImage('profile', photo);
      return api!.updateProfile(p);
    },
    onSuccess: () => inv('profile', 'wallet', 'ranking', 'feed'),
  });
}

/** Coins changed by a minigame: refresh the balance and the daily limits. */
export function useGameDone() {
  const inv = useInvalidate();
  return () => inv('wallet', 'limits', 'level', 'missions');
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
    editCard: useMutation({
      mutationFn: async (p: { id: string; title: string; joke: string; odds_n: number; image?: File | null }) => {
        const image_path = p.image ? await uploadImage('cards', p.image) : undefined;
        return api!.adminUpsertCard({ id: p.id, title: p.title, joke: p.joke, odds_n: p.odds_n, ...(image_path ? { image_path } : {}) });
      },
      onSuccess: () => inv('admin-cards', 'collection', 'feed'),
    }),
    deleteCard: useMutation({
      mutationFn: async (id: string) => {
        const r = await api!.adminDeleteCard(id);
        if (r.image_path) await removeImage('cards', r.image_path).catch(() => undefined);
        return r;
      },
      onSettled: () => inv('admin-cards', 'collection', 'feed', 'ranking', 'level', 'profile'),
    }),
    approveIdea: useMutation({
      mutationFn: async (v: { id: string; title: string; joke: string; odds_n: number; image_path: string | null; usePhoto: boolean }) => {
        const card = await api!.adminApproveSuggestion(v.id, v.title, v.joke, v.odds_n);
        // The idea's photo lives in the suggestions bucket; the card needs its own copy in the cards bucket.
        const image_path = v.usePhoto && v.image_path ? await copyIdeaPhotoToCards(v.image_path).catch(() => null) : null;
        if (image_path || card.image_path) {
          await api!.adminUpsertCard({ id: card.id, title: v.title, joke: v.joke, odds_n: v.odds_n, image_path: image_path ?? '' });
        }
        return { card, photoCopied: !!image_path };
      },
      onSettled: () => inv('admin-suggestions', 'admin-cards', 'collection'),
    }),
    rejectIdea: useMutation({
      mutationFn: (v: { id: string; note: string }) => api!.adminRejectSuggestion(v.id, v.note),
      onSettled: () => inv('admin-suggestions'),
    }),
    setBanned: useMutation({
      mutationFn: (v: { id: string; banned: boolean }) => api!.adminSetBanned(v.id, v.banned),
      onSettled: () => inv('admin-players', 'ranking', 'friends', 'players'),
    }),
    setCoins: useMutation({
      mutationFn: (v: { id: string; coins: number; reason: string }) => api!.adminSetCoins(v.id, v.coins, v.reason),
      onSettled: () => inv('admin-players', 'wallet', 'ranking'),
    }),
    adjustCoins: useMutation({
      mutationFn: (v: { id: string; amount: number; reason: string }) => api!.adminAdjustCoins(v.id, v.amount, v.reason),
      onSettled: () => inv('admin-players', 'wallet', 'ranking'),
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
export const playerChip = (id: string, nickname: string, avatar: string | null = null) => ({ id, name: nickname, initials: nickname.slice(0, 2).toUpperCase(), hue: hueOf(nickname), title: null as string | null, avatar });

/** Account level: XP, progress to the next level and coins waiting to be claimed. */
export const useLevel = () => useQuery({ queryKey: ['level'], queryFn: () => api!.level(), enabled: isLive });
export function useClaimLevel() {
  const inv = useInvalidate();
  return useMutation({ mutationFn: () => api!.claimLevel(), onSettled: () => inv('level', 'wallet') });
}

/** Trades repeated cards for coins, one card at a time. Keeps what worked if one fails. */
export function useRecycle() {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: async (list: { id: string; quantity: number }[]) => {
      let gained = 0;
      for (const it of list) gained += Number((await api!.recycle(it.id, it.quantity)).gained);
      return { gained };
    },
    onSettled: () => inv('wallet', 'collection', 'ranking', 'profile', 'level', 'missions'),
  });
}

// ---------------------------------------------------------------- friends and other players
/** Friends, requests I got and requests I sent. Polls so a new request shows up on its own. */
export const useFriends = () => useQuery({ queryKey: ['friends'], queryFn: () => api!.friends(), enabled: isLive, refetchInterval: 30_000 });
export const useSearchPlayers = (query: string) =>
  useQuery({ queryKey: ['players', query], queryFn: () => api!.searchPlayers(query), enabled: isLive, placeholderData: (prev) => prev });
export const usePlayer = (id: string) => useQuery({ queryKey: ['player', id], queryFn: () => api!.profile(id), enabled: isLive && !!id });
export const usePlayerCollection = (id: string) =>
  useQuery({ queryKey: ['player-collection', id], queryFn: () => api!.playerCollection(id), enabled: isLive && !!id });

export function useFriendActions() {
  const inv = useInvalidate();
  const done = () => inv('friends', 'players', 'player');
  return {
    send: useMutation({ mutationFn: (id: string) => api!.sendFriend(id), onSettled: done }),
    respond: useMutation({ mutationFn: (v: { id: string; accept: boolean }) => api!.respondFriend(v.id, v.accept), onSettled: done }),
    remove: useMutation({ mutationFn: (id: string) => api!.removeFriend(id), onSettled: done }),
  };
}

// ---------------------------------------------------------------- gifts, trades, duels, missions, weekly event
export const useGifts = () => useQuery({ queryKey: ['gifts'], queryFn: () => api!.gifts(), enabled: isLive, refetchInterval: 30_000 });
export const useTrades = () => useQuery({ queryKey: ['trades'], queryFn: () => api!.trades(), enabled: isLive, refetchInterval: 30_000 });
export const useChallenges = () => useQuery({ queryKey: ['challenges'], queryFn: () => api!.challenges(), enabled: isLive, refetchInterval: 30_000 });
export const useMissions = () => useQuery({ queryKey: ['missions'], queryFn: () => api!.missions(), enabled: isLive });
export const useWeeklyEvent = () => useQuery({ queryKey: ['event'], queryFn: () => api!.weeklyEvent(), enabled: isLive, staleTime: 5 * 60_000 });

export function useSocialActions() {
  const inv = useInvalidate();
  const cards = () => inv('collection', 'player-collection', 'trades', 'gifts', 'missions', 'level');
  const duel = () => inv('challenges', 'wallet');
  return {
    gift: useMutation({ mutationFn: (v: { to: string; card: string }) => api!.giftCard(v.to, v.card), onSettled: cards }),
    propose: useMutation({ mutationFn: (v: { to: string; give: string; want: string }) => api!.proposeTrade(v.to, v.give, v.want), onSettled: cards }),
    respondTrade: useMutation({ mutationFn: (v: { id: string; accept: boolean }) => api!.respondTrade(v.id, v.accept), onSettled: cards }),
    cancelTrade: useMutation({ mutationFn: (id: string) => api!.cancelTrade(id), onSettled: cards }),
    challenge: useMutation({ mutationFn: (v: { to: string; bet: number }) => api!.createChallenge(v.to, v.bet), onSettled: duel }),
    respondChallenge: useMutation({ mutationFn: (v: { id: string; accept: boolean }) => api!.respondChallenge(v.id, v.accept), onSettled: duel }),
    cancelChallenge: useMutation({ mutationFn: (id: string) => api!.cancelChallenge(id), onSettled: duel }),
  };
}

export function useClaimMission() {
  const inv = useInvalidate();
  return useMutation({ mutationFn: (id: string) => api!.claimMission(id), onSettled: () => inv('missions', 'wallet', 'level') });
}

// ---------------------------------------------------------------- music
import { musicUrl, removeAudio, uploadAudio } from './client';
import type { MusicSlot, Track } from './api';
export type PlayableTrack = Track & { url: string };
const playable = (t: Track): PlayableTrack => ({ ...t, url: musicUrl(t.path) });

/** Songs for the sign-in page. Works before sign-in (the bucket is public). */
export const useLoginMusic = () =>
  useQuery({ queryKey: ['music', 'login'], queryFn: async () => (await api!.loginMusic()).map(playable), enabled: isLive, staleTime: 10 * 60_000, retry: 0 });
export const useRareMusic = () =>
  useQuery({
    queryKey: ['music', 'rare'],
    queryFn: async () => {
      const r = await api!.rareMusic();
      return { lendario: r.lendario.map(playable), mitico: r.mitico.map(playable) };
    },
    enabled: isLive,
    staleTime: 10 * 60_000,
  });
export const useAdminTracks = () => useQuery({ queryKey: ['music', 'admin'], queryFn: async () => (await api!.adminListTracks()).map(playable), enabled: isLive });

export function useMusicActions() {
  const inv = useInvalidate();
  return {
    add: useMutation({
      mutationFn: async (v: { title: string; slot: MusicSlot; file: File }) => {
        const path = await uploadAudio(v.slot, v.file);
        try {
          return await api!.adminAddTrack(v.title, path, v.slot);
        } catch (e) {
          await removeAudio(path).catch(() => undefined); // no orphan file if saving the row fails
          throw e;
        }
      },
      onSettled: () => inv('music'),
    }),
    remove: useMutation({
      mutationFn: async (id: string) => {
        const r = await api!.adminDeleteTrack(id);
        await removeAudio(r.path).catch(() => undefined);
        return r;
      },
      onSettled: () => inv('music'),
    }),
  };
}
