import { formatCoins } from '@/lib/format';

export type CoinMode = 'dar' | 'tirar' | 'definir';
export type CoinChange =
  | { ok: true; kind: 'adjust'; amount: number; after: number }
  | { ok: true; kind: 'set'; coins: number; after: number }
  | { ok: false; error: string };

/** Turns the admin's coin form into one change, or says what is wrong with it. */
export function coinChange(mode: CoinMode, text: string, current: number): CoinChange {
  const t = text.trim();
  if (!/^\d+$/.test(t)) return { ok: false, error: 'Digite um número.' };
  const n = Number(t);
  if (mode === 'definir') {
    if (n === current) return { ok: false, error: 'Esse já é o saldo atual.' };
    return { ok: true, kind: 'set', coins: n, after: n };
  }
  if (n <= 0) return { ok: false, error: 'Use um número maior que zero.' };
  if (mode === 'tirar' && n > current) return { ok: false, error: `O jogador só tem ${formatCoins(current)} moedas.` };
  const amount = mode === 'dar' ? n : -n;
  return { ok: true, kind: 'adjust', amount, after: current + amount };
}
