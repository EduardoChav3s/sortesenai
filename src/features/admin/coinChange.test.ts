import { coinChange } from './coinChange';

test('dar adds, tirar subtracts, definir sets the exact balance', () => {
  expect(coinChange('dar', '150', 1000)).toEqual({ ok: true, kind: 'adjust', amount: 150, after: 1150 });
  expect(coinChange('tirar', '200', 1000)).toEqual({ ok: true, kind: 'adjust', amount: -200, after: 800 });
  expect(coinChange('definir', '50', 1000)).toEqual({ ok: true, kind: 'set', coins: 50, after: 50 });
  expect(coinChange('definir', '0', 1000)).toEqual({ ok: true, kind: 'set', coins: 0, after: 0 });
});

test('bad amounts get a message instead', () => {
  expect(coinChange('dar', '', 1000)).toEqual({ ok: false, error: 'Digite um número.' });
  expect(coinChange('dar', '0', 1000)).toEqual({ ok: false, error: 'Use um número maior que zero.' });
  expect(coinChange('tirar', '1500', 1000)).toEqual({ ok: false, error: 'O jogador só tem 1.000 moedas.' });
  expect(coinChange('definir', '1000', 1000)).toEqual({ ok: false, error: 'Esse já é o saldo atual.' });
});
