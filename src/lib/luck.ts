import { ApiError } from '@/data/errors';
import type { CardLocked } from '@/data/types';

/** Rolls from rarest to most common; each card succeeds with min(1, luck/N). */
export function rollCard(cards: CardLocked[], luck: number, rand: () => number): string {
  const active = cards.filter((c) => c.active).sort((a, b) => b.odds_n - a.odds_n);
  if (active.length === 0) throw new ApiError('invalid', 'Nenhuma carta ativa para sortear.');
  for (const card of active) {
    if (rand() < Math.min(1, luck / card.odds_n)) return card.id;
  }
  return active[active.length - 1].id;
}

export function effectiveLuck(potionMultipliers: number[], streak: number, cap: number): number {
  const product = potionMultipliers.reduce((acc, m) => acc * m, 1);
  return Math.min(cap, product * Math.max(1, streak));
}
