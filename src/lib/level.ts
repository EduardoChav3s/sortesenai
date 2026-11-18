/** How far (0-100) the player is from this level's start to the next level. */
export function levelProgress(l: { xp: number; level_start: number; next_at: number }): number {
  const span = l.next_at - l.level_start;
  if (span <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round(((l.xp - l.level_start) / span) * 100)));
}
