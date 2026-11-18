export type RarityTier = 'comum' | 'incomum' | 'raro' | 'epico' | 'lendario' | 'mitico';
export type GameId = 'slots' | 'memory' | 'reflex' | 'clicker';
export type ItemType = 'potion' | 'banner' | 'frame' | 'color' | 'name_effect';

export interface CardLocked {
  id: string;
  odds_n: number;
  active: boolean;
}
export interface CardContent extends CardLocked {
  title: string;
  joke: string;
  image_url: string | null;
}
export type CollectionEntry =
  | { owned: true; card: CardContent; quantity: number }
  | { owned: false; card: CardLocked; quantity: 0 };

export interface Equipment {
  banner_item_id: string | null;
  frame_item_id: string | null;
  color_item_id: string | null;
  name_effect_item_id: string | null;
  title_id: string | null;
  showcase: [string | null, string | null, string | null];
}
export interface Profile {
  id: string;
  email: string;
  nickname: string;
  bio: string;
  avatar_url: string | null;
  avatar_card_id: string | null;
  role: 'player' | 'admin';
  banned: boolean;
  coins: number;
  equipment: Equipment;
  created_at: string;
}
export interface PlayerSummary {
  id: string;
  nickname: string;
  avatar_url: string | null;
  avatar_card: CardContent | null;
  title_name: string | null;
  frame_item_id: string | null;
  name_effect_item_id: string | null;
  /** Account level, sent with every player since the level system. */
  level?: number;
}
export type FriendStatus = 'me' | 'friends' | 'outgoing' | 'incoming' | 'none';
export interface PublicProfile extends PlayerSummary {
  bio: string;
  banner_item_id: string | null;
  color_item_id: string | null;
  showcase: (CardContent | null)[];
}
export interface Item {
  id: string;
  type: ItemType;
  name: string;
  description: string;
  price: number;
  multiplier: number | null;
  duration_minutes: number | null;
  duration_pulls: number | null;
  image_url: string | null;
  active: boolean;
}
export interface ActiveEffect {
  item_id: string;
  name: string;
  multiplier: number;
  expires_at: string | null;
  pulls_left: number | null;
}
export interface LuckState {
  potions: number;
  streak: number;
  effective: number;
  cap: number;
  streak_expires_at: string | null;
}
export type TitleCondition =
  | { type: 'pulled_at_least'; odds_n: number }
  | { type: 'collection_pct'; pct: number }
  | { type: 'pull_count'; count: number }
  | { type: 'game_coins'; game: GameId; coins: number }
  | { type: 'manual' };
export interface Title {
  id: string;
  name: string;
  description: string;
  condition: TitleCondition;
}
export interface PullResult {
  card: CardContent;
  odds_n_at_pull: number;
  luck_used: number;
  is_new: boolean;
  quantity: number;
  coins_after: number;
  feed_posted: boolean;
  titles_unlocked: Title[];
}
export interface FeedEvent {
  id: string;
  player: PlayerSummary;
  card: CardContent;
  odds_n_at_pull: number;
  luck: number;
  created_at: string;
}
export type RankingKind = 'coins' | 'collection' | 'rarest' | 'level';
export interface RankingEntry {
  position: number;
  player: PlayerSummary;
  value: number;
}
export interface Suggestion {
  id: string;
  user_id: string;
  text: string;
  image_url: string | null;
  status: 'pending' | 'approved' | 'rejected';
  admin_note: string | null;
  card_id: string | null;
  created_at: string;
}
export interface CoinTransaction {
  id: string;
  amount: number;
  reason: string;
  created_at: string;
}
export interface Settings {
  pull_cost: number;
  daily_reward: number;
  luck_cap: number;
  streak_window_seconds: number;
  streak_step: number;
  streak_cap: number;
  feed_min_odds: number;
  recycle_base: number;
  game_daily_limits: Record<GameId, number>;
  slots_bets: number[];
}
export interface Session {
  user_id: string;
  email: string;
  access: 'ok' | 'not_invited' | 'banned';
}
