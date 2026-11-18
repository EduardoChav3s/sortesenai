import { recycleValue } from './economy';

test('recycleValue grows with rarity', () => {
  expect(recycleValue(10, 5)).toBe(5);
  expect(recycleValue(1000, 5)).toBe(20);
  expect(recycleValue(10_000_000_000, 5)).toBe(2560);
});

import { duplicates } from './economy';

const card = (id: string, odds_n: number) => ({ id, odds_n, active: true, title: id, joke: '', image_url: null });

test('duplicates keeps one of each card and prices the rest', () => {
  const r = duplicates(
    [
      { owned: true, quantity: 3, card: card('a', 10) },
      { owned: true, quantity: 1, card: card('b', 1000) },
      { owned: false, quantity: 0, card: { id: 'c', odds_n: 50, active: true } },
      { owned: true, quantity: 2, card: card('d', 1000) },
    ],
    5,
  );
  expect(r.items.map((i) => [i.card.id, i.extra, i.coins])).toEqual([
    ['a', 2, 10],
    ['d', 1, 20],
  ]);
  expect(r.total).toBe(30);
  expect(r.count).toBe(3);
});

test('duplicates is empty when nothing repeats', () => {
  expect(duplicates([{ owned: true, quantity: 1, card: card('a', 10) }], 5)).toEqual({ items: [], total: 0, count: 0 });
});
