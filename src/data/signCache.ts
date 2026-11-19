import type { Sign } from './api';

const LINK_LIFETIME_MS = 60 * 60_000; // links are created for one hour
const RENEW_BEFORE_MS = 10 * 60_000; // ask for a new one when less than 10 minutes are left

/**
 * Keeps each photo's private link while it is valid. Asking again for the same photo returns the same
 * link, so the browser reuses the file it already downloaded instead of fetching it again. A link still on
 * its way is shared too: the roll and the album load together, and both must get the same link.
 */
export function cachedSigner(sign: Sign, now: () => number = Date.now): Sign {
  const cache = new Map<string, { link: Promise<string | undefined>; expires: number }>();
  const forget = (key: string, entry: object) => {
    if (cache.get(key) === entry) cache.delete(key);
  };
  return async (bucket, paths) => {
    const keyOf = (p: string) => `${bucket}:${p}`;
    const valid = (p: string) => {
      const hit = cache.get(keyOf(p));
      return hit !== undefined && hit.expires - now() > RENEW_BEFORE_MS;
    };
    const missing = [...new Set(paths)].filter((p) => !valid(p));
    if (missing.length > 0) {
      const batch = sign(bucket, missing);
      const expires = now() + LINK_LIFETIME_MS;
      for (const p of missing) {
        const key = keyOf(p);
        const entry = { link: batch.then((links) => links[p] as string | undefined), expires };
        cache.set(key, entry);
        // a failed or empty answer is dropped, so the next ask tries again
        entry.link.then((link) => !link && forget(key, entry), () => forget(key, entry));
      }
    }
    const links = await Promise.all(paths.map((p) => cache.get(keyOf(p))!.link));
    const out: Record<string, string> = {};
    paths.forEach((p, i) => {
      const link = links[i];
      if (link) out[p] = link;
    });
    return out;
  };
}
