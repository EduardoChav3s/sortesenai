import { ApiError } from './errors';
import { createApi, type Rpc } from './api';

// A stand-in for supabase.rpc that records calls and answers from a table.
function fakeRpc(answers: Record<string, { data?: unknown; error?: { message: string } }>) {
  const calls: { fn: string; args?: object }[] = [];
  const rpc: Rpc = async (fn, args) => {
    calls.push({ fn, args });
    const a = answers[fn] ?? { data: null };
    return { data: a.data ?? null, error: a.error ?? null };
  };
  return { rpc, calls };
}

const dbCard = { id: 'c1', number: 12, odds_n: 400_000_000, active: true, title: 'O grampeador', joke: 'Ele sabe.', image_path: null };

test('a database error code becomes an ApiError with the same code', async () => {
  const { rpc } = fakeRpc({ pull: { error: { message: 'insufficient_coins' } } });
  const err = await createApi(rpc).pull().catch((e) => e);
  expect(err).toBeInstanceOf(ApiError);
  expect((err as ApiError).code).toBe('insufficient_coins');
});

test('an unexpected database error becomes code unknown', async () => {
  const { rpc } = fakeRpc({ pull: { error: { message: 'connection reset' } } });
  const err = (await createApi(rpc).pull().catch((e) => e)) as ApiError;
  expect(err.code).toBe('unknown');
});

test('pull returns the card with image_url instead of image_path', async () => {
  const { rpc } = fakeRpc({
    pull: { data: { card: dbCard, odds_n_at_pull: 400_000_000, luck_used: 5, is_new: true, quantity: 1, coins_after: 490, feed_posted: true, titles_unlocked: [] } },
  });
  const r = await createApi(rpc).pull();
  expect(r.card.title).toBe('O grampeador');
  expect(r.card.image_url).toBeNull();
  expect('image_path' in r.card).toBe(false);
  expect(r.coins_after).toBe(490);
});

test('a locked collection entry carries no joke, title or image', async () => {
  const { rpc } = fakeRpc({
    get_collection: { data: [{ owned: false, quantity: 0, card: { id: 'c2', number: 13, odds_n: 10_000_000_000, active: true } }] },
  });
  const [entry] = await createApi(rpc).getCollection();
  expect(entry.owned).toBe(false);
  expect(Object.keys(entry.card).sort()).toEqual(['active', 'id', 'number', 'odds_n']);
});

test('play_slots sends the bet as p_bet', async () => {
  const { rpc, calls } = fakeRpc({ play_slots: { data: { reels: ['cafe', 'cafe', 'cafe'], payout: 100, capped: false, coins_after: 590 } } });
  await createApi(rpc).playSlots(10);
  expect(calls).toEqual([{ fn: 'play_slots', args: { p_bet: 10 } }]);
});

test('remaining pages call their RPCs with the right argument names', async () => {
  const { rpc, calls } = fakeRpc({});
  const a = createApi(rpc);
  await a.profile('u1');
  await a.adminListCards();
  await a.adminSetCardActive('c1', false);
  await a.adminAddEmail('x@y.com');
  await a.adminRemoveEmail('x@y.com');
  await a.adminUpsertCard({ title: 't', joke: 'j', odds_n: 50 });
  expect(calls).toEqual([
    { fn: 'get_profile', args: { p_user: 'u1' } },
    { fn: 'admin_list_cards', args: undefined },
    { fn: 'admin_set_card_active', args: { p_card: 'c1', p_active: false } },
    { fn: 'admin_add_allowed_email', args: { p_email: 'x@y.com' } },
    { fn: 'admin_remove_allowed_email', args: { p_email: 'x@y.com' } },
    { fn: 'admin_upsert_card', args: { p: { title: 't', joke: 'j', odds_n: 50 } } },
  ]);
});

// ---------------------------------------------------------------- roll 10, images, games
import { rollMany } from './api';

test('rollMany pulls one after another and stops at the first error', async () => {
  let n = 0;
  const pull = async () => {
    n++;
    if (n === 4) throw new ApiError('insufficient_coins', 'insufficient_coins');
    return n;
  };
  const r = await rollMany(pull, 10);
  expect(r.results).toEqual([1, 2, 3]);
  expect((r.error as ApiError).code).toBe('insufficient_coins');
  expect(n).toBe(4);
});

test('rollMany returns all results when every pull works', async () => {
  let n = 0;
  const r = await rollMany(async () => ++n, 10);
  expect(r.results).toHaveLength(10);
  expect(r.error).toBeNull();
});

test('card images are turned into signed urls by the sign function', async () => {
  const { rpc } = fakeRpc({
    get_collection: { data: [{ owned: true, quantity: 1, card: { ...dbCard, image_path: 'a.webp' } }, { owned: true, quantity: 2, card: dbCard }] },
  });
  const signed: string[][] = [];
  const sign = async (bucket: string, paths: string[]) => {
    signed.push([bucket, ...paths]);
    return Object.fromEntries(paths.map((p) => [p, `https://signed/${p}`]));
  };
  const [a, b] = await createApi(rpc, sign).getCollection();
  expect(a.owned && a.card.image_url).toBe('https://signed/a.webp');
  expect(b.owned && b.card.image_url).toBeNull();
  expect(signed).toEqual([['cards', 'a.webp']]);
});

test('profile banner path becomes a signed url from the profile bucket', async () => {
  const { rpc } = fakeRpc({
    get_profile: { data: { profile: { id: 'u1', nickname: 'Duda', avatar_url: null, title_name: null, bio: '', banner_url: 'u1/banner.webp', showcase: [] }, stats: { pulls: 0, collection_pct: 0, rarest_odds: null }, titles: [], is_me: true } },
  });
  const sign = async (bucket: string, paths: string[]) => Object.fromEntries(paths.map((p) => [p, `https://${bucket}/${p}`]));
  const v = await createApi(rpc, sign).profile('u1');
  expect(v.profile.banner_url).toBe('https://profile/u1/banner.webp');
});

test('games and card image call their RPCs with the right argument names', async () => {
  const { rpc, calls } = fakeRpc({});
  const a = createApi(rpc);
  await a.startMemory();
  await a.flipMemory('s1', 3);
  await a.startReflex();
  await a.finishReflex('s2');
  await a.startClicker();
  await a.finishClicker('s3', 42);
  await a.adminUpsertCard({ title: 't', joke: 'j', odds_n: 50, image_path: 'x.webp' });
  expect(calls).toEqual([
    { fn: 'start_memory', args: undefined },
    { fn: 'flip_memory', args: { p_session: 's1', p_index: 3 } },
    { fn: 'start_reflex', args: undefined },
    { fn: 'finish_reflex', args: { p_session: 's2' } },
    { fn: 'start_clicker', args: undefined },
    { fn: 'finish_clicker', args: { p_session: 's3', p_clicks: 42 } },
    { fn: 'admin_upsert_card', args: { p: { title: 't', joke: 'j', odds_n: 50, image_path: 'x.webp' } } },
  ]);
});
