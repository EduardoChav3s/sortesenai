import { cachedSigner } from './signCache';

function fakeSign() {
  const calls: string[][] = [];
  let n = 0;
  const sign = async (_bucket: string, paths: string[]) => {
    calls.push(paths);
    n++;
    return Object.fromEntries(paths.map((p) => [p, `https://signed/${p}?v=${n}`]));
  };
  return { sign, calls };
}

test('the same photo keeps the same link, so the browser downloads it only once', async () => {
  const f = fakeSign();
  let now = 0;
  const sign = cachedSigner(f.sign, () => now);
  const a = await sign('cards', ['x.webp', 'y.webp']);
  now = 20 * 60_000; // 20 minutes later
  const b = await sign('cards', ['x.webp', 'z.webp']);
  expect(b['x.webp']).toBe(a['x.webp']);
  expect(f.calls).toEqual([['x.webp', 'y.webp'], ['z.webp']]);
});

test('a link close to expiring is renewed', async () => {
  const f = fakeSign();
  let now = 0;
  const sign = cachedSigner(f.sign, () => now);
  const a = await sign('cards', ['x.webp']);
  now = 55 * 60_000; // 55 minutes: less than 10 minutes left of the hour
  const b = await sign('cards', ['x.webp']);
  expect(b['x.webp']).not.toBe(a['x.webp']);
  expect(f.calls.length).toBe(2);
});

test('different buckets never share a link', async () => {
  const f = fakeSign();
  const sign = cachedSigner(f.sign, () => 0);
  await sign('cards', ['a.webp']);
  await sign('profile', ['a.webp']);
  expect(f.calls).toEqual([['a.webp'], ['a.webp']]);
});

test('two lists asking for the same photo at the same time get the same link', async () => {
  // the roll and the album load together; one link must not replace the other
  const f = fakeSign();
  const sign = cachedSigner(f.sign, () => 0);
  const [reel, album] = await Promise.all([sign('cards', ['x.webp', 'y.webp']), sign('cards', ['y.webp', 'z.webp'])]);
  expect(album['y.webp']).toBe(reel['y.webp']);
  expect((await sign('cards', ['y.webp']))['y.webp']).toBe(reel['y.webp']);
  expect(f.calls).toEqual([['x.webp', 'y.webp'], ['z.webp']]);
});

test('when signing fails, the next ask tries again', async () => {
  let fail = true;
  const calls: string[][] = [];
  const sign = cachedSigner(async (_bucket, paths) => {
    calls.push(paths);
    if (fail) throw new Error('offline');
    return Object.fromEntries(paths.map((p) => [p, `https://signed/${p}`]));
  }, () => 0);
  await expect(sign('cards', ['x.webp'])).rejects.toThrow('offline');
  fail = false;
  expect((await sign('cards', ['x.webp']))['x.webp']).toBe('https://signed/x.webp');
  expect(calls.length).toBe(2);
});

test('a photo the server could not sign is left out and asked again next time', async () => {
  const calls: string[][] = [];
  const sign = cachedSigner(async (_bucket, paths) => {
    calls.push(paths);
    return calls.length === 1 ? {} : Object.fromEntries(paths.map((p) => [p, `https://signed/${p}`]));
  }, () => 0);
  expect(await sign('cards', ['x.webp'])).toEqual({});
  expect(await sign('cards', ['x.webp'])).toEqual({ 'x.webp': 'https://signed/x.webp' });
  expect(calls.length).toBe(2);
});
