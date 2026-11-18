import { friendAction } from './friendAction';

test('each friend status gets the right button', () => {
  expect(friendAction('none')).toEqual({ label: 'Adicionar', act: 'send', primary: true });
  expect(friendAction('incoming')).toEqual({ label: 'Aceitar pedido', act: 'accept', primary: true });
  expect(friendAction('outgoing')).toEqual({ label: 'Cancelar pedido', act: 'remove', primary: false });
  expect(friendAction('friends')).toEqual({ label: 'Desfazer amizade', act: 'remove', primary: false });
});

test('your own profile has no friend button', () => {
  expect(friendAction('me')).toBeNull();
  expect(friendAction(undefined)).toBeNull();
});
