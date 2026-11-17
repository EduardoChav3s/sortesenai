import { rarityTier } from './rarity';

test.each([
  [10, 'comum'],
  [99, 'comum'],
  [100, 'incomum'],
  [9_999, 'incomum'],
  [10_000, 'raro'],
  [1_000_000, 'epico'],
  [100_000_000, 'lendario'],
  [999_999_999, 'lendario'],
  [1_000_000_000, 'mitico'],
  [10_000_000_000, 'mitico'],
])('rarityTier(%d) = %s', (n, tier) => {
  expect(rarityTier(n)).toBe(tier);
});
