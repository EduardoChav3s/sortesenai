import { itemPayload, settingsPatch } from './gameForms';

const base = { pullCost: '10', dailyReward: '200', recycleBase: '5', slots: '500', memory: '300', reflex: '200', clicker: '200', bets: '10, 25, 50' };

test('the game settings form becomes one patch with numbers', () => {
  expect(settingsPatch(base)).toEqual({
    ok: true,
    patch: { pull_cost: 10, daily_reward: 200, recycle_base: 5, game_daily_limits: { slots: 500, memory: 300, reflex: 200, clicker: 200 }, slots_bets: [10, 25, 50] },
  });
});

test('bets are cleaned: spaces, repeats and order', () => {
  const r = settingsPatch({ ...base, bets: ' 50;10 , 25,10 ' });
  expect(r.ok && r.patch.slots_bets).toEqual([10, 25, 50]);
});

test('bad game settings get a message', () => {
  expect(settingsPatch({ ...base, pullCost: '0' })).toEqual({ ok: false, error: 'Custo da roletada: use um número maior que zero.' });
  expect(settingsPatch({ ...base, memory: '-3' })).toEqual({ ok: false, error: 'Limite da memória: use um número inteiro.' });
  expect(settingsPatch({ ...base, bets: '' })).toEqual({ ok: false, error: 'Apostas: coloque pelo menos um valor.' });
});

test('a potion picture: a pasted https link, a sent file, or none', () => {
  const base = { name: 'Gota', description: '', price: '150', multiplier: '2', kind: 'minutes' as const, duration: '10', active: true };
  expect(itemPayload({ ...base, image_url: ' https://site.test/gota.png ' })).toMatchObject({ ok: true, payload: { image_url: 'https://site.test/gota.png', image_path: null } });
  expect(itemPayload({ ...base, image_url: 'https://x.supabase.co/storage/v1/object/public/shop/a.webp', image_path: 'a.webp' })).toMatchObject({
    ok: true,
    payload: { image_path: 'a.webp' },
  });
  expect(itemPayload({ ...base, image_url: '' })).toMatchObject({ ok: true, payload: { image_url: null, image_path: null } });
  expect(itemPayload({ ...base, image_url: 'http://site.test/gota.png' })).toEqual({ ok: false, error: 'O link da imagem precisa começar com https://' });
  expect(itemPayload({ ...base, image_url: 'javascript:alert(1)' })).toEqual({ ok: false, error: 'O link da imagem precisa começar com https://' });
});

test('a potion needs a name, a price, a boost over 1x and a duration', () => {
  expect(itemPayload({ name: ' Gota ', description: 'x', price: '150', multiplier: '2,5', kind: 'minutes', duration: '10', active: true })).toEqual({
    ok: true,
    payload: { name: 'Gota', description: 'x', price: 150, multiplier: 2.5, duration_minutes: 10, duration_pulls: null, active: true, image_url: null, image_path: null, attribute: 'luck' },
  });
  expect(itemPayload({ name: 'Gota', description: '', price: '150', multiplier: '1', kind: 'pulls', duration: '5', active: true })).toEqual({ ok: false, error: 'A sorte precisa ser maior que 1x.' });
  expect(itemPayload({ name: '', description: '', price: '150', multiplier: '2', kind: 'pulls', duration: '5', active: true })).toEqual({ ok: false, error: 'Dê um nome à poção.' });
  expect(itemPayload({ name: 'Gota', description: '', price: '150', multiplier: '2', kind: 'pulls', duration: '0', active: true })).toEqual({ ok: false, error: 'Duração: use um número maior que zero.' });
});

test('a potion says what it amplifies: luck (default), XP or coins', () => {
  const base = { name: 'Gota', description: '', price: '150', multiplier: '2', kind: 'minutes' as const, duration: '10', active: true };
  expect(itemPayload(base)).toMatchObject({ ok: true, payload: { attribute: 'luck' } });
  expect(itemPayload({ ...base, attribute: 'xp' })).toMatchObject({ ok: true, payload: { attribute: 'xp' } });
  expect(itemPayload({ ...base, attribute: 'money' })).toMatchObject({ ok: true, payload: { attribute: 'money' } });
});
