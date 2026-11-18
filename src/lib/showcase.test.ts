import { toggleShowcase } from './showcase';

test('picking adds a card and picking again removes it', () => {
  expect(toggleShowcase([], 'a')).toEqual(['a']);
  expect(toggleShowcase(['a', 'b'], 'a')).toEqual(['b']);
});

test('the showcase holds at most 3 cards', () => {
  expect(toggleShowcase(['a', 'b', 'c'], 'd')).toEqual(['a', 'b', 'c']);
});
