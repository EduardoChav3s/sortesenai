// Who is in the chat right now and who is typing. Nothing here is saved: it comes from the live connection.
export interface OnlinePlayer {
  id: string;
  nickname: string;
  avatar_url: string | null;
  level: number;
}

/** One entry per player (a player with two tabs open counts once), me first, then by name. */
export function onlineFrom(state: Record<string, OnlinePlayer[]>, me: string | null | undefined): OnlinePlayer[] {
  const byId = new Map<string, OnlinePlayer>();
  for (const metas of Object.values(state)) for (const p of metas) if (p?.id && !byId.has(p.id)) byId.set(p.id, p);
  return [...byId.values()].sort((a, b) => (a.id === me ? -1 : b.id === me ? 1 : a.nickname.localeCompare(b.nickname, 'pt-BR')));
}

export const TYPING_MS = 3000;

/** Names of the others who typed in the last 3 seconds. */
export function typingNow(seen: Record<string, { nickname: string; at: number }>, now: number, me: string | null | undefined): string[] {
  return Object.entries(seen)
    .filter(([id, t]) => id !== me && now - t.at < TYPING_MS)
    .map(([, t]) => t.nickname);
}

export function typingLine(names: string[]): string | null {
  if (names.length === 0) return null;
  if (names.length === 1) return `${names[0]} está digitando`;
  if (names.length === 2) return `${names[0]} e ${names[1]} estão digitando`;
  return `${names.length} pessoas estão digitando`;
}
