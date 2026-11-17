import { render } from '@testing-library/react';
import { App } from './App';

test('renders and keeps the SorteSenai title', () => {
  render(<App />);
  expect(document.title).toBe('SorteSenai');
});
