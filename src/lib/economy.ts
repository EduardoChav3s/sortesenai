export function recycleValue(odds_n: number, recycle_base: number): number {
  return Math.round(recycle_base * 2 ** (Math.log10(odds_n) - 1));
}
