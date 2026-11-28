import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Set these in app/.env.local (not committed): VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.
// Without them the app runs in browser-only mode, the same as lyrics.html without supabase-config.js.
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabase: SupabaseClient | null = url && anonKey ? createClient(url, anonKey) : null;

// A second client that never signs in, for calls anyone may make (the Nau Mpro App's prayer requests). It doesn't wait
// for the signed-in session to load or refresh, which on phones can hold up every call for several seconds.
export const publicDb: SupabaseClient | null = url && anonKey
  ? createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: "sb-public" } })
  : null;

// Sign-in changes, run just after Supabase's own handler. Supabase holds a lock while it calls these handlers
// (for example while refreshing an expired token, which is common on phones after the browser pauses a tab);
// a database call made inside the handler waits for that lock and never finishes. Deferring avoids that.
export function onAuthChange(cb: (session: import("@supabase/supabase-js").Session | null, event: string) => void): () => void {
  if (!supabase) return () => {};
  const { data } = supabase.auth.onAuthStateChange((event, session) => { window.setTimeout(() => cb(session, event), 0); });
  return () => data.subscription.unsubscribe();
}

// A request that gives up after ms, so a page never waits forever on a stalled connection
export function withTimeout<T>(p: PromiseLike<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const t = window.setTimeout(() => resolve(fallback), ms);
    Promise.resolve(p).then((v) => { window.clearTimeout(t); resolve(v); }, () => { window.clearTimeout(t); resolve(fallback); });
  });
}

// Every row of a list. Supabase returns at most 1000 rows per request, and the song library is larger,
// so read it in pages of 1000. The query must have a stable order (it is ordered here by id after the given order).
type Page<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;
export async function selectAll<T>(page: (from: number, to: number) => Page<T>): Promise<{ data: T[] | null; error: { message: string } | null }> {
  const SIZE = 1000;
  const out: T[] = [];
  for (let from = 0; from < 100000; from += SIZE) {
    const { data, error } = await page(from, from + SIZE - 1);
    if (error) return { data: null, error };
    out.push(...(data ?? []));
    if (!data || data.length < SIZE) break;
  }
  return { data: out, error: null };
}
