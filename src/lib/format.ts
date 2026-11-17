const full = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
const short = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
const luckFmt = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });

const UNITS: [number, string][] = [
  [1_000_000_000, 'bi'],
  [1_000_000, 'mi'],
  [1_000, 'mil'],
];

function compactNumber(n: number): string {
  for (const [size, label] of UNITS) {
    if (Math.abs(n) >= size) return `${short.format(Math.floor((n / size) * 10) / 10)} ${label}`;
  }
  return full.format(n);
}

export function formatOdds(odds_n: number, opts: { compact?: boolean } = {}): string {
  return `1/${opts.compact ? compactNumber(odds_n) : full.format(odds_n)}`;
}

export function formatCoins(n: number, opts: { compact?: boolean } = {}): string {
  return opts.compact ? compactNumber(n) : full.format(n);
}

export function formatLuck(mult: number): string {
  return `${luckFmt.format(mult)}×`;
}
