import { applyFlip, canFlip, hideOpen, NEW_BOARD } from './memory';

const flip = (index: number, symbol: string, matched: [number, number] | null = null, finished = false) =>
  ({ index, symbol, matched, finished, moves: 0, payout: finished ? 80 : null, coins_after: null });

test('the first flip shows the card and leaves it open', () => {
  const m = applyFlip(NEW_BOARD, flip(3, 'a'));
  expect(m.faces[3]).toBe('a');
  expect(m.open).toEqual([3]);
});

test('a pair stays face up and closes the open list', () => {
  const m = applyFlip(applyFlip(NEW_BOARD, flip(3, 'a')), flip(7, 'a', [3, 7]));
  expect(m.matched).toEqual([3, 7]);
  expect(m.open).toEqual([]);
  expect(canFlip(m, 3)).toBe(false);
});

test('a miss keeps two cards open, blocks more flips, then hides them', () => {
  const m = applyFlip(applyFlip(NEW_BOARD, flip(1, 'a')), flip(2, 'b'));
  expect(m.open).toEqual([1, 2]);
  expect(canFlip(m, 5)).toBe(false);
  const h = hideOpen(m);
  expect(h.faces[1]).toBeUndefined();
  expect(h.open).toEqual([]);
  expect(canFlip(h, 5)).toBe(true);
});

test('the last pair ends the game with the payout', () => {
  const m = applyFlip(NEW_BOARD, flip(0, 'h', [4, 0], true));
  expect(m.finished).toBe(true);
  expect(m.payout).toBe(80);
  expect(canFlip(m, 9)).toBe(false);
});
