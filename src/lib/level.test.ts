import { levelProgress } from './level';

test('progress is the share of the way from this level to the next', () => {
  expect(levelProgress({ xp: 450, level_start: 300, next_at: 600 })).toBe(50);
  expect(levelProgress({ xp: 300, level_start: 300, next_at: 600 })).toBe(0);
});

test('progress never goes past 100 or below 0', () => {
  expect(levelProgress({ xp: 900, level_start: 300, next_at: 600 })).toBe(100);
  expect(levelProgress({ xp: 0, level_start: 0, next_at: 0 })).toBe(0);
});
