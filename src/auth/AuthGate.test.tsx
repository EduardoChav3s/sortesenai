import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthGate, type AuthDeps } from './AuthGate';

function fakeDeps(opts: { signedIn: boolean; access?: 'ok' | 'not_invited' | 'banned'; updated?: string[] }): AuthDeps {
  return {
    getSession: async () => (opts.signedIn ? { email: 'duda@turma.test' } : null),
    onChange: () => () => {},
    signInGoogle: async () => {},
    signInPassword: async () => {},
    signUp: async () => ({ needsConfirm: true }),
    isAdmin: async () => false,
    signOut: async () => {},
    resetPassword: async () => {},
    updatePassword: async (pw) => void opts.updated?.push(pw),
    checkAccess: async () => opts.access ?? 'ok',
  };
}

test('demo mode shows the app without login', () => {
  render(<AuthGate deps={null}>conteudo</AuthGate>);
  expect(screen.getByText('conteudo')).toBeInTheDocument();
});

test('signed out shows the Google button and hides the app', async () => {
  render(<AuthGate deps={fakeDeps({ signedIn: false })}>conteudo</AuthGate>);
  expect(await screen.findByRole('button', { name: /continuar com google/i })).toBeInTheDocument();
  expect(screen.queryByText('conteudo')).toBeNull();
});

test('an e-mail off the guest list sees the restricted screen', async () => {
  render(<AuthGate deps={fakeDeps({ signedIn: true, access: 'not_invited' })}>conteudo</AuthGate>);
  expect(await screen.findByText(/acesso restrito/i)).toBeInTheDocument();
  expect(screen.queryByText('conteudo')).toBeNull();
});

test('a banned player sees the suspended screen', async () => {
  render(<AuthGate deps={fakeDeps({ signedIn: true, access: 'banned' })}>conteudo</AuthGate>);
  expect(await screen.findByText(/conta suspensa/i)).toBeInTheDocument();
});

test('a repeated signed-in event from Supabase does not leave the gate stuck loading', async () => {
  let fire: (v: boolean) => void = () => {};
  const deps = { ...fakeDeps({ signedIn: true, access: 'ok' }), onChange: (cb: (v: boolean) => void) => ((fire = cb), () => {}) };
  render(<AuthGate deps={deps}>conteudo</AuthGate>);
  expect(await screen.findByText('conteudo')).toBeInTheDocument();
  await act(async () => fire(true)); // Supabase emits INITIAL_SESSION / TOKEN_REFRESHED with the same user
  expect(await screen.findByText('conteudo')).toBeInTheDocument();
});

test('a failed access check shows a retry instead of loading forever', async () => {
  const deps = { ...fakeDeps({ signedIn: true }), checkAccess: () => Promise.reject(new Error('offline')) };
  render(<AuthGate deps={deps}>conteudo</AuthGate>);
  expect(await screen.findByRole('button', { name: /tentar de novo/i })).toBeInTheDocument();
});

test('an invited player sees the app', async () => {
  render(<AuthGate deps={fakeDeps({ signedIn: true, access: 'ok' })}>conteudo</AuthGate>);
  expect(await screen.findByText('conteudo')).toBeInTheDocument();
});

test('the reset link opens the new password screen and saves the new password', async () => {
  window.history.pushState({}, '', '/nova-senha');
  const updated: string[] = [];
  render(<AuthGate deps={fakeDeps({ signedIn: true, updated })}>conteudo</AuthGate>);
  await userEvent.type(await screen.findByLabelText(/^nova senha/i), 'segredo123');
  await userEvent.type(screen.getByLabelText(/repita/i), 'segredo999');
  await userEvent.click(screen.getByRole('button', { name: /salvar senha/i }));
  expect(screen.getByRole('alert')).toHaveTextContent(/não são iguais/i);
  await userEvent.clear(screen.getByLabelText(/repita/i));
  await userEvent.type(screen.getByLabelText(/repita/i), 'segredo123');
  await userEvent.click(screen.getByRole('button', { name: /salvar senha/i }));
  expect(updated).toEqual(['segredo123']);
  window.history.pushState({}, '', '/');
});
