// The site's only door to the database: every call is a Supabase RPC.
// Rpc is injected so tests can run without a server.
import { ApiError, type ApiErrorCode } from './errors';
import type { CardContent, CardLocked, FeedEvent, FriendStatus, GameId, PlayerSummary, PullResult, RankingEntry, RankingKind } from './types';

export type Rpc = (fn: string, args?: object) => Promise<{ data: unknown; error: { message: string } | null }>;
/** Turns private storage paths into short-lived urls. Returns path -> url. */
export type Sign = (bucket: 'cards' | 'profile' | 'suggestions', paths: string[]) => Promise<Record<string, string>>;

/** Pulls up to n times, one after the other. Stops at the first error and keeps what came before. */
export async function rollMany<T>(pull: () => Promise<T>, n: number): Promise<{ results: T[]; error: unknown }> {
  const results: T[] = [];
  for (let i = 0; i < n; i++) {
    try {
      results.push(await pull());
    } catch (error) {
      return { results, error };
    }
  }
  return { results, error: null };
}

const KNOWN: ApiErrorCode[] = [
  'insufficient_coins', 'not_found', 'forbidden', 'not_invited', 'banned', 'invalid',
  'nickname_taken', 'already_claimed', 'session_expired', 'not_authenticated',
];

type DbCard = CardLocked & { number?: number; title?: string; joke?: string; image_path?: string | null };

export type AlbumCardLocked = CardLocked & { number: number };
export type AlbumCard = CardContent & { number: number };
export type AlbumEntry =
  | { owned: true; card: AlbumCard; quantity: number }
  | { owned: false; card: AlbumCardLocked; quantity: 0 };

function fullCard(c: DbCard, urls: Record<string, string> = {}): AlbumCard {
  const image_url = c.image_path ? urls[c.image_path] ?? null : null;
  return { id: c.id, number: c.number ?? 0, odds_n: Number(c.odds_n), active: c.active, title: c.title ?? '', joke: c.joke ?? '', image_url };
}
function lockedCard(c: DbCard): AlbumCardLocked {
  return { id: c.id, number: c.number ?? 0, odds_n: Number(c.odds_n), active: c.active };
}

export interface DbSession {
  user_id: string;
  email: string;
  access: 'ok' | 'not_invited' | 'banned';
}
export interface Luck {
  effective: number;
  potions: number;
  streak: number;
}

/** Another player's card: full when the viewer owns it too, else only number and rarity. */
export type PlayerCard =
  | { known: true; quantity: number; card: AlbumCard }
  | { known: false; quantity: number; card: AlbumCardLocked };

export type FriendPlayer = PlayerSummary & { friend?: FriendStatus };
export interface Friends {
  friends: FriendPlayer[];
  incoming: FriendPlayer[];
  outgoing: FriendPlayer[];
}

/** A row of the admin player list (the admin sees every profile field). */
export interface AdminPlayer {
  id: string;
  nickname: string;
  email: string;
  avatar_url: string | null;
  coins: number;
  role: 'player' | 'admin';
  banned: boolean;
  cards_owned: number;
}

export interface ProfileView {
  profile: { id: string; nickname: string; avatar_url: string | null; title_name: string | null; bio: string; banner_url: string | null; showcase: DbCard[]; level?: number };
  friend?: FriendStatus;
  stats: { pulls: number; collection_pct: number; rarest_odds: number | null };
  titles: { id: string; name: string }[];
  is_me: boolean;
}

export function createApi(rpc: Rpc, sign?: Sign) {
  async function signPaths(bucket: Parameters<Sign>[0], paths: (string | null | undefined)[]) {
    const list = [...new Set(paths.filter((p): p is string => !!p && !/^https?:/.test(p)))];
    if (!sign || list.length === 0) return {} as Record<string, string>;
    return sign(bucket, list).catch(() => ({}) as Record<string, string>);
  }
  const cardUrls = (cards: DbCard[]) => signPaths('cards', cards.map((c) => c.image_path));
  // Avatars are either a Google photo (full url, kept) or a file in the profile bucket (signed).
  const avatarUrl = (p: string | null | undefined, pics: Record<string, string>) => (p ? pics[p] ?? (/^https?:/.test(p) ? p : null) : null);
  async function withAvatars<P extends { avatar_url: string | null }>(players: P[]): Promise<P[]> {
    const pics = await signPaths('profile', players.map((p) => p.avatar_url));
    return players.map((p) => ({ ...p, avatar_url: avatarUrl(p.avatar_url, pics) }));
  }

  async function call<T>(fn: string, args?: object): Promise<T> {
    const { data, error } = await rpc(fn, args);
    if (error) {
      const code = KNOWN.find((k) => error.message === k) ?? 'unknown';
      throw new ApiError(code, error.message);
    }
    return data as T;
  }

  return {
    session: () => call<DbSession>('my_session'),
    luck: () => call<Luck>('get_luck'),
    dailyStatus: () => call<{ claimed_today: boolean; next_at: string }>('get_daily_status'),
    claimDaily: () => call<{ coins_after: number }>('claim_daily'),

    async pull(): Promise<PullResult & { card: AlbumCard }> {
      const r = await call<PullResult & { card: DbCard }>('pull');
      return { ...r, card: fullCard(r.card, await cardUrls([r.card])) };
    },

    async getCollection(): Promise<AlbumEntry[]> {
      const rows = await call<{ owned: boolean; quantity: number; card: DbCard }[]>('get_collection');
      const urls = await cardUrls(rows.filter((e) => e.owned).map((e) => e.card));
      return rows.map((e) =>
        e.owned ? { owned: true, quantity: e.quantity, card: fullCard(e.card, urls) } : { owned: false, quantity: 0, card: lockedCard(e.card) },
      );
    },

    async feed(limit = 20): Promise<FeedEvent[]> {
      const rows = await call<(FeedEvent & { card: DbCard })[]>('get_feed', { p_limit: limit });
      const [urls, pics] = await Promise.all([cardUrls(rows.map((f) => f.card)), signPaths('profile', rows.map((f) => f.player?.avatar_url))]);
      return rows.map((f) => ({ ...f, card: fullCard(f.card, urls), player: f.player && { ...f.player, avatar_url: avatarUrl(f.player.avatar_url, pics) } }));
    },

    async ranking(kind: RankingKind): Promise<RankingEntry[]> {
      const rows = (await call<RankingEntry[] | null>('get_ranking', { p_kind: kind })) ?? [];
      const pics = await signPaths('profile', rows.map((r) => r.player.avatar_url));
      return rows.map((r) => ({ ...r, player: { ...r.player, avatar_url: avatarUrl(r.player.avatar_url, pics) } }));
    },
    level: () => call<{ xp: number; level: number; level_start: number; next_at: number; reward: number }>('get_level'),

    // friends and other players
    async searchPlayers(query: string): Promise<FriendPlayer[]> {
      return withAvatars((await call<FriendPlayer[] | null>('search_players', { p_query: query })) ?? []);
    },
    sendFriend: (userId: string) => call<{ status: FriendStatus }>('send_friend_request', { p_user: userId }),
    respondFriend: (userId: string, accept: boolean) => call<{ status: FriendStatus }>('respond_friend_request', { p_user: userId, p_accept: accept }),
    removeFriend: (userId: string) => call<{ status: FriendStatus }>('remove_friend', { p_user: userId }),
    async friends(): Promise<Friends> {
      const r = (await call<Partial<Record<keyof Friends, FriendPlayer[] | null>> | null>('get_friends')) ?? {};
      const [friends, incoming, outgoing] = await Promise.all([withAvatars(r.friends ?? []), withAvatars(r.incoming ?? []), withAvatars(r.outgoing ?? [])]);
      return { friends, incoming, outgoing };
    },
    async playerCollection(userId: string): Promise<PlayerCard[]> {
      const rows = (await call<{ quantity: number; card: DbCard }[] | null>('get_player_collection', { p_user: userId })) ?? [];
      const urls = await cardUrls(rows.filter((r) => 'title' in r.card).map((r) => r.card));
      return rows.map((r) =>
        'title' in r.card
          ? { known: true, quantity: r.quantity, card: fullCard(r.card, urls) }
          : { known: false, quantity: r.quantity, card: lockedCard(r.card) },
      );
    },
    claimLevel: () => call<{ gained: number; level: number; coins_after: number }>('claim_level_reward'),
    gameLimits: () => call<Record<GameId, { limit: number; earned_today: number }>>('get_game_limits'),
    playSlots: (bet: number) => call<{ reels: string[]; payout: number; capped: boolean; coins_after: number }>('play_slots', { p_bet: bet }),
    recycle: (cardId: string, quantity: number) => call<{ gained: number; coins_after: number }>('recycle', { p_card: cardId, p_quantity: quantity }),
    buyItem: (id: string) => call<{ coins_after: number }>('buy_item', { p_item: id }),
    usePotion: (id: string) => call<object>('use_potion', { p_item: id }),
    buyTitle: (id: string) => call<{ coins_after: number }>('buy_title', { p_title: id }),
    createSuggestion: (text: string, imagePath: string | null = null) =>
      call<object>('create_suggestion', imagePath ? { p_text: text, p_image_path: imagePath } : { p_text: text }),
    async profile(userId: string): Promise<ProfileView> {
      const v = await call<ProfileView>('get_profile', { p_user: userId });
      if (!v?.profile) return v;
      const [pics, cards] = await Promise.all([
        signPaths('profile', [v.profile.banner_url, v.profile.avatar_url]),
        cardUrls(v.profile.showcase ?? []),
      ]);
      const url = (p: string | null) => (p ? pics[p] ?? (/^https?:/.test(p) ? p : null) : null);
      return {
        ...v,
        profile: { ...v.profile, banner_url: url(v.profile.banner_url), avatar_url: url(v.profile.avatar_url), showcase: (v.profile.showcase ?? []).map((c) => ({ ...c, image_url: fullCard(c, cards).image_url })) },
      };
    },
    updateProfile: (p: Record<string, unknown>) => call<object>('update_profile', { p }),

    // minigames: the server keeps the secrets and the clock
    startMemory: () => call<{ session_id: string; size: number }>('start_memory'),
    flipMemory: (session: string, index: number) =>
      call<{ index: number; symbol: string; matched: [number, number] | null; finished: boolean; moves: number; payout: number | null; coins_after: number | null }>('flip_memory', { p_session: session, p_index: index }),
    startReflex: () => call<{ session_id: string; delay_ms: number }>('start_reflex'),
    finishReflex: (session: string) =>
      call<{ valid: boolean; reaction_ms: number; payout: number; capped: boolean; coins_after: number }>('finish_reflex', { p_session: session }),
    startClicker: () => call<{ session_id: string; duration_ms: number }>('start_clicker'),
    finishClicker: (session: string, clicks: number) =>
      call<{ valid: boolean; clicks: number; payout: number; capped: boolean; coins_after: number }>('finish_clicker', { p_session: session, p_clicks: clicks }),

    // admin
    async adminListCards(): Promise<AlbumCard[]> {
      const rows = (await call<DbCard[] | null>('admin_list_cards')) ?? [];
      const urls = await cardUrls(rows);
      return rows.map((c) => fullCard(c, urls));
    },
    adminUpsertCard: (p: { id?: string; title: string; joke: string; odds_n: number; image_path?: string }) => call<object>('admin_upsert_card', { p }),
    adminSetCardActive: (id: string, active: boolean) => call<void>('admin_set_card_active', { p_card: id, p_active: active }),
    adminDeleteCard: (id: string) => call<{ owners: number; image_path: string | null }>('admin_delete_card', { p_card: id }),
    async adminListPlayers(): Promise<AdminPlayer[]> {
      const rows = (await call<AdminPlayer[] | null>('admin_list_players')) ?? [];
      const pics = await signPaths('profile', rows.map((p) => p.avatar_url));
      return rows.map((p) => ({ ...p, coins: Number(p.coins), avatar_url: avatarUrl(p.avatar_url, pics) }));
    },
    adminSetCoins: (userId: string, coins: number, reason: string) =>
      call<{ coins_after: number }>('admin_set_coins', { p_user: userId, p_coins: coins, p_reason: reason }),
    adminAdjustCoins: (userId: string, amount: number, reason: string) =>
      call<{ coins_after: number }>('admin_adjust_coins', { p_user: userId, p_amount: amount, p_reason: reason }),
    adminAddEmail: (email: string) => call<void>('admin_add_allowed_email', { p_email: email }),
    adminRemoveEmail: (email: string) => call<void>('admin_remove_allowed_email', { p_email: email }),
  };
}

export type Api = ReturnType<typeof createApi>;
