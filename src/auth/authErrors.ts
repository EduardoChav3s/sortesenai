import { LoginError, type LoginErrorCode } from './LoginPage';

const BY_CODE: Record<string, LoginErrorCode> = {
  invalid_credentials: 'invalid_credentials',
  email_not_confirmed: 'email_not_confirmed',
  user_already_exists: 'user_exists',
  email_exists: 'user_exists',
  weak_password: 'weak_password',
  over_request_rate_limit: 'rate_limited',
  over_email_send_rate_limit: 'rate_limited',
};

/** Turns a Supabase Auth error into the login page's own error codes. */
export function toLoginError(err: unknown): LoginError {
  const e = (err ?? {}) as { code?: string; message?: string };
  if (e.code && BY_CODE[e.code]) return new LoginError(BY_CODE[e.code]);
  if (e.message && /invalid login credentials/i.test(e.message)) return new LoginError('invalid_credentials');
  return new LoginError('unknown');
}
