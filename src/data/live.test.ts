import { toFeedRow } from './live';
import type { FeedEvent } from './types';

const ev = {
  id: '7',
  player: { id: 'u1', nickname: 'duda', avatar_url: null, avatar_card: null, title_name: null, frame_item_id: null, name_effect_item_id: null },
  card: { id: 'c1', odds_n: 3_000_000, active: true, title: 'A prova surpresa', joke: 'x', image_url: null },
  odds_n_at_pull: 3_000_000,
  luck: 5,
  created_at: new Date(Date.now() - 2 * 60_000).toISOString(),
} satisfies FeedEvent;

test('a feed event becomes a mural row with initials, card and relative time', () => {
  const row = toFeedRow(ev, Date.now());
  expect(row.player.name).toBe('duda');
  expect(row.player.initials).toBe('DU');
  expect(row.card).toBe('A prova surpresa');
  expect(row.odds_n).toBe(3_000_000);
  expect(row.ago).toBe('há 2 min');
});

test('the same nickname always gets the same avatar color', () => {
  expect(toFeedRow(ev, Date.now()).player.hue).toBe(toFeedRow(ev, Date.now()).player.hue);
});

test('a mural row keeps the player id so the name can open their profile', () => {
  expect(toFeedRow(ev, Date.now()).player.id).toBe('u1');
});
