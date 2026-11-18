import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SignOutButton } from './SignOutButton';

test('Sair signs out and then forgets the cached data of that account', async () => {
  const calls: string[] = [];
  render(<SignOutButton signOut={async () => void calls.push('signout')} forget={() => calls.push('forget')} />);
  await userEvent.click(screen.getByRole('button', { name: /sair/i }));
  expect(calls).toEqual(['signout', 'forget']);
});

test('while signing out the button is busy and cannot be clicked twice', async () => {
  let done!: () => void;
  const calls: string[] = [];
  render(<SignOutButton signOut={() => new Promise<void>((r) => ((done = r), calls.push('signout')))} forget={() => calls.push('forget')} />);
  await userEvent.click(screen.getByRole('button', { name: /sair/i }));
  expect(screen.getByRole('button', { name: /saindo/i })).toBeDisabled();
  done();
});
