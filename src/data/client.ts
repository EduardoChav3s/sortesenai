import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createApi, type Api, type Sign } from './api';
import { checkImage, imagePath } from './upload';
import type { AuthDeps } from '@/auth/AuthGate';
import { toLoginError } from '@/auth/authErrors';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** null when the keys are not set: the site then runs in demo mode with sample data. */
export const supabase: SupabaseClient | null = url && anonKey ? createClient(url, anonKey) : null;

// Private buckets: images are shown through urls that expire in one hour.
const sign: Sign = async (bucket, paths) => {
  const { data } = await supabase!.storage.from(bucket).createSignedUrls(paths, 3600);
  return Object.fromEntries((data ?? []).filter((d) => d.path && d.signedUrl).map((d) => [d.path as string, d.signedUrl as string]));
};

export const api: Api | null = supabase
  ? createApi(async (fn, args) => {
      const { data, error } = await supabase.rpc(fn, args);
      return { data, error: error ? { message: error.message } : null };
    }, sign)
  : null;

/** Uploads an image and returns its storage path. Profile and suggestion files go in the player's own folder. */
export async function uploadImage(bucket: 'cards' | 'profile' | 'suggestions', file: File): Promise<string> {
  const problem = checkImage(file);
  if (problem) throw new Error(problem);
  const folder = bucket === 'cards' ? undefined : (await myUserId()) ?? undefined;
  const path = imagePath(file, folder);
  const { error } = await supabase!.storage.from(bucket).upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw new Error('Não deu para enviar a imagem.');
  return path;
}

export const authDeps: AuthDeps | null = supabase
  ? {
      async getSession() {
        const { data } = await supabase.auth.getSession();
        return data.session ? { email: data.session.user.email ?? '' } : null;
      },
      onChange(cb) {
        const { data } = supabase.auth.onAuthStateChange((_e, session) => cb(!!session));
        return () => data.subscription.unsubscribe();
      },
      async signInGoogle() {
        const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } });
        if (error) throw toLoginError(error);
      },
      async signInPassword(email, password) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw toLoginError(error);
      },
      async signUp(email, password) {
        const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } });
        if (error) throw toLoginError(error);
        // Supabase hides "already registered" behind an empty identities list.
        if (data.user && data.user.identities?.length === 0) throw toLoginError({ code: 'user_already_exists' });
        return { needsConfirm: !data.session };
      },
      async isAdmin() {
        const { data } = await supabase.from('profiles').select('role').maybeSingle();
        if (!data) await api!.session(); // first login: creates the profile
        const again = data ?? (await supabase.from('profiles').select('role').maybeSingle()).data;
        return again?.role === 'admin';
      },
      async signOut() {
        await supabase.auth.signOut();
      },
      async checkAccess() {
        return (await api!.session()).access;
      },
    }
  : null;

export async function fetchWallet() {
  if (!supabase) return null;
  const { data, error } = await supabase.from('profiles').select('coins, nickname, avatar_url').single();
  if (error) throw error;
  return data as { coins: number; nickname: string; avatar_url: string | null };
}

// ---------------------------------------------------------------- table reads allowed by RLS
async function rows<T>(q: PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T[]> {
  const { data, error } = await q;
  if (error) throw error;
  return (data as T[]) ?? [];
}
export async function myUserId() {
  return (await supabase!.auth.getSession()).data.session?.user.id ?? null;
}
export interface ShopItem { id: string; name: string; description: string; price: number; multiplier: number; duration_minutes: number | null; duration_pulls: number | null }
export interface ShopTitle { id: string; name: string; description: string; price: number | null }
export const fetchShop = async () => {
  const uid = await myUserId();
  const [items, titles, mine, myTitles] = await Promise.all([
    rows<ShopItem>(supabase!.from('items').select('id, name, description, price, multiplier, duration_minutes, duration_pulls').order('price')),
    rows<ShopTitle>(supabase!.from('titles').select('id, name, description, price').not('price', 'is', null).order('price')),
    rows<{ item_id: string; quantity: number }>(supabase!.from('user_items').select('item_id, quantity')),
    rows<{ title_id: string }>(supabase!.from('user_titles').select('title_id').eq('user_id', uid)),
  ]);
  return {
    items: items.map((i) => ({ ...i, owned: mine.find((m) => m.item_id === i.id)?.quantity ?? 0 })),
    titles: titles.map((t) => ({ ...t, owned: myTitles.some((m) => m.title_id === t.id) })),
  };
};
export const fetchMySuggestions = () =>
  rows<{ id: string; text: string; status: 'pending' | 'approved' | 'rejected'; admin_note: string | null }>(
    supabase!.from('suggestions').select('id, text, status, admin_note').order('created_at', { ascending: false }),
  );
export const fetchAllowedEmails = () =>
  rows<{ email: string; created_at: string }>(supabase!.from('allowed_emails').select('email, created_at').order('created_at'));
export async function fetchRole() {
  const { data } = await supabase!.from('profiles').select('role').maybeSingle();
  return (data?.role as 'player' | 'admin' | undefined) ?? 'player';
}

/** Removes a stored image (admin: a deleted card's art). Failing here only leaves an unused file. */
export async function removeImage(bucket: 'cards' | 'profile' | 'suggestions', path: string) {
  await supabase!.storage.from(bucket).remove([path]);
}
