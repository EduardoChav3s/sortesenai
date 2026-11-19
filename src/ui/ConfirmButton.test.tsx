import { act, fireEvent, render, screen } from '@testing-library/react';
import { ConfirmButton } from './ConfirmButton';

test('the first click only asks, the second one does it', () => {
  const go = vi.fn();
  render(<ConfirmButton className="btn" confirmLabel="Confirmar compra?" onConfirm={go}>Comprar</ConfirmButton>);
  fireEvent.click(screen.getByRole('button', { name: 'Comprar' }));
  expect(go).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar compra?' }));
  expect(go).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('button', { name: 'Comprar' })).toBeInTheDocument();
});

test('without a second click it goes back to normal after 4 seconds', () => {
  vi.useFakeTimers();
  const go = vi.fn();
  render(<ConfirmButton className="btn" confirmLabel="Confirmar?" onConfirm={go}>Apagar</ConfirmButton>);
  fireEvent.click(screen.getByRole('button', { name: 'Apagar' }));
  act(() => vi.advanceTimersByTime(4000));
  fireEvent.click(screen.getByRole('button', { name: 'Apagar' }));
  expect(go).not.toHaveBeenCalled();
  vi.useRealTimers();
});
