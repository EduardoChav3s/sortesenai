// The site's only door to the database: every call is a Supabase RPC.
// Rpc is injected so tests can run without a server.
import { ApiError, type ApiErrorCode } from './errors';
import type { CardContent, CardLocked, FeedEvent, FriendStatus, GameId, PlayerSummary, PullResult, RankingEntry, RankingKind } from './types';

export type Rpc = (fn: string, args?: object) => Promise<{ data: unknown; error: { message: string } | null }>;
/** Turns private storage paths into short-lived urls. Returns path -> url. */
export type Sign = (bucket: 'cards' | 'profile' | 'suggestions' | 'chat', paths: string[]) => Promise<Record<string, string>>;

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
  'nickname_taken', 'already_claimed', 'session_expired', 'not_authenticated', 'slow_down', 'missing_materials',
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

/** A card as the viewer may see it: full when they own a copy, else only number and rarity. */
export type SeenCard = { known: true; card: AlbumCard } | { known: false; card: AlbumCardLocked };
type Who = PlayerSummary;
export interface Gift { id: number; from: Who; card: SeenCard; created_at: string }
export interface Trade { id: string; status: 'pending' | 'accepted' | 'declined' | 'cancelled'; created_at: string; from: Who; to: Who; give: SeenCard; want: SeenCard }
export interface Challenge {
  id: string;
  status: 'pending' | 'done' | 'declined' | 'cancelled';
  bet: number;
  created_at: string;
  decided_at: string | null;
  from: Who;
  to: Who;
  winner: string | null;
  draws_from: SeenCard[];
  draws_to: SeenCard[];
}
export interface Mission { id: string; title: string; goal: number; coins: number; xp: number; progress: number; claimed: boolean }
export interface WeeklyEvent { card: SeenCard; multiplier: number; starts_at: string; ends_at: string }

export type MusicSlot = 'login' | 'lendario' | 'mitico';
export interface Track { id: string; title: string; path: string; slot: MusicSlot; created_at: string }

/** An idea sent by a player, as the admin sees it. image_path stays raw so the photo can be copied to the card. */
export interface AdminSuggestion {
  id: string;
  text: string;
  image_path: string | null;
  image_url: string | null;
  status: 'pending' | 'approved' | 'rejected';
  admin_note: string | null;
  created_at: string;
  author: { id: string; nickname: string; avatar_url: string | null } | null;
}

// ---------------------------------------------------------------- live chat
export type ChatKind = 'text' | 'image' | 'offer' | 'coins' | 'system';
export interface ChatBid { id: number; status: 'open' | 'accepted' | 'rejected'; coins: number; created_at: string; bidder: PlayerSummary; card: AlbumCard | null }
export interface ChatMessage {
  id: number;
  kind: ChatKind;
  body: string | null;
  image_url: string | null;
  created_at: string;
  author: PlayerSummary;
  card: AlbumCard | null;
  price: number | null;
  to: PlayerSummary | null;
  amount: number | null;
  status: 'open' | 'done' | 'cancelled' | null;
  buyer: PlayerSummary | null;
  /** An open offer whose seller still has a spare copy. */
  available: boolean;
  bids: ChatBid[];
}
type DbChatBid = Omit<ChatBid, 'card' | 'coins'> & { card: DbCard | null; coins: number | string };
type DbChat = Omit<ChatMessage, 'image_url' | 'card' | 'price' | 'amount' | 'bids'> & {
  image_path: string | null; card: DbCard | null; price: number | string | null; amount: number | string | null; bids: DbChatBid[] | null;
};
const num = (v: number | string | null) => (v === null ? null : Number(v));

// ---------------------------------------------------------------- artifacts and fragments
export type Attribute = 'luck' | 'xp' | 'money';
export interface AttributeValue { base: number; amp: number; value: number }
export interface Fragment { id: string; name: string; color: string; quantity: number }
export interface SpareCard { card: AlbumCard; spares: number; gives: { fragment_type: string; name: string; color: string; amount: number } | null }
export interface ConvertResult { card: string; copies: number; fragment: string; color: string; gained: number }
export interface RecipeLine { fragment_type: string; name: string; color: string; amount: number; have: number }
export interface Artifact {
  id: string; name: string; description: string; image_url: string | null; rarity: string;
  luck_mult: number; xp_mult: number; money_mult: number; active: boolean; recipe: RecipeLine[];
}
export type ForgeArtifact = Artifact & { can_craft: boolean; owned: number };
export type MyArtifact = Artifact & { user_artifact_id: number; equipped: boolean; crafted_at: string };
export interface AdminArtifact {
  id: string; name: string; description: string; image_url: string | null; image_path: string | null; rarity: string;
  luck_mult: number; xp_mult: number; money_mult: number; active: boolean; owners: number; recipe: { fragment_type: string; amount: number }[];
}
export interface FragmentType { id: string; name: string; color: string; active: boolean; sort: number }
export interface ArtifactConfig {
  artifacts: AdminArtifact[];
  fragment_types: FragmentType[];
  rules: { tier: string; fragment_type: string | null; amount: number }[];
  blocked_cards: { id: string; title: string; number: number; odds_n: number }[];
  slots: number;
}
const numArtifact = <A extends { luck_mult: unknown; xp_mult: unknown; money_mult: unknown }>(a: A): A => ({
  ...a, luck_mult: Number(a.luck_mult), xp_mult: Number(a.xp_mult), money_mult: Number(a.money_mult),
});

// ---------------------------------------------------------------- the bell and the daily chest
export interface Notice { id: number; kind: string; body: string; link: string | null; read: boolean; created_at: string }
export interface ChestPrize { id: string; kind: 'coins' | 'fragments' | 'potion'; amount: number; label: string; chance: number }
export interface ChestResult { prize: { id: string | null; kind: string; amount: number; label: string; coins_given: number | null }; coins_after: number }
export interface AdminChestPrize {
  id: string; kind: 'coins' | 'fragments' | 'potion'; amount: number; fragment_type: string | null; item_id: string | null;
  weight: number; active: boolean; label: string; chance: number | null;
}

export interface ServerOwnerStatus { owner: boolean; last_reset?: { at: string; by: string | null; details: { players: number; cards_removed: number; coins_removed: number } } | null }
export interface ShopItemRow { id: string; name: string; description: string; price: number; multiplier: number; duration_minutes: number | null; duration_pulls: number | null; active: boolean; image_url: string | null; image_path: string | null; attribute?: 'luck' | 'xp' | 'money' }
export interface ShopTitleRow { id: string; name: string; description: string; price: number | null; active: boolean; condition: { type: string } & Record<string, unknown> }

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
  const isFull = (c: DbCard) => typeof c.title === 'string';
  async function seen(cards: DbCard[]) {
    const urls = await cardUrls(cards.filter(isFull));
    return (c: DbCard): SeenCard => (isFull(c) ? { known: true, card: fullCard(c, urls) } : { known: false, card: lockedCard(c) });
  }
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

    /** Every active card in full, for the roll's reel (the album still hides missing cards). */
    async reelCards(): Promise<AlbumCard[]> {
      const rows = (await call<DbCard[] | null>('get_reel_cards')) ?? [];
      const urls = await cardUrls(rows);
      return rows.map((c) => fullCard(c, urls));
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
    async adminListSuggestions(status: 'pending' | 'approved' | 'rejected'): Promise<AdminSuggestion[]> {
      const rows = (await call<AdminSuggestion[] | null>('admin_list_suggestions', { p_status: status })) ?? [];
      const [pics, avatars] = await Promise.all([
        signPaths('suggestions', rows.map((r) => r.image_path)),
        signPaths('profile', rows.map((r) => r.author?.avatar_url)),
      ]);
      return rows.map((r) => ({
        ...r,
        image_url: r.image_path ? pics[r.image_path] ?? null : null,
        author: r.author && { ...r.author, avatar_url: avatarUrl(r.author.avatar_url, avatars) },
      }));
    },
    adminApproveSuggestion: (id: string, title: string, joke: string, odds_n: number) =>
      call<DbCard>('admin_approve_suggestion', { p_id: id, p_title: title, p_joke: joke, p_odds_n: odds_n }),
    adminRejectSuggestion: (id: string, note: string) => call<void>('admin_reject_suggestion', { p_id: id, p_note: note }),
    adminSetRole: (userId: string, role: 'player' | 'admin') => call<{ id: string; role: 'player' | 'admin' }>('admin_set_role', { p_user: userId, p_role: role }),
    adminSetBanned: (userId: string, banned: boolean) => call<void>('admin_set_banned', { p_user: userId, p_banned: banned }),
    // gifts, trades and duels between friends
    giftCard: (to: string, cardId: string) => call<{ quantity_left: number }>('gift_card', { p_to: to, p_card: cardId }),
    async gifts(): Promise<Gift[]> {
      const rows = (await call<(Omit<Gift, 'card'> & { card: DbCard })[] | null>('get_gifts')) ?? [];
      const view = await seen(rows.map((r) => r.card));
      return rows.map((r) => ({ ...r, card: view(r.card) }));
    },
    proposeTrade: (to: string, give: string, want: string) => call<{ id: string; status: string }>('propose_trade', { p_to: to, p_give: give, p_want: want }),
    respondTrade: (id: string, accept: boolean) => call<{ id: string; status: string }>('respond_trade', { p_trade: id, p_accept: accept }),
    cancelTrade: (id: string) => call<{ id: string; status: string }>('cancel_trade', { p_trade: id }),
    async trades(): Promise<{ incoming: Trade[]; outgoing: Trade[] }> {
      type Raw = Omit<Trade, 'give' | 'want'> & { give: DbCard; want: DbCard };
      const r = (await call<{ incoming?: Raw[] | null; outgoing?: Raw[] | null } | null>('get_trades')) ?? {};
      const all = [...(r.incoming ?? []), ...(r.outgoing ?? [])];
      const view = await seen(all.flatMap((t) => [t.give, t.want]));
      const map = (t: Raw): Trade => ({ ...t, give: view(t.give), want: view(t.want) });
      return { incoming: (r.incoming ?? []).map(map), outgoing: (r.outgoing ?? []).map(map) };
    },
    createChallenge: (to: string, bet: number) => call<{ id: string; status: string }>('create_challenge', { p_to: to, p_bet: bet }),
    async respondChallenge(id: string, accept: boolean): Promise<Challenge | null> {
      const raw = await call<(Omit<Challenge, 'draws_from' | 'draws_to'> & { draws_from: DbCard[]; draws_to: DbCard[] }) | null>('respond_challenge', { p_id: id, p_accept: accept });
      if (!raw) return null;
      const view = await seen([...(raw.draws_from ?? []), ...(raw.draws_to ?? [])]);
      return { ...raw, bet: Number(raw.bet), draws_from: (raw.draws_from ?? []).map(view), draws_to: (raw.draws_to ?? []).map(view) };
    },
    cancelChallenge: (id: string) => call<{ id: string; status: string }>('cancel_challenge', { p_id: id }),
    async challenges(): Promise<{ incoming: Challenge[]; outgoing: Challenge[]; recent: Challenge[] }> {
      type Raw = Omit<Challenge, 'draws_from' | 'draws_to'> & { draws_from: DbCard[]; draws_to: DbCard[] };
      const r = (await call<{ incoming?: Raw[] | null; outgoing?: Raw[] | null; recent?: Raw[] | null } | null>('get_challenges')) ?? {};
      const lists = [r.incoming ?? [], r.outgoing ?? [], r.recent ?? []];
      const view = await seen(lists.flat().flatMap((c) => [...(c.draws_from ?? []), ...(c.draws_to ?? [])]));
      const map = (c: Raw): Challenge => ({ ...c, bet: Number(c.bet), draws_from: (c.draws_from ?? []).map(view), draws_to: (c.draws_to ?? []).map(view) });
      return { incoming: lists[0].map(map), outgoing: lists[1].map(map), recent: lists[2].map(map) };
    },

    // daily missions and the weekly event card
    missions: async (): Promise<Mission[]> => (await call<Mission[] | null>('get_missions')) ?? [],
    claimMission: (id: string) => call<{ coins_after: number; coins: number; xp: number }>('claim_mission', { p_id: id }),
    async weeklyEvent(): Promise<WeeklyEvent | null> {
      const r = await call<(Omit<WeeklyEvent, 'card'> & { card: DbCard }) | null>('get_event');
      if (!r?.card) return null;
      const view = await seen([r.card]);
      return { ...r, card: view(r.card) };
    },

    // music (login works before sign-in)
    loginMusic: async (): Promise<Track[]> => (await call<Track[] | null>('get_login_music')) ?? [],
    async rareMusic(): Promise<{ lendario: Track[]; mitico: Track[] }> {
      const r = (await call<{ lendario?: Track[] | null; mitico?: Track[] | null } | null>('get_rare_music')) ?? {};
      return { lendario: r.lendario ?? [], mitico: r.mitico ?? [] };
    },
    adminListTracks: async (): Promise<Track[]> => (await call<Track[] | null>('admin_list_tracks')) ?? [],
    adminAddTrack: (title: string, path: string, slot: MusicSlot) => call<Track>('admin_add_track', { p_title: title, p_path: path, p_slot: slot }),
    adminDeleteTrack: (id: string) => call<{ path: string }>('admin_delete_track', { p_id: id }),

    // game settings and shop
    adminUpdateSettings: (patch: Record<string, unknown>) => call<Record<string, unknown>>('admin_update_settings', { p_patch: patch }),
    adminMissionDefs: async (): Promise<{ id: string; title: string; goal: number; coins: number }[]> => (await call<{ id: string; title: string; goal: number; coins: number }[] | null>('admin_mission_defs')) ?? [],
    adminListItems: async (): Promise<ShopItemRow[]> => (await call<ShopItemRow[] | null>('admin_list_items')) ?? [],
    adminListTitles: async (): Promise<ShopTitleRow[]> => (await call<ShopTitleRow[] | null>('admin_list_titles')) ?? [],
    adminUpsertItem: (p: Omit<ShopItemRow, 'id' | 'image_url' | 'image_path'> & { id?: string; image_url?: string | null; image_path?: string | null }) =>
      call<ShopItemRow>('admin_upsert_item', { p }),
    adminUpsertTitle: (p: { id?: string; name: string; description: string; price: number | null; active: boolean; condition?: unknown }) =>
      call<ShopTitleRow>('admin_upsert_title', { p }),

    // live chat
    async getChat(before?: number): Promise<ChatMessage[]> {
      const rows = (await call<DbChat[] | null>('get_chat', { p_before: before ?? null })) ?? [];
      const cards = rows.flatMap((m) => [m.card, ...(m.bids ?? []).map((b) => b.card)]).filter((c): c is DbCard => !!c);
      const people = rows.flatMap((m) => [m.author, m.to, m.buyer, ...(m.bids ?? []).map((b) => b.bidder)]);
      const [urls, pics, photos] = await Promise.all([
        cardUrls(cards),
        signPaths('profile', people.map((p) => p?.avatar_url)),
        signPaths('chat', rows.map((m) => m.image_path)),
      ]);
      const who = <P extends PlayerSummary | null>(p: P): P => (p ? { ...p, avatar_url: avatarUrl(p.avatar_url, pics) } : p);
      return rows.map(({ image_path, ...m }) => ({
        ...m,
        image_url: image_path ? photos[image_path] ?? null : null,
        author: who(m.author),
        to: who(m.to),
        buyer: who(m.buyer),
        card: m.card ? fullCard(m.card, urls) : null,
        price: num(m.price),
        amount: num(m.amount),
        bids: (m.bids ?? []).map((b) => ({ ...b, coins: Number(b.coins), bidder: who(b.bidder), card: b.card ? fullCard(b.card, urls) : null })),
      }));
    },
    chatSend: (text: string | null, imagePath: string | null) => call<{ id: number }>('chat_send', { p_text: text, p_image: imagePath }),
    chatSendCoins: (to: string, amount: number, note: string | null) => call<{ id: number }>('chat_send_coins', { p_to: to, p_amount: amount, p_note: note }),
    chatOffer: (cardId: string, price: number | null, note: string | null) => call<{ id: number }>('chat_offer', { p_card: cardId, p_price: price, p_note: note }),
    chatBuy: (offer: number) => call<{ id: number }>('chat_buy', { p_offer: offer }),
    chatBid: (offer: number, cardId: string | null, coins: number) => call<{ id: number }>('chat_bid', { p_offer: offer, p_card: cardId, p_coins: coins }),
    chatAcceptBid: (bid: number) => call<{ id: number }>('chat_accept_bid', { p_bid: bid }),
    chatCancelOffer: (offer: number) => call<{ id: number }>('chat_cancel_offer', { p_offer: offer }),
    adminDeleteChatMessage: (id: number) => call<{ image_path: string | null }>('admin_delete_chat_message', { p_msg: id }),

    // artifacts and fragments (every rule is checked in the database)
    async attributes(): Promise<Record<Attribute, AttributeValue>> {
      const r = await call<Record<Attribute, AttributeValue>>('get_attributes');
      const n = (v: AttributeValue | undefined): AttributeValue => ({ base: Number(v?.base ?? 1), amp: Number(v?.amp ?? 0), value: Number(v?.value ?? 1) });
      return { luck: n(r?.luck), xp: n(r?.xp), money: n(r?.money) };
    },
    fragments: async (): Promise<Fragment[]> => ((await call<Fragment[] | null>('get_fragments')) ?? []).map((f) => ({ ...f, quantity: Number(f.quantity) })),
    async spareFragments(): Promise<SpareCard[]> {
      const rows = (await call<(Omit<SpareCard, 'card'> & { card: DbCard })[] | null>('get_spare_fragments')) ?? [];
      const urls = await cardUrls(rows.map((r) => r.card));
      return rows.map((r) => ({ ...r, card: fullCard(r.card, urls) }));
    },
    convertDuplicates: (cardId: string, quantity: number) => call<ConvertResult>('convert_duplicates', { p_card: cardId, p_quantity: quantity }),
    convertAllDuplicates: async (): Promise<ConvertResult[]> => (await call<ConvertResult[] | null>('convert_all_duplicates')) ?? [],
    forge: async (): Promise<ForgeArtifact[]> => ((await call<ForgeArtifact[] | null>('get_forge')) ?? []).map(numArtifact),
    craftArtifact: (artifactId: string, requestId: string) => call<{ id: number; repeated: boolean }>('craft_artifact', { p_artifact: artifactId, p_request: requestId }),
    async myArtifacts(): Promise<{ slots: number; items: MyArtifact[] }> {
      const r = await call<{ slots: number; items: MyArtifact[] | null }>('get_my_artifacts');
      return { slots: Number(r?.slots ?? 3), items: (r?.items ?? []).map(numArtifact) };
    },
    setArtifactActive: (id: number, active: boolean) => call<{ id: number; active: boolean }>('set_artifact_active', { p_id: id, p_active: active }),
    async adminArtifactConfig(): Promise<ArtifactConfig> {
      const c = await call<ArtifactConfig>('admin_artifact_config');
      return { ...c, artifacts: (c.artifacts ?? []).map(numArtifact), rules: c.rules ?? [], fragment_types: c.fragment_types ?? [], blocked_cards: c.blocked_cards ?? [] };
    },
    adminUpsertArtifact: (p: object) => call<AdminArtifact>('admin_upsert_artifact', { p }),
    adminDeleteArtifact: (id: string) => call<{ image_path: string | null; owners: number }>('admin_delete_artifact', { p_id: id }),
    adminUpsertFragmentType: (p: { id?: string; name: string; color: string; active: boolean }) => call<FragmentType>('admin_upsert_fragment_type', { p }),
    adminSetFragmentRule: (tier: string, fragmentType: string | null, amount: number) => call<object>('admin_set_fragment_rule', { p_tier: tier, p_fragment: fragmentType, p_amount: amount }),
    adminSetCardFragments: (cardId: string, allowed: boolean) => call<object>('admin_set_card_fragments', { p_card: cardId, p_allowed: allowed }),
    adminSetArtifactSlots: (slots: number) => call<{ slots: number }>('admin_set_artifact_slots', { p_slots: slots }),

    // the bell and the daily chest
    async notifications(): Promise<{ unread: number; items: Notice[] }> {
      const r = await call<{ unread: number; items: Notice[] | null }>('get_notifications');
      return { unread: Number(r?.unread ?? 0), items: r?.items ?? [] };
    },
    markNotificationsRead: (ids: number[] | null) => call<{ marked: number }>('mark_notifications_read', { p_ids: ids }),
    async chest(): Promise<{ claimed_today: boolean; next_at: string; prizes: ChestPrize[] }> {
      const r = await call<{ claimed_today: boolean; next_at: string; prizes: ChestPrize[] | null }>('get_chest');
      return { ...r, prizes: (r?.prizes ?? []).map((p) => ({ ...p, chance: Number(p.chance) })) };
    },
    openChest: () => call<ChestResult>('claim_daily'),
    adminChestPrizes: async (): Promise<AdminChestPrize[]> =>
      ((await call<AdminChestPrize[] | null>('admin_list_chest_prizes')) ?? []).map((p) => ({ ...p, chance: p.chance === null ? null : Number(p.chance) })),
    adminUpsertChestPrize: (p: Partial<AdminChestPrize>) => call<AdminChestPrize>('admin_upsert_chest_prize', { p }),
    adminDeleteChestPrize: (id: string) => call<{ id: string }>('admin_delete_chest_prize', { p_id: id }),

    // global reset: only the server owner (checked in the database)
    serverOwnerStatus: () => call<ServerOwnerStatus>('server_owner_status'),
    adminGlobalReset: (phrase: string) => call<{ players: number; cards_removed: number; coins_removed: number }>('admin_global_reset', { p_phrase: phrase }),

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
