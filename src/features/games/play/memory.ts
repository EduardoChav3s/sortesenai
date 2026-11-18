// Memory game state on the screen. The server holds the board; each flip tells us one symbol.
export interface FlipResult {
  index: number;
  symbol: string;
  matched: [number, number] | null;
  finished: boolean;
  moves: number;
  payout: number | null;
  coins_after: number | null;
}

export interface MemoryState {
  faces: Record<number, string>;
  matched: number[];
  /** Face-up cards that are not a pair yet. Two here means a miss waiting to be hidden. */
  open: number[];
  moves: number;
  finished: boolean;
  payout: number | null;
}

export const NEW_BOARD: MemoryState = { faces: {}, matched: [], open: [], moves: 0, finished: false, payout: null };

export function canFlip(m: MemoryState, i: number): boolean {
  return !m.finished && m.open.length < 2 && !m.matched.includes(i) && !m.open.includes(i);
}

export function applyFlip(m: MemoryState, r: FlipResult): MemoryState {
  const faces = { ...m.faces, [r.index]: r.symbol };
  const base = { ...m, faces, moves: r.moves, finished: r.finished, payout: r.payout ?? m.payout };
  if (r.matched) return { ...base, matched: [...m.matched, ...r.matched], open: [] };
  return { ...base, open: [...m.open, r.index] };
}

/** Turns a missed pair face down again. */
export function hideOpen(m: MemoryState): MemoryState {
  const faces = { ...m.faces };
  for (const i of m.open) delete faces[i];
  return { ...m, faces, open: [] };
}
