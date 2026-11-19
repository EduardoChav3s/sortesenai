import { artifactPayload, bonusLine, missingMaterials } from './artifacts';

test('forge: what is missing for each fragment, and whether it can be forged', () => {
  const recipe = [
    { fragment_type: 'a', name: 'Comum', color: '#999999', amount: 10, have: 4 },
    { fragment_type: 'b', name: 'Raro', color: '#3d8bfd', amount: 2, have: 5 },
  ];
  expect(missingMaterials(recipe)).toEqual({ ready: false, missing: [{ name: 'Comum', missing: 6 }] });
  expect(missingMaterials([{ ...recipe[1] }])).toEqual({ ready: true, missing: [] });
});

test('bonus line shows only what the artifact really gives', () => {
  expect(bonusLine({ luck_mult: 5, xp_mult: 1, money_mult: 1 })).toEqual(['Sorte 5x']);
  expect(bonusLine({ luck_mult: 1, xp_mult: 2, money_mult: 1.5 })).toEqual(['XP 2x', 'Moedas 1,5x']);
});

test('admin artifact form: name, at least one bonus, a recipe with amounts, https picture', () => {
  const base = { name: ' Trevo ', description: '', rarity: 'raro', luck: '5', xp: '1', money: '1', active: true, image_url: '', image_path: null, recipe: [{ fragment_type: 'a', amount: '10' }] };
  expect(artifactPayload(base)).toEqual({
    ok: true,
    payload: { name: 'Trevo', description: '', rarity: 'raro', luck_mult: 5, xp_mult: 1, money_mult: 1, active: true, image_url: null, image_path: null, recipe: [{ fragment_type: 'a', amount: 10 }] },
  });
  expect(artifactPayload({ ...base, name: '' })).toEqual({ ok: false, error: 'Dê um nome ao artefato.' });
  expect(artifactPayload({ ...base, luck: '1' })).toEqual({ ok: false, error: 'Dê pelo menos um bônus maior que 1x (sorte, XP ou moedas).' });
  expect(artifactPayload({ ...base, xp: '0,5' })).toEqual({ ok: false, error: 'Os bônus vão de 1x a 1000x.' });
  expect(artifactPayload({ ...base, recipe: [] })).toEqual({ ok: false, error: 'A receita precisa de pelo menos um fragmento.' });
  expect(artifactPayload({ ...base, recipe: [{ fragment_type: 'a', amount: '0' }] })).toEqual({ ok: false, error: 'Cada fragmento da receita precisa de quantidade maior que zero.' });
  expect(artifactPayload({ ...base, recipe: [{ fragment_type: 'a', amount: '1' }, { fragment_type: 'a', amount: '2' }] })).toEqual({ ok: false, error: 'Cada tipo de fragmento aparece uma vez só na receita.' });
  expect(artifactPayload({ ...base, image_url: 'http://x.test/a.png' })).toEqual({ ok: false, error: 'O link da imagem precisa começar com https://' });
});
