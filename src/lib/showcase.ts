export const SHOWCASE_MAX = 3;

/** Picks or unpicks a card for the profile showcase, never going past the limit. */
export function toggleShowcase(current: string[], id: string, max = SHOWCASE_MAX): string[] {
  if (current.includes(id)) return current.filter((x) => x !== id);
  if (current.length >= max) return current;
  return [...current, id];
}
