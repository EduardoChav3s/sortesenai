import { recycleValue } from './economy';

test('recycleValue grows with rarity', () => {
  expect(recycleValue(10, 5)).toBe(5);
  expect(recycleValue(1000, 5)).toBe(20);
  expect(recycleValue(10_000_000_000, 5)).toBe(2560);
});
