export type Gate = 'demo' | 'login' | 'loading' | 'restricted' | 'banned' | 'app';

export function decideGate(s: { configured: boolean; signedIn: boolean; access: 'ok' | 'not_invited' | 'banned' | null }): Gate {
  if (!s.configured) return 'demo';
  if (!s.signedIn) return 'login';
  if (s.access === null) return 'loading';
  if (s.access === 'not_invited') return 'restricted';
  if (s.access === 'banned') return 'banned';
  return 'app';
}
