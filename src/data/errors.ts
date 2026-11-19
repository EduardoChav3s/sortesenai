export type ApiErrorCode =
  | 'insufficient_coins'
  | 'not_found'
  | 'forbidden'
  | 'not_invited'
  | 'banned'
  | 'invalid'
  | 'nickname_taken'
  | 'already_claimed'
  | 'session_expired'
  | 'not_authenticated'
  | 'slow_down'
  | 'missing_materials'
  | 'unknown';

export class ApiError extends Error {
  constructor(
    public code: ApiErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function isApiError(e: unknown): e is ApiError {
  return e instanceof ApiError;
}
