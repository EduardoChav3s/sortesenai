// What a live admin note (one row of admin_events) means for the screen.

const KEYS: Record<string, string[]> = {
  cards: ['admin-cards', 'collection', 'event', 'reel'],
  suggestions: ['admin-suggestions'],
  profiles: ['admin-players', 'role'],
  items: ['admin-items', 'shop'],
  titles: ['admin-titles', 'shop'],
  settings: ['settings', 'missions', 'event', 'limits'],
  music_tracks: ['music'],
};

/** The cached lists to refresh when a table changes. */
export function keysForAdminEvent(kind: string): string[] {
  return KEYS[kind] ?? [];
}

const NOTICE: Record<string, string> = {
  cards: 'Outro admin mudou as cartas.',
  suggestions: 'Chegou uma ideia nova ou uma ideia mudou.',
  profiles: 'A lista de jogadores mudou.',
  items: 'Outro admin mudou a loja.',
  titles: 'Outro admin mudou a loja.',
  settings: 'Outro admin mudou as regras do jogo.',
  music_tracks: 'Outro admin mudou as músicas.',
};

/** A short line when someone else changed something; nothing for my own changes. */
export function adminEventNotice(kind: string, actor: string | null, me: string | null | undefined): string | null {
  if (actor && me && actor === me) return null;
  return NOTICE[kind] ?? null;
}
