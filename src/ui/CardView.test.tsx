import { render, screen } from '@testing-library/react';
import { CardView } from './CardView';

const card = { id: 'c1', odds_n: 400_000_000, active: true, title: 'Predador', joke: 'Cuidado com ele...' };

test('an owned card with a photo shows the photo', () => {
  render(<CardView entry={{ owned: true, quantity: 1, card: { ...card, image_url: '/cards/predador.webp' } }} />);
  expect(screen.getByRole('img', { name: 'Predador' })).toHaveAttribute('src', '/cards/predador.webp');
});

test('an owned card without a photo shows no image', () => {
  render(<CardView entry={{ owned: true, quantity: 1, card: { ...card, image_url: null } }} />);
  expect(screen.queryByRole('img', { name: 'Predador' })).toBeNull();
});

test('a locked card never shows the photo or the title', () => {
  render(<CardView entry={{ owned: false, quantity: 0, card: { id: 'c1', odds_n: 400_000_000, active: true } }} />);
  expect(screen.queryByRole('img')).toBeNull();
  expect(screen.queryByText('Predador')).toBeNull();
});
