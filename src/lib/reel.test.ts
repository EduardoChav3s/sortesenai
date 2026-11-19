import { buildStrip, REEL_LENGTH } from './reel';

const entry = (id: string, active = true) => ({ owned: false, quantity: 0, card: { id, odds_n: 10, active } });
const fixed = () => 0; // always the first choice, so the order is predictable

test('the reel only uses cards that are active in the album', () => {
  const strip = buildStrip([entry('a'), entry('apagada', false), entry('b')], fixed);
  expect(strip.length).toBe(REEL_LENGTH);
  expect(strip.some((e) => e.card.id === 'apagada')).toBe(false);
  expect(new Set(strip.map((e) => e.card.id))).toEqual(new Set(['a', 'b']));
});

test('few cards repeat to fill the reel', () => {
  const strip = buildStrip([entry('so')], fixed, 6);
  expect(strip.map((e) => e.card.id)).toEqual(['so', 'so', 'so', 'so', 'so', 'so']);
});

test('no active cards means an empty reel', () => {
  expect(buildStrip([entry('x', false)], fixed)).toEqual([]);
  expect(buildStrip([], fixed)).toEqual([]);
});

test('the order is shuffled with the random number given', () => {
  const a = buildStrip([entry('1'), entry('2'), entry('3')], () => 0.99, 3).map((e) => e.card.id);
  const b = buildStrip([entry('1'), entry('2'), entry('3')], () => 0, 3).map((e) => e.card.id);
  expect(a).not.toEqual(b);
});
