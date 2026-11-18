/** Next song in a looping list; -1 when there is nothing to play. */
export function nextIndex(current: number, length: number): number {
  if (length <= 0) return -1;
  return (current + 1) % length;
}

/** One item chosen with a random number in [0, 1). */
export function pickRandom<T>(list: T[], random: number): T | null {
  if (list.length === 0) return null;
  return list[Math.min(list.length - 1, Math.floor(random * list.length))];
}
