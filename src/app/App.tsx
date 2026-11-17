import { useEffect } from 'react';

export function App() {
  useEffect(() => {
    document.title = 'SorteSenai';
  }, []);
  return <main>SorteSenai</main>;
}
