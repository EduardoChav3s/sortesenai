import { chestStrip, timeAgo } from './chest';

const prizes = [
  { id: 'a', label: '100 moedas', kind: 'coins' },
  { id: 'b', label: '5 fragmentos Comum', kind: 'fragments' },
  { id: 'c', label: '1x Gota de sorte', kind: 'potion' },
];

test('chest strip: prizes repeat to fill it, and the won prize sits in the window', () => {
  const strip = chestStrip(prizes, 'c', () => 0, 15, 11);
  expect(strip).toHaveLength(15);
  expect(strip[11].id).toBe('c');
  expect(new Set(strip.map((p) => p.id))).toEqual(new Set(['a', 'b', 'c']));
});

test('chest strip without a won prize yet is just the prizes repeated', () => {
  const strip = chestStrip(prizes, null, () => 0.5, 9, 6);
  expect(strip).toHaveLength(9);
  expect(chestStrip([], null, Math.random, 9, 6)).toEqual([]);
});

test('time ago in Portuguese, short', () => {
  const now = new Date('2026-11-19T12:00:00Z').getTime();
  expect(timeAgo('2026-11-19T11:59:40Z', now)).toBe('agora');
  expect(timeAgo('2026-11-19T11:55:00Z', now)).toBe('há 5 min');
  expect(timeAgo('2026-11-19T09:00:00Z', now)).toBe('há 3 h');
  expect(timeAgo('2026-11-16T12:00:00Z', now)).toBe('há 3 dias');
  expect(timeAgo('2026-11-18T12:00:00Z', now)).toBe('há 1 dia');
});
