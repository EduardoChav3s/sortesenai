import { fireEvent, render, screen } from '@testing-library/react';
import { ResetPanel } from './ResetPanel';

test('the reset needs two steps: open it, then type the exact phrase', () => {
  const onReset = vi.fn();
  render(<ResetPanel onReset={onReset} busy={false} />);
  expect(screen.queryByRole('button', { name: 'Apagar o progresso de todos' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'RESET GLOBAL DO SERVIDOR' }));
  const go = screen.getByRole('button', { name: 'Apagar o progresso de todos' });
  expect(go).toBeDisabled();
  fireEvent.change(screen.getByLabelText(/Digite RESETAR SERVIDOR/), { target: { value: 'resetar servidor' } });
  expect(go).toBeDisabled();
  fireEvent.change(screen.getByLabelText(/Digite RESETAR SERVIDOR/), { target: { value: 'RESETAR SERVIDOR' } });
  expect(go).toBeEnabled();
  fireEvent.click(go);
  expect(onReset).toHaveBeenCalledWith('RESETAR SERVIDOR');
});

test('cancel closes the confirmation without resetting', () => {
  const onReset = vi.fn();
  render(<ResetPanel onReset={onReset} busy={false} />);
  fireEvent.click(screen.getByRole('button', { name: 'RESET GLOBAL DO SERVIDOR' }));
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
  expect(screen.queryByLabelText(/Digite RESETAR SERVIDOR/)).toBeNull();
  expect(onReset).not.toHaveBeenCalled();
});

test('shows the last reset from the admin history', () => {
  render(<ResetPanel onReset={vi.fn()} busy={false} lastReset={{ at: '2026-11-18T22:00:00Z', by: 'duda', details: { players: 12, cards_removed: 340, coins_removed: 9000 } }} />);
  expect(screen.getByText(/Último reset/)).toHaveTextContent('duda');
  expect(screen.getByText(/Último reset/)).toHaveTextContent('12 jogadores');
});
