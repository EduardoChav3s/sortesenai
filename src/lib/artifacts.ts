// Artifacts: what the forge is missing, the bonus line, and the admin form check.
export interface RecipeLine {
  fragment_type: string;
  name: string;
  color: string;
  amount: number;
  have: number;
}

export function missingMaterials(recipe: RecipeLine[]): { ready: boolean; missing: { name: string; missing: number }[] } {
  const missing = recipe.filter((r) => Number(r.have) < Number(r.amount)).map((r) => ({ name: r.name, missing: Number(r.amount) - Number(r.have) }));
  return { ready: recipe.length > 0 && missing.length === 0, missing };
}

const mult = (n: number) => `${String(Number(n)).replace('.', ',')}x`;

/** Only the bonuses the artifact really gives (a 1x bonus is none). */
export function bonusLine(a: { luck_mult: number; xp_mult: number; money_mult: number }): string[] {
  const out: string[] = [];
  if (Number(a.luck_mult) > 1) out.push(`Sorte ${mult(a.luck_mult)}`);
  if (Number(a.xp_mult) > 1) out.push(`XP ${mult(a.xp_mult)}`);
  if (Number(a.money_mult) > 1) out.push(`Moedas ${mult(a.money_mult)}`);
  return out;
}

export interface ArtifactForm {
  id?: string;
  name: string;
  description: string;
  rarity: string;
  luck: string;
  xp: string;
  money: string;
  active: boolean;
  image_url: string;
  image_path: string | null;
  recipe: { fragment_type: string; amount: string }[];
}
export interface ArtifactPayload {
  id?: string;
  name: string;
  description: string;
  rarity: string;
  luck_mult: number;
  xp_mult: number;
  money_mult: number;
  active: boolean;
  image_url: string | null;
  image_path: string | null;
  recipe: { fragment_type: string; amount: number }[];
}

const num = (s: string) => Number(s.trim().replace(',', '.'));

export function artifactPayload(f: ArtifactForm): { ok: true; payload: ArtifactPayload } | { ok: false; error: string } {
  const name = f.name.trim();
  if (!name) return { ok: false, error: 'Dê um nome ao artefato.' };
  if (name.length > 40) return { ok: false, error: 'Nome com no máximo 40 letras.' };
  const [luck, xp, money] = [num(f.luck || '1'), num(f.xp || '1'), num(f.money || '1')];
  if ([luck, xp, money].some((m) => !Number.isFinite(m) || m < 1 || m > 1000)) return { ok: false, error: 'Os bônus vão de 1x a 1000x.' };
  if (luck <= 1 && xp <= 1 && money <= 1) return { ok: false, error: 'Dê pelo menos um bônus maior que 1x (sorte, XP ou moedas).' };
  if (f.recipe.length === 0) return { ok: false, error: 'A receita precisa de pelo menos um fragmento.' };
  const amounts = f.recipe.map((r) => Number(r.amount));
  if (amounts.some((a) => !Number.isInteger(a) || a <= 0)) return { ok: false, error: 'Cada fragmento da receita precisa de quantidade maior que zero.' };
  if (new Set(f.recipe.map((r) => r.fragment_type)).size !== f.recipe.length) return { ok: false, error: 'Cada tipo de fragmento aparece uma vez só na receita.' };
  const image = f.image_url.trim();
  if (image && !/^https:\/\/\S+$/.test(image)) return { ok: false, error: 'O link da imagem precisa começar com https://' };
  return {
    ok: true,
    payload: {
      ...(f.id ? { id: f.id } : {}),
      name,
      description: f.description.trim(),
      rarity: f.rarity,
      luck_mult: luck,
      xp_mult: xp,
      money_mult: money,
      active: f.active,
      image_url: image || null,
      image_path: image ? f.image_path : null,
      recipe: f.recipe.map((r, i) => ({ fragment_type: r.fragment_type, amount: amounts[i] })),
    },
  };
}
