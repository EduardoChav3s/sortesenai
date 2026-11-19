import { adminEventNotice, keysForAdminEvent } from './adminEvents';

test('each kind of admin change refreshes the lists that show it', () => {
  expect(keysForAdminEvent('cards')).toEqual(['admin-cards', 'collection', 'event', 'reel']);
  expect(keysForAdminEvent('suggestions')).toEqual(['admin-suggestions']);
  expect(keysForAdminEvent('profiles')).toEqual(['admin-players', 'role']);
  expect(keysForAdminEvent('items')).toEqual(['admin-items', 'shop']);
  expect(keysForAdminEvent('titles')).toEqual(['admin-titles', 'shop']);
  expect(keysForAdminEvent('settings')).toEqual(['settings', 'missions', 'event', 'limits']);
  expect(keysForAdminEvent('music_tracks')).toEqual(['music']);
  expect(keysForAdminEvent('something_new')).toEqual([]);
});

test('a change by another admin gets a notice; my own changes do not', () => {
  expect(adminEventNotice('cards', 'u2', 'u1')).toBe('Outro admin mudou as cartas.');
  expect(adminEventNotice('settings', 'u2', 'u1')).toBe('Outro admin mudou as regras do jogo.');
  expect(adminEventNotice('cards', 'u1', 'u1')).toBeNull();
  expect(adminEventNotice('suggestions', null, 'u1')).toBe('Chegou uma ideia nova ou uma ideia mudou.');
});
