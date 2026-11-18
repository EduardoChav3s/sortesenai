import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LoginPage, LoginError, type LoginDeps } from './LoginPage';

function deps(over: Partial<LoginDeps> = {}): LoginDeps & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    signInGoogle: async () => void calls.push('google'),
    signInPassword: async (e) => void calls.push(`password:${e}`),
    signUp: async (e) => (calls.push(`signup:${e}`), { needsConfirm: true }),
    isAdmin: async () => true,
    signOut: async () => void calls.push('signout'),
    ...over,
  };
}

async function fill(email: string, password: string) {
  await userEvent.type(screen.getByLabelText(/e-mail/i), email);
  await userEvent.type(screen.getByLabelText(/^senha/i), password);
}

test('Google button starts Google sign-in', async () => {
  const d = deps();
  render(<LoginPage deps={d} />);
  await userEvent.click(screen.getByRole('button', { name: /continuar com google/i }));
  expect(d.calls).toEqual(['google']);
});

test('sign in with e-mail and password', async () => {
  const d = deps();
  render(<LoginPage deps={d} />);
  await fill('duda@turma.test', 'senha-forte-1');
  await userEvent.click(screen.getByRole('button', { name: /^entrar$/i }));
  expect(d.calls).toEqual(['password:duda@turma.test']);
});

test('wrong password shows a clear message', async () => {
  const d = deps({ signInPassword: async () => { throw new LoginError('invalid_credentials'); } });
  render(<LoginPage deps={d} />);
  await fill('duda@turma.test', 'errada123');
  await userEvent.click(screen.getByRole('button', { name: /^entrar$/i }));
  expect(await screen.findByRole('alert')).toHaveTextContent(/e-mail ou senha incorretos/i);
});

test('create account needs a password of 8+ characters', async () => {
  const d = deps();
  render(<LoginPage deps={d} />);
  await userEvent.click(screen.getByRole('tab', { name: /criar conta/i }));
  await fill('nova@turma.test', 'curta');
  await userEvent.type(screen.getByLabelText(/confirmar senha/i), 'curta');
  await userEvent.click(screen.getByRole('button', { name: /criar conta/i }));
  expect(await screen.findByRole('alert')).toHaveTextContent(/pelo menos 8/i);
  expect(d.calls).toEqual([]);
});

test('create account rejects a confirmation that does not match', async () => {
  const d = deps();
  render(<LoginPage deps={d} />);
  await userEvent.click(screen.getByRole('tab', { name: /criar conta/i }));
  await fill('nova@turma.test', 'senha-forte-1');
  await userEvent.type(screen.getByLabelText(/confirmar senha/i), 'senha-forte-2');
  await userEvent.click(screen.getByRole('button', { name: /criar conta/i }));
  expect(await screen.findByRole('alert')).toHaveTextContent(/não são iguais/i);
  expect(d.calls).toEqual([]);
});

test('create account asks to confirm the e-mail', async () => {
  const d = deps();
  render(<LoginPage deps={d} />);
  await userEvent.click(screen.getByRole('tab', { name: /criar conta/i }));
  await fill('nova@turma.test', 'senha-forte-1');
  await userEvent.type(screen.getByLabelText(/confirmar senha/i), 'senha-forte-1');
  await userEvent.click(screen.getByRole('button', { name: /criar conta/i }));
  expect(await screen.findByText(/confira seu e-mail/i)).toBeInTheDocument();
  expect(d.calls).toEqual(['signup:nova@turma.test']);
});

test('admin login lets an admin through to the panel', async () => {
  const onAdmin = vi.fn();
  const d = deps();
  render(<LoginPage deps={d} onAdmin={onAdmin} />);
  await userEvent.click(screen.getByRole('button', { name: /sou admin/i }));
  expect(screen.queryByRole('button', { name: /continuar com google/i })).toBeNull();
  await fill('duda@turma.test', 'senha-forte-1');
  await userEvent.click(screen.getByRole('button', { name: /entrar no painel/i }));
  expect(onAdmin).toHaveBeenCalled();
});

test('admin login blocks a player who is not admin and signs them out', async () => {
  const onAdmin = vi.fn();
  const d = deps({ isAdmin: async () => false });
  render(<LoginPage deps={d} onAdmin={onAdmin} />);
  await userEvent.click(screen.getByRole('button', { name: /sou admin/i }));
  await fill('ana@turma.test', 'senha-forte-1');
  await userEvent.click(screen.getByRole('button', { name: /entrar no painel/i }));
  expect(await screen.findByRole('alert')).toHaveTextContent(/não é admin/i);
  expect(d.calls).toContain('signout');
  expect(onAdmin).not.toHaveBeenCalled();
});
