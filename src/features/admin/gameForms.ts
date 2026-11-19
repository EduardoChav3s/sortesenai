// The admin's game-settings and potion forms turned into what the database expects (or a message).

export interface SettingsForm {
  pullCost: string;
  dailyReward: string;
  recycleBase: string;
  slots: string;
  memory: string;
  reflex: string;
  clicker: string;
  bets: string;
}
export type SettingsPatch = {
  pull_cost: number;
  daily_reward: number;
  recycle_base: number;
  game_daily_limits: { slots: number; memory: number; reflex: number; clicker: number };
  slots_bets: number[];
};

const positive = (v: string) => (/^\d+$/.test(v.trim()) && Number(v) > 0 ? Number(v) : null);
const whole = (v: string) => (/^\d+$/.test(v.trim()) ? Number(v) : null);

export function settingsPatch(f: SettingsForm): { ok: true; patch: SettingsPatch } | { ok: false; error: string } {
  const pull = positive(f.pullCost);
  if (pull === null) return { ok: false, error: 'Custo da roletada: use um número maior que zero.' };
  const daily = positive(f.dailyReward);
  if (daily === null) return { ok: false, error: 'Bônus diário: use um número maior que zero.' };
  const recycle = positive(f.recycleBase);
  if (recycle === null) return { ok: false, error: 'Moedas por repetida: use um número maior que zero.' };
  const limits = { slots: whole(f.slots), memory: whole(f.memory), reflex: whole(f.reflex), clicker: whole(f.clicker) };
  const names: Record<string, string> = { slots: 'caça-níquel', memory: 'memória', reflex: 'reflexo', clicker: 'clique rápido' };
  for (const [k, v] of Object.entries(limits)) if (v === null) return { ok: false, error: `Limite da ${names[k]}: use um número inteiro.` };
  const parts = f.bets.split(/[\s,;]+/).filter(Boolean);
  if (parts.length === 0) return { ok: false, error: 'Apostas: coloque pelo menos um valor.' };
  const bets = parts.map(positive);
  if (bets.some((b) => b === null)) return { ok: false, error: 'Apostas: use só números maiores que zero.' };
  const unique = [...new Set(bets as number[])].sort((a, b) => a - b);
  if (unique.length > 6) return { ok: false, error: 'Apostas: no máximo 6 valores.' };
  return {
    ok: true,
    patch: {
      pull_cost: pull,
      daily_reward: daily,
      recycle_base: recycle,
      game_daily_limits: limits as SettingsPatch['game_daily_limits'],
      slots_bets: unique,
    },
  };
}

export interface ItemForm {
  id?: string;
  name: string;
  description: string;
  price: string;
  multiplier: string;
  kind: 'minutes' | 'pulls';
  duration: string;
  active: boolean;
  /** Picture: a pasted https link, or the public link of a file sent to the shop bucket (then image_path names it). */
  image_url?: string;
  image_path?: string | null;
  /** What the potion amplifies: luck, XP or coins. */
  attribute?: 'luck' | 'xp' | 'money';
}
export interface ItemPayload {
  id?: string;
  name: string;
  description: string;
  price: number;
  multiplier: number;
  duration_minutes: number | null;
  duration_pulls: number | null;
  active: boolean;
  image_url: string | null;
  image_path: string | null;
  attribute: 'luck' | 'xp' | 'money';
}

export function itemPayload(f: ItemForm): { ok: true; payload: ItemPayload } | { ok: false; error: string } {
  const name = f.name.trim();
  if (!name) return { ok: false, error: 'Dê um nome à poção.' };
  if (name.length > 40) return { ok: false, error: 'Nome com no máximo 40 letras.' };
  const price = positive(f.price);
  if (price === null) return { ok: false, error: 'Preço: use um número maior que zero.' };
  const mult = Number(f.multiplier.trim().replace(',', '.'));
  if (!Number.isFinite(mult) || mult <= 1) return { ok: false, error: 'A sorte precisa ser maior que 1x.' };
  const dur = positive(f.duration);
  if (dur === null) return { ok: false, error: 'Duração: use um número maior que zero.' };
  const image = (f.image_url ?? '').trim();
  if (image && !/^https:\/\/\S+$/.test(image)) return { ok: false, error: 'O link da imagem precisa começar com https://' };
  return {
    ok: true,
    payload: {
      ...(f.id ? { id: f.id } : {}),
      name,
      description: f.description.trim(),
      price,
      multiplier: mult,
      duration_minutes: f.kind === 'minutes' ? dur : null,
      duration_pulls: f.kind === 'pulls' ? dur : null,
      active: f.active,
      image_url: image || null,
      image_path: image ? f.image_path ?? null : null,
      attribute: f.attribute ?? 'luck',
    },
  };
}
