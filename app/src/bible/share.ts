// The reader's church, and the verses shared with it (supabase/bible-shared-verses.sql). The church choice is the one
// the Nau Mpro App keeps on this browser (lib/publishedService), so choosing in either place sets both.
import { useCallback, useEffect, useState } from "react";
import { loadChurchList, readerChurch, setReaderChurch, type ReaderChurch } from "../lib/publishedService";
import { supabase, withTimeout } from "../lib/supabase";

// The chosen church. With nothing chosen: the one church the signed-in person belongs to, or the only church there is.
export function resolveChurch(choice: ReaderChurch | "none" | null, list: ReaderChurch[] | null, mine: ReaderChurch[] = []): ReaderChurch | null {
  if (choice === "none") return null;
  return choice ?? (mine.length === 1 ? mine[0] : list?.length === 1 ? list[0] : null);
}

// uid: the signed-in account, if any
export function useReaderChurch(uid: string | null) {
  const [choice, setChoice] = useState(() => readerChurch());
  const [list, setList] = useState<ReaderChurch[] | null>(null);
  useEffect(() => {
    let live = true;
    const load = () => { void loadChurchList().then((l) => { if (live && l) setList(l); }).catch(() => {}); };
    // The choice may have changed in the Nau Mpro App (another tab, or before coming back here)
    const again = () => setChoice((old) => { const next = readerChurch(); return JSON.stringify(next) === JSON.stringify(old) ? old : next; });
    const shown = () => { if (document.visibilityState === "visible") { again(); load(); } };
    const stored = (e: StorageEvent) => { if (e.key === "readerChurch") again(); };
    load();
    window.addEventListener("online", load);
    window.addEventListener("storage", stored);
    window.addEventListener("pageshow", again);
    document.addEventListener("visibilitychange", shown);
    return () => { live = false; window.removeEventListener("online", load); window.removeEventListener("storage", stored); window.removeEventListener("pageshow", again); document.removeEventListener("visibilitychange", shown); };
  }, []);
  const [mine, setMine] = useState<{ uid: string; list: ReaderChurch[] } | null>(null);
  const unchosen = choice === null;
  useEffect(() => {
    if (!uid || !unchosen) return;
    let live = true;
    void loadMyChurches().then((r) => { if (live && "churches" in r) setMine({ uid, list: r.churches }); });
    return () => { live = false; };
  }, [uid, unchosen]);
  const choose = (c: ReaderChurch | null) => { setReaderChurch(c ?? "none"); setChoice(c ?? "none"); };
  return { church: resolveChurch(choice, list, mine && mine.uid === uid ? mine.list : []), list, choose };
}
export type ChurchChoice = ReturnType<typeof useReaderChurch>;

// ---------- Shared verses ----------
export const NOTE_MAX = 280;
export interface Shared { id: string; sharer_name: string; book_code: string; chapter: number; verse_from: number; verse_to: number; note: string; created_at: string; can_remove: boolean; mine?: boolean }
export type MyShare = Omit<Shared, "can_remove" | "mine"> & { church_id: string };

// The churches the signed-in person belongs to (accepted ones): only these can be shared to
export async function loadMyChurches(): Promise<{ churches: ReaderChurch[] } | { error: string }> {
  if (!supabase) return { error: "Sharing needs the app’s database settings." };
  const res = await withTimeout(supabase.rpc("my_churches"), 15000, late);
  if (res.error) return { error: shareError(res.error.message) };
  return { churches: ((res.data ?? []) as { id: string; name: string; status: string }[]).filter((c) => c.status === "active").map(({ id, name }) => ({ id, name })) };
}
// Who sees a share unless the person picks otherwise: the reader's church, if they belong to it
export const shareAudience = (reader: ReaderChurch | null, mine: ReaderChurch[]): ReaderChurch | null => mine.find((c) => c.id === reader?.id) ?? null;

export function shareError(message: string): string {
  if (/row-level security/i.test(message)) return "Only people who belong to this church can share to it.";
  if (/bible_shared_verses|church_shared_verses/.test(message) && /exist|schema cache|could not find/i.test(message)) return "Sharing isn’t switched on yet. Ask the person who looks after the app.";
  if (/share_limit/.test(message)) return "You’ve shared 20 verses in the last day. Try again tomorrow.";
  if (/fetch|network|timeout/i.test(message)) return "That didn’t go through. Check the connection and try again.";
  return "That didn’t work. Try again.";
}
const late = { data: null, error: { message: "timeout" } } as never;

export async function loadShared(churchId: string): Promise<{ rows: Shared[] } | { error: string }> {
  if (!supabase) return { error: "Sharing needs the app’s database settings." };
  const res = await withTimeout(supabase.rpc("church_shared_verses", { cid: churchId }), 15000, late);
  return res.error ? { error: shareError(res.error.message) } : { rows: (res.data ?? []) as Shared[] };
}

// Everything this account has shared, to any church (the table lets people read their own rows)
async function loadMine(uid: string): Promise<{ rows: MyShare[] } | { error: string }> {
  if (!supabase) return { error: "Sharing needs the app’s database settings." };
  const res = await withTimeout(supabase.from("bible_shared_verses")
    .select("id, church_id, sharer_name, book_code, chapter, verse_from, verse_to, note, created_at")
    .eq("user_id", uid).order("created_at", { ascending: false }).limit(100), 15000, late);
  return res.error ? { error: shareError(res.error.message) } : { rows: (res.data ?? []) as MyShare[] };
}

// ---------- New since the last look ----------
type Dated = { created_at: string; mine?: boolean };
export const latestAt = (rows: Dated[]): string | null => rows.reduce<string | null>((a, r) => (!a || Date.parse(r.created_at) > Date.parse(a) ? r.created_at : a), null);
// Someone else's share that arrived after the newest one seen (seen: null before the first look)
export const hasUnseen = (rows: Dated[], seen: string | null) => rows.some((r) => !r.mine && (!seen || Date.parse(r.created_at) > Date.parse(seen)));
const SEEN_KEY = "bible.sharedSeen";   // { churchId: time of the newest share seen }, on this device
const readSeen = (): Record<string, string> => { try { return JSON.parse(localStorage.getItem(SEEN_KEY) || "{}") ?? {}; } catch { return {}; } };

type List<T> = { key: string; rows: T[] | null; error: string | null };
// The church's shares and your own. Loaded when the reader opens, comes back into view or goes online, and on reload().
// Nothing is pushed: this only drives the list and the quiet "new" dot.
export function useShared(churchId: string | null, uid: string | null) {
  const [church, setChurch] = useState<List<Shared> | null>(null);
  const [own, setOwn] = useState<List<MyShare> | null>(null);
  const [seen, setSeen] = useState(readSeen);
  const [again, setAgain] = useState(0);
  const churchKey = `${churchId}|${uid}`;
  useEffect(() => {
    let live = true;
    // A failed reload keeps the list already shown
    const keep = <T,>(key: string, r: { rows: T[] } | { error: string }) => (old: List<T> | null): List<T> =>
      "rows" in r ? { key, rows: r.rows, error: null } : { key, rows: old?.key === key ? old.rows : null, error: r.error };
    const load = () => {
      if (churchId) void loadShared(churchId).then((r) => { if (live) setChurch(keep(churchKey, r)); });
      if (uid) void loadMine(uid).then((r) => { if (live) setOwn(keep(uid, r)); });
    };
    const shown = () => { if (document.visibilityState === "visible") load(); };
    load();
    window.addEventListener("online", load);
    document.addEventListener("visibilitychange", shown);
    return () => { live = false; window.removeEventListener("online", load); document.removeEventListener("visibilitychange", shown); };
  }, [churchId, uid, churchKey, again]);

  const mine = uid && own?.key === uid ? own : null;
  const current = churchId && church?.key === churchKey ? church : null;
  const ids = new Set(mine?.rows?.map((r) => r.id));
  const rows = current?.rows?.map((r) => ({ ...r, mine: ids.has(r.id) })) ?? null;
  const reload = useCallback(() => setAgain((n) => n + 1), []);
  const newest = rows ? latestAt(rows) : null;
  const markSeen = useCallback(() => {
    if (!churchId || !newest) return;
    setSeen((old) => {
      if (old[churchId] === newest) return old;
      const next = { ...old, [churchId]: newest };
      try { localStorage.setItem(SEEN_KEY, JSON.stringify(next)); } catch { /* storage blocked */ }
      return next;
    });
  }, [churchId, newest]);
  return {
    rows, error: current?.error ?? null,
    mine: mine?.rows ?? null, mineError: mine?.error ?? null,
    // Not until your own shares are known (signed in), so they never count as new
    unseen: !!churchId && !!rows && (!uid || !!mine) && hasUnseen(rows, seen[churchId] ?? null),
    reload, markSeen,
    drop: (id: string) => { setChurch((c) => c && { ...c, rows: c.rows?.filter((r) => r.id !== id) ?? null }); setOwn((o) => o && { ...o, rows: o.rows?.filter((r) => r.id !== id) ?? null }); },
  };
}
export type SharedData = ReturnType<typeof useShared>;

export interface NewShare { church_id: string; sharer_name: string; book_code: string; chapter: number; verse_from: number; verse_to: number; note: string }
// null when it worked. The database sets the account and the time.
export async function postShare(share: NewShare): Promise<string | null> {
  if (!supabase) return "Sharing needs the app’s database settings.";
  const res = await withTimeout(supabase.from("bible_shared_verses").insert(share), 15000, late);
  return res.error ? shareError(res.error.message) : null;
}

export async function removeShare(id: string): Promise<string | null> {
  if (!supabase) return "Sharing needs the app’s database settings.";
  const res = await withTimeout(supabase.from("bible_shared_verses").delete().eq("id", id).select("id"), 15000, late);
  if (res.error) return shareError(res.error.message);
  return res.data?.length ? null : "It couldn’t be removed. You may need to sign in again.";
}

// The name shown on a person's shares: the one they typed last on this device, for the same account
const NAME_KEY = "bible.shareName";
export function rememberedName(uid: string): string {
  try { const n = JSON.parse(localStorage.getItem(NAME_KEY) || "null"); return n?.uid === uid ? String(n.name) : ""; } catch { return ""; }
}
export function rememberName(uid: string, name: string) { try { localStorage.setItem(NAME_KEY, JSON.stringify({ uid, name })); } catch { /* storage blocked */ } }
