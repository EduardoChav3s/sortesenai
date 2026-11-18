export function recycleValue(odds_n: number, recycle_base: number): number {
  return Math.round(recycle_base * 2 ** (Math.log10(odds_n) - 1));
}

type Entry = { owned: boolean; quantity: number; card: { id: string; odds_n: number } };

/** Repeated cards a player can trade: keeps one of each, the rest turn into coins. */
export function duplicates<E extends Entry>(entries: E[], recycle_base: number) {
  const items = entries
    .filter((e) => e.owned && e.quantity > 1)
    .map((e) => ({ card: e.card as E['card'], extra: e.quantity - 1, coins: recycleValue(e.card.odds_n, recycle_base) * (e.quantity - 1) }));
  return { items, total: items.reduce((t, i) => t + i.coins, 0), count: items.reduce((t, i) => t + i.extra, 0) };
}
