// The roll's strip of cards: three laps of seven slots, the winner lands on slot 10.
export const REEL_LAP = 7;
export const REEL_LENGTH = REEL_LAP * 3;
export const REEL_TARGET = REEL_LAP + 3;

/**
 * Cards that pass under the window: only cards active in the album right now (deleted or turned-off
 * cards never show), shuffled and repeated to fill the strip.
 */
export function buildStrip<E extends { card: { id: string; active: boolean } }>(entries: E[], random: () => number, length = REEL_LENGTH): E[] {
  const pool = entries.filter((e) => e.card.active);
  if (pool.length === 0) return [];
  const shuffled = [...pool];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return Array.from({ length }, (_, i) => shuffled[i % shuffled.length]);
}
