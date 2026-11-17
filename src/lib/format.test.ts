import { formatCoins, formatLuck, formatOdds } from './format';

test('formatOdds full uses pt-BR thousands separators', () => {
  expect(formatOdds(10_000_000_000)).toBe('1/10.000.000.000');
  expect(formatOdds(10)).toBe('1/10');
});

test('formatOdds compact', () => {
  expect(formatOdds(10_000_000_000, { compact: true })).toBe('1/10 bi');
  expect(formatOdds(1_000_000, { compact: true })).toBe('1/1 mi');
  expect(formatOdds(10_000, { compact: true })).toBe('1/10 mil');
  expect(formatOdds(500, { compact: true })).toBe('1/500');
});

test('formatLuck', () => {
  expect(formatLuck(1_000_000)).toBe('1.000.000×');
  expect(formatLuck(1.5)).toBe('1,5×');
  expect(formatLuck(1)).toBe('1×');
});

test('formatCoins', () => {
  expect(formatCoins(1_234_567, { compact: true })).toBe('1,2 mi');
  expect(formatCoins(1_234_567)).toBe('1.234.567');
  expect(formatCoins(950, { compact: true })).toBe('950');
});
