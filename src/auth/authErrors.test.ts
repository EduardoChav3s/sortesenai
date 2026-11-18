import { toLoginError } from './authErrors';

test.each([
  [{ code: 'invalid_credentials' }, 'invalid_credentials'],
  [{ code: 'email_not_confirmed' }, 'email_not_confirmed'],
  [{ code: 'user_already_exists' }, 'user_exists'],
  [{ code: 'email_exists' }, 'user_exists'],
  [{ code: 'weak_password' }, 'weak_password'],
  [{ code: 'over_request_rate_limit' }, 'rate_limited'],
  [{ code: 'over_email_send_rate_limit' }, 'rate_limited'],
  [{ message: 'Invalid login credentials' }, 'invalid_credentials'],
  [{ code: 'something_new' }, 'unknown'],
  [null, 'unknown'],
])('Supabase error %j becomes %s', (err, code) => {
  expect(toLoginError(err).code).toBe(code);
});
