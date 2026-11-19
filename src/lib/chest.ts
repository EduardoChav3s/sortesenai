// The daily chest's spinning strip, and "how long ago" for the bell.
export interface ChestTile {
  id: string;
  label: string;
  kind: string;
}

/** Prizes shuffled and repeated to fill the strip; the won prize (when known) sits at `target`. */
export function chestStrip<T extends ChestTile>(prizes: T[], wonId: string | null, random: () => number, length = 21, target = 16): T[] {
  if (prizes.length === 0) return [];
  const shuffled = [...prizes];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const strip = Array.from({ length }, (_, i) => shuffled[i % shuffled.length]);
  const won = wonId ? prizes.find((p) => p.id === wonId) : undefined;
  if (won && target < length) strip[target] = won;
  return strip;
}

export function timeAgo(iso: string, now = Date.now()): string {
  const s = Math.max(0, (now - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'agora';
  if (s < 3600) return `há ${Math.floor(s / 60)} min`;
  if (s < 86400) return `há ${Math.floor(s / 3600)} h`;
  const d = Math.floor(s / 86400);
  return `há ${d} dia${d > 1 ? 's' : ''}`;
}
