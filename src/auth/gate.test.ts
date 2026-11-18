import { decideGate } from './gate';

test('without Supabase keys the site runs in demo mode', () => {
  expect(decideGate({ configured: false, signedIn: false, access: null })).toBe('demo');
});
test('configured but signed out shows the Google login', () => {
  expect(decideGate({ configured: true, signedIn: false, access: null })).toBe('login');
});
test('signed in while access is still loading waits', () => {
  expect(decideGate({ configured: true, signedIn: true, access: null })).toBe('loading');
});
test('an e-mail off the guest list is restricted', () => {
  expect(decideGate({ configured: true, signedIn: true, access: 'not_invited' })).toBe('restricted');
});
test('a banned player is restricted too', () => {
  expect(decideGate({ configured: true, signedIn: true, access: 'banned' })).toBe('banned');
});
test('an invited player enters the app', () => {
  expect(decideGate({ configured: true, signedIn: true, access: 'ok' })).toBe('app');
});
