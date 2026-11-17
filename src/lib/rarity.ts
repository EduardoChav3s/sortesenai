import type { RarityTier } from '@/data/types';

export const TIERS: RarityTier[] = ['comum', 'incomum', 'raro', 'epico', 'lendario', 'mitico'];

export const TIER_LABEL: Record<RarityTier, string> = {
  comum: 'Comum',
  incomum: 'Incomum',
  raro: 'Raro',
  epico: 'Épico',
  lendario: 'Lendário',
  mitico: 'Mítico',
};

export function rarityTier(odds_n: number): RarityTier {
  if (odds_n < 100) return 'comum';
  if (odds_n < 10_000) return 'incomum';
  if (odds_n < 1_000_000) return 'raro';
  if (odds_n < 100_000_000) return 'epico';
  if (odds_n < 1_000_000_000) return 'lendario';
  return 'mitico';
}
