import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ErrorScreen, NotFoundPage } from './Problems';

function Boom(): JSX.Element {
  throw new Error('quebrou');
}

test('a crash inside the page shows a friendly screen instead of a blank page', () => {
  const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
  render(
    <ErrorScreen>
      <Boom />
    </ErrorScreen>,
  );
  expect(screen.getByText(/algo deu errado/i)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /recarregar/i })).toBeInTheDocument();
  spy.mockRestore();
});

test('a page without a crash renders normally', () => {
  render(<ErrorScreen>tudo certo</ErrorScreen>);
  expect(screen.getByText('tudo certo')).toBeInTheDocument();
});

test('an unknown address shows the not found page with a way back', () => {
  render(
    <MemoryRouter initialEntries={['/nao-existe']}>
      <Routes>
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </MemoryRouter>,
  );
  expect(screen.getByText(/página não encontrada/i)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /voltar para roletar/i })).toHaveAttribute('href', '/');
});
