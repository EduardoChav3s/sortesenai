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

test('a potion needs a name, a price, a boost over 1x and a duration', () => {
  expect(itemPayload({ name: ' Gota ', description: 'x', price: '150', multiplier: '2,5', kind: 'minutes', duration: '10', active: true })).toEqual({
    ok: true,
    payload: { name: 'Gota', description: 'x', price: 150, multiplier: 2.5, duration_minutes: 10, duration_pulls: null, active: true },
  });
  expect(itemPayload({ name: 'Gota', description: '', price: '150', multiplier: '1', kind: 'pulls', duration: '5', active: true })).toEqual({ ok: false, error: 'A sorte precisa ser maior que 1x.' });
  expect(itemPayload({ name: '', description: '', price: '150', multiplier: '2', kind: 'pulls', duration: '5', active: true })).toEqual({ ok: false, error: 'Dê um nome à poção.' });
  expect(itemPayload({ name: 'Gota', description: '', price: '150', multiplier: '2', kind: 'pulls', duration: '0', active: true })).toEqual({ ok: false, error: 'Duração: use um número maior que zero.' });
});
