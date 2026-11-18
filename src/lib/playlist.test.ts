import { nextIndex, pickRandom } from './playlist';

test('the playlist goes to the next song and loops at the end', () => {
  expect(nextIndex(0, 3)).toBe(1);
  expect(nextIndex(2, 3)).toBe(0);
  expect(nextIndex(0, 0)).toBe(-1);
});

test('pickRandom chooses with the given random number and handles an empty list', () => {
  expect(pickRandom(['a', 'b', 'c'], 0.99)).toBe('c');
  expect(pickRandom(['a', 'b', 'c'], 0)).toBe('a');
  expect(pickRandom([], 0.5)).toBeNull();
});

import { needsTapToStart } from './playlist';

test('the tap screen shows only when there is music, the player wants it and the browser blocked it', () => {
  expect(needsTapToStart({ hasTracks: true, wanted: true, blocked: true, dismissed: false })).toBe(true);
  expect(needsTapToStart({ hasTracks: true, wanted: true, blocked: false, dismissed: false })).toBe(false);
  expect(needsTapToStart({ hasTracks: false, wanted: true, blocked: true, dismissed: false })).toBe(false);
  expect(needsTapToStart({ hasTracks: true, wanted: false, blocked: true, dismissed: false })).toBe(false);
  expect(needsTapToStart({ hasTracks: true, wanted: true, blocked: true, dismissed: true })).toBe(false);
});
