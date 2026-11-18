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

test('recycle sends the card and how many to trade', async () => {
  const { rpc, calls } = fakeRpc({ recycle: { data: { gained: 10, coins_after: 60 } } });
  const r = await createApi(rpc).recycle('c1', 2);
  expect(calls).toEqual([{ fn: 'recycle', args: { p_card: 'c1', p_quantity: 2 } }]);
  expect(r.gained).toBe(10);
});

test('level calls get_level and claim_level_reward', async () => {
  const { rpc, calls } = fakeRpc({ get_level: { data: { xp: 350, level: 3, level_start: 300, next_at: 600, reward: 250 } } });
  const a = createApi(rpc);
  const l = await a.level();
  await a.claimLevel();
  expect(l.level).toBe(3);
  expect(calls.map((c) => c.fn)).toEqual(['get_level', 'claim_level_reward']);
});

test('ranking and feed sign stored avatar paths but keep google photo urls', async () => {
  const { rpc } = fakeRpc({
    get_ranking: { data: [{ position: 1, value: 10, player: { id: 'u1', nickname: 'a', avatar_url: 'u1/a.webp' } }, { position: 2, value: 5, player: { id: 'u2', nickname: 'b', avatar_url: 'https://lh3.googleusercontent.com/x' } }] },
  });
  const sign = async (_b: string, paths: string[]) => Object.fromEntries(paths.map((p) => [p, `https://signed/${p}`]));
  const r = await createApi(rpc, sign).ranking('coins');
  expect(r[0].player.avatar_url).toBe('https://signed/u1/a.webp');
  expect(r[1].player.avatar_url).toBe('https://lh3.googleusercontent.com/x');
});

test('friends and other players call their RPCs with the right argument names', async () => {
  const { rpc, calls } = fakeRpc({});
  const a = createApi(rpc);
  await a.searchPlayers('dud');
  await a.sendFriend('u2');
  await a.respondFriend('u2', true);
  await a.removeFriend('u2');
  await a.friends();
  await a.playerCollection('u2');
  expect(calls).toEqual([
    { fn: 'search_players', args: { p_query: 'dud' } },
    { fn: 'send_friend_request', args: { p_user: 'u2' } },
    { fn: 'respond_friend_request', args: { p_user: 'u2', p_accept: true } },
    { fn: 'remove_friend', args: { p_user: 'u2' } },
    { fn: 'get_friends', args: undefined },
    { fn: 'get_player_collection', args: { p_user: 'u2' } },
  ]);
});

test('friends lists come with signed avatars and empty lists when the server sends nothing', async () => {
  const { rpc } = fakeRpc({ get_friends: { data: { friends: [{ id: 'u2', nickname: 'bia', avatar_url: 'u2/a.webp', level: 3 }], incoming: [], outgoing: null } } });
  const sign = async (_b: string, paths: string[]) => Object.fromEntries(paths.map((p) => [p, `https://signed/${p}`]));
  const f = await createApi(rpc, sign).friends();
  expect(f.friends[0].avatar_url).toBe('https://signed/u2/a.webp');
  expect(f.outgoing).toEqual([]);
});

test('another player collection: owned-by-me cards are full, the rest stay locked', async () => {
  const { rpc } = fakeRpc({
    get_player_collection: { data: [{ quantity: 2, card: dbCard }, { quantity: 1, card: { id: 'c9', number: 9, odds_n: 50, active: true } }] },
  });
  const [a, b] = await createApi(rpc).playerCollection('u2');
  expect(a.known && a.card.title).toBe('O grampeador');
  expect(b.known).toBe(false);
  expect('joke' in b.card).toBe(false);
  expect(b.quantity).toBe(1);
});

test('admin card delete and coin changes call their RPCs with the right argument names', async () => {
  const { rpc, calls } = fakeRpc({ admin_delete_card: { data: { owners: 3, image_path: 'a.webp' } } });
  const a = createApi(rpc);
  const d = await a.adminDeleteCard('c1');
  await a.adminSetCoins('u1', 500, 'teste');
  await a.adminAdjustCoins('u1', -20, 'multa');
  await a.adminListPlayers();
  expect(d).toEqual({ owners: 3, image_path: 'a.webp' });
  expect(calls).toEqual([
    { fn: 'admin_delete_card', args: { p_card: 'c1' } },
    { fn: 'admin_set_coins', args: { p_user: 'u1', p_coins: 500, p_reason: 'teste' } },
    { fn: 'admin_adjust_coins', args: { p_user: 'u1', p_amount: -20, p_reason: 'multa' } },
    { fn: 'admin_list_players', args: undefined },
  ]);
});

test('admin ideas and bans call their RPCs with the right argument names', async () => {
  const { rpc, calls } = fakeRpc({});
  const a = createApi(rpc);
  await a.adminListSuggestions('pending');
  await a.adminApproveSuggestion('s1', 'Título', 'Piada', 500);
  await a.adminRejectSuggestion('s2', 'repetida');
  await a.adminSetBanned('u1', true);
  expect(calls).toEqual([
    { fn: 'admin_list_suggestions', args: { p_status: 'pending' } },
    { fn: 'admin_approve_suggestion', args: { p_id: 's1', p_title: 'Título', p_joke: 'Piada', p_odds_n: 500 } },
    { fn: 'admin_reject_suggestion', args: { p_id: 's2', p_note: 'repetida' } },
    { fn: 'admin_set_banned', args: { p_user: 'u1', p_banned: true } },
  ]);
});

test('an idea photo is signed from the suggestions bucket and the raw path is kept for copying', async () => {
  const { rpc } = fakeRpc({
    admin_list_suggestions: { data: [{ id: 's1', text: 'Uma ideia boa demais', image_path: 'u1/a.webp', status: 'pending', created_at: '2026-11-18T00:00:00Z', author: { id: 'u1', nickname: 'bia', avatar_url: null } }] },
  });
  const buckets: string[] = [];
  const sign = async (b: string, paths: string[]) => (buckets.push(b), Object.fromEntries(paths.map((p) => [p, `https://${b}/${p}`])));
  const [s] = await createApi(rpc, sign).adminListSuggestions('pending');
  expect(s.image_url).toBe('https://suggestions/u1/a.webp');
  expect(s.image_path).toBe('u1/a.webp');
  expect(buckets).toContain('suggestions');
});

test('gifts, trades, challenges, missions and event call their RPCs with the right argument names', async () => {
  const { rpc, calls } = fakeRpc({});
  const a = createApi(rpc);
  await a.giftCard('u2', 'c1');
  await a.gifts();
  await a.proposeTrade('u2', 'c1', 'c2');
  await a.respondTrade('t1', true);
  await a.cancelTrade('t1');
  await a.trades();
  await a.createChallenge('u2', 50);
  await a.respondChallenge('h1', false);
  await a.cancelChallenge('h1');
  await a.challenges();
  await a.missions();
  await a.claimMission('roll_5');
  await a.weeklyEvent();
  expect(calls).toEqual([
    { fn: 'gift_card', args: { p_to: 'u2', p_card: 'c1' } },
    { fn: 'get_gifts', args: undefined },
    { fn: 'propose_trade', args: { p_to: 'u2', p_give: 'c1', p_want: 'c2' } },
    { fn: 'respond_trade', args: { p_trade: 't1', p_accept: true } },
    { fn: 'cancel_trade', args: { p_trade: 't1' } },
    { fn: 'get_trades', args: undefined },
    { fn: 'create_challenge', args: { p_to: 'u2', p_bet: 50 } },
    { fn: 'respond_challenge', args: { p_id: 'h1', p_accept: false } },
    { fn: 'cancel_challenge', args: { p_id: 'h1' } },
    { fn: 'get_challenges', args: undefined },
    { fn: 'get_missions', args: undefined },
    { fn: 'claim_mission', args: { p_id: 'roll_5' } },
    { fn: 'get_event', args: undefined },
  ]);
});

test('cards inside trades and duels stay locked unless the viewer owns them', async () => {
  const player = { id: 'u2', nickname: 'bia', avatar_url: null };
  const { rpc } = fakeRpc({
    get_trades: { data: { incoming: [{ id: 't1', status: 'pending', created_at: 'x', from: player, to: player, give: dbCard, want: { id: 'c9', number: 9, odds_n: 50, active: true } }], outgoing: null } },
    get_event: { data: { card: { id: 'c9', number: 9, odds_n: 5000, active: true }, multiplier: 2, starts_at: 'a', ends_at: 'b' } },
  });
  const api = createApi(rpc);
  const t = await api.trades();
  expect(t.incoming[0].give.known && t.incoming[0].give.card.title).toBe('O grampeador');
  expect(t.incoming[0].want.known).toBe(false);
  expect(t.outgoing).toEqual([]);
  const ev = await api.weeklyEvent();
  expect(ev?.card.known).toBe(false);
  expect(ev?.card.card.odds_n).toBe(5000);
});

test('music calls its RPCs with the right argument names and never fails on an empty answer', async () => {
  const { rpc, calls } = fakeRpc({});
  const a = createApi(rpc);
  expect(await a.loginMusic()).toEqual([]);
  expect(await a.rareMusic()).toEqual({ lendario: [], mitico: [] });
  await a.adminListTracks();
  await a.adminAddTrack('Tema', 'login/x.mp3', 'login');
  await a.adminDeleteTrack('m1');
  expect(calls.map((c) => [c.fn, c.args])).toEqual([
    ['get_login_music', undefined],
    ['get_rare_music', undefined],
    ['admin_list_tracks', undefined],
    ['admin_add_track', { p_title: 'Tema', p_path: 'login/x.mp3', p_slot: 'login' }],
    ['admin_delete_track', { p_id: 'm1' }],
  ]);
});
