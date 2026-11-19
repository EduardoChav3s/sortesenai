import { onlineFrom, typingLine, typingNow } from './chatRoom';

test('online list: one entry per player (several tabs count once), sorted by name, me first', () => {
  const state = {
    a: [{ id: 'u2', nickname: 'leo', avatar_url: null, level: 3 }],
    b: [{ id: 'u1', nickname: 'ana', avatar_url: null, level: 5 }, { id: 'u1', nickname: 'ana', avatar_url: null, level: 5 }],
    c: [{ id: 'me', nickname: 'duda', avatar_url: null, level: 9 }],
  };
  expect(onlineFrom(state, 'me').map((p) => p.nickname)).toEqual(['duda', 'ana', 'leo']);
});

test('typing: only others, and only in the last 3 seconds', () => {
  const now = 10_000;
  const seen = { me: { nickname: 'duda', at: 9_900 }, u1: { nickname: 'ana', at: 8_000 }, u2: { nickname: 'leo', at: 6_000 } };
  expect(typingNow(seen, now, 'me')).toEqual(['ana']);
});

test('typing line reads naturally', () => {
  expect(typingLine([])).toBeNull();
  expect(typingLine(['ana'])).toBe('ana está digitando');
  expect(typingLine(['ana', 'leo'])).toBe('ana e leo estão digitando');
  expect(typingLine(['ana', 'leo', 'bia'])).toBe('3 pessoas estão digitando');
});
