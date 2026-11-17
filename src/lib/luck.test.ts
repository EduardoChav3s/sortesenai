import { ApiError } from '@/data/errors';
import type { CardLocked } from '@/data/types';
import { effectiveLuck, rollCard } from './luck';

const c = (id: string, odds_n: number, active = true): CardLocked => ({ id, odds_n, active });
const deck = [c('a', 10), c('b', 100), c('c', 1_000_000)];

describe('rollCard', () => {
  test('rand 0 returns the rarest card', () => {
    expect(rollCard(deck, 1, () => 0)).toBe('c');
  });
  test('rand near 1 falls back to the most common card', () => {
    expect(rollCard(deck, 1, () => 0.999999)).toBe('a');
  });
  test('ignores inactive cards', () => {
    expect(rollCard([c('a', 10), c('x', 1000, false)], 1, () => 0)).toBe('a');
  });
  test('throws invalid when no active cards', () => {
    expect(() => rollCard([c('x', 10, false)], 1, () => 0)).toThrow(ApiError);
    try {
      rollCard([], 1, () => 0);
    } catch (e) {
      expect((e as ApiError).code).toBe('invalid');
    }
  });
  test('1/100 card appears ~1% of the time with luck 1', () => {
    const cards = [c('common', 10), c('rare', 100)];
    let hits = 0;
    const N = 200_000;
    for (let i = 0; i < N; i++) if (rollCard(cards, 1, Math.random) === 'rare') hits++;
    expect(hits / N).toBeGreaterThan(0.008);
    expect(hits / N).toBeLessThan(0.012);
  });
  test('luck 10 makes the 1/100 card appear ~10%', () => {
    const cards = [c('common', 10), c('rare', 100)];
    let hits = 0;
    const N = 200_000;
    for (let i = 0; i < N; i++) if (rollCard(cards, 10, Math.random) === 'rare') hits++;
    expect(hits / N).toBeGreaterThan(0.08);
    expect(hits / N).toBeLessThan(0.12);
  });
});

describe('effectiveLuck', () => {
  test('multiplies potions and streak', () => {
    expect(effectiveLuck([2, 5], 1.5, 1_000_000)).toBe(15);
  });
  test('is capped', () => {
    expect(effectiveLuck([1_000_000, 2], 1, 1_000_000)).toBe(1_000_000);
  });
  test('defaults to 1', () => {
    expect(effectiveLuck([], 1, 1000)).toBe(1);
  });
});
