// Recent songs, shared by the Presentation Builder and the Program page.
// "Recent" means the songs added with Add to Presentation on the Lyric page, newest first, minus the ones hidden in the Builder.
// The list is kept in this browser and, when signed in, in the added_songs table, so it is the same on every device.
import { useEffect, useState } from "react";
import { selectAll, supabase, withTimeout } from "./supabase";

export const ADDED_SONGS_KEY = "addedSongsLog";
export const HIDDEN_SONGS_KEY = "builderHiddenRecentSongs";
export const RECENT_LIMIT = 8;

type Added = { id: string; at: number };
const ADDED_LIMIT = 30;
function readAddedLog(): Added[] {
  try { return (JSON.parse(localStorage.getItem(ADDED_SONGS_KEY) || "[]") as Added[]).filter((x) => x && typeof x.id === "string"); } catch { return []; }
}
function writeAddedLog(log: Added[]) {
  try { localStorage.setItem(ADDED_SONGS_KEY, JSON.stringify(log)); } catch { /* storage blocked */ }
}
export function readAddedIds(): string[] {
  return readAddedLog().map((x) => x.id);
}
// Two logs as one, newest first, each song once
export function mergeAdded(a: Added[], b: Added[]): Added[] {
  const best = new Map<string, number>();
  for (const x of [...a, ...b]) best.set(x.id, Math.max(best.get(x.id) ?? 0, x.at || 0));
  return [...best].map(([id, at]) => ({ id, at })).sort((x, y) => y.at - x.at).slice(0, ADDED_LIMIT);
}

// The signed-in user's id, or null. Gives up after 5 s so a stalled sign-in check never blocks the lists.
async function signedInId(): Promise<string | null> {
  if (!supabase) return null;
  const sb = supabase;
  const r = await withTimeout(sb.auth.getSession().then((x) => x.data.session?.user.id ?? null), 5000, null);
  return r;
}

// The added songs from this browser and from the account (other devices), newest first.
// Without the added_songs table (migration not run) or signed out, it is this browser's list.
export async function loadAddedIds(): Promise<string[]> {
  const local = readAddedLog();
  const uid = await signedInId();
  if (!supabase || !uid) return local.map((x) => x.id);
  const sb = supabase;
  const { data, error } = await withTimeout(
    sb.from("added_songs").select("song_id, added_at").eq("owner_id", uid).order("added_at", { ascending: false }).limit(ADDED_LIMIT),
    8000, { data: null, error: { message: "timeout" } } as never,
  );
  if (error || !data) return local.map((x) => x.id);
  const remote = (data as { song_id: string; added_at: string }[]).map((r) => ({ id: r.song_id, at: Date.parse(r.added_at) || 0 }));
  const merged = mergeAdded(local, remote);
  writeAddedLog(merged);
  return merged.map((x) => x.id);
}

// Add to Presentation on the Lyric page: remember the song here and, when signed in, on the account
export async function recordAddedSong(id: string): Promise<void> {
  const now = Date.now();
  writeAddedLog(mergeAdded([{ id, at: now }], readAddedLog()));
  // Adding a song again brings it back into Recent songs, even if it was removed there
  try { localStorage.setItem(HIDDEN_SONGS_KEY, JSON.stringify(readHiddenIds().filter((x) => x !== id))); } catch { /* storage blocked */ }
  const uid = await signedInId();
  if (!supabase || !uid) return;
  // Fails quietly until supabase/added-songs.sql is run: the browser's list still works
  await supabase.from("added_songs").upsert({ owner_id: uid, song_id: id, added_at: new Date(now).toISOString() }, { onConflict: "owner_id,song_id" });
}

// The added song ids, kept up to date: read again when the page comes back on screen
// and when another tab adds a song, so Recent songs never needs a reload.
export function useAddedSongIds(): string[] {
  const [ids, setIds] = useState<string[]>(() => readAddedIds());
  useEffect(() => {
    let live = true;
    const same = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);
    const refresh = () => { void loadAddedIds().then((next) => { if (live) setIds((cur) => (same(cur, next) ? cur : next)); }); };
    const onVisible = () => { if (document.visibilityState === "visible") refresh(); };
    const onStorage = (e: StorageEvent) => { if (e.key === ADDED_SONGS_KEY || e.key === HIDDEN_SONGS_KEY) setIds(readAddedIds()); };
    refresh();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("storage", onStorage);
    return () => { live = false; document.removeEventListener("visibilitychange", onVisible); window.removeEventListener("storage", onStorage); };
  }, []);
  return ids;
}
export function readHiddenIds(): string[] {
  try { return JSON.parse(localStorage.getItem(HIDDEN_SONGS_KEY) || "[]"); } catch { return []; }
}

// The recent songs: the added ids in order, found in the library, not hidden, at most `limit`
export function pickRecent<T extends { id: string }>(library: T[], addedIds: string[], hidden: string[], limit = RECENT_LIMIT): T[] {
  return addedIds.map((id) => library.find((x) => x.id === id)).filter((x): x is T => !!x && !hidden.includes(x.id)).slice(0, limit);
}

export const songLabel = (number: string | null | undefined, title: string | null | undefined) => `${number ? `${number}. ` : ""}${title || ""}`;

// A song to choose in the Program: its id links the choice to the song, value is "number. title"
export interface SongOption { id: string; value: string; date: string; recent: boolean }

// A saved song, as the Program lists it
export interface SongRow { id: string; number: string; title: string; date: string }

// Every saved song, newest first
export async function loadSongRows(): Promise<SongRow[]> {
  if (supabase) {
    const sb = supabase;
    const { data } = await selectAll((from, to) => sb.from("lyric_songs").select("id, song_number, title, updated_at").order("updated_at", { ascending: false }).order("id").range(from, to));
    return (data ?? []).map((r) => ({ id: r.id, number: r.song_number ?? "", title: r.title ?? "", date: r.updated_at ?? "" }));
  }
  try {
    const ls = JSON.parse(localStorage.getItem("lyricsSongs") || "[]") as { id: string; number?: string; title?: string }[];
    return ls.map((x) => ({ id: x.id, number: x.number ?? "", title: x.title ?? "", date: "" }));
  } catch { return []; }
}

// Songs by id: for a song added on another device or after the page loaded, which the loaded list does not have yet
export async function loadSongRowsByIds(ids: string[]): Promise<SongRow[]> {
  if (!supabase || !ids.length) return [];
  const { data } = await supabase.from("lyric_songs").select("id, song_number, title, updated_at").in("id", ids);
  return (data ?? []).map((r) => ({ id: r.id, number: r.song_number ?? "", title: r.title ?? "", date: r.updated_at ?? "" }));
}

// The Program's song choices: the recent songs first (the Builder's list), then every saved song, newest first
export function buildSongOptions(rows: SongRow[], addedIds: string[], hidden: string[] = readHiddenIds()): SongOption[] {
  const recentRows = pickRecent(rows, addedIds, hidden);
  const recentIds = new Set(recentRows.map((x) => x.id));
  const toOption = (r: SongRow): SongOption => ({ id: r.id, value: songLabel(r.number, r.title), date: r.date, recent: recentIds.has(r.id) });
  return [...recentRows.map(toOption), ...rows.filter((r) => !recentIds.has(r.id)).map(toOption)].filter((o) => o.value);
}

export async function loadSongOptions(): Promise<SongOption[]> {
  const [rows, ids] = await Promise.all([loadSongRows(), loadAddedIds()]);
  return buildSongOptions(rows, ids);
}

// The Program's song choices, kept up to date as songs are added on the Lyric page (in another tab or on another device)
export function useSongOptions(): SongOption[] {
  const addedIds = useAddedSongIds();
  const [rows, setRows] = useState<SongRow[] | null>(null);
  useEffect(() => { void loadSongRows().then(setRows); }, []);
  // A recent song the list does not hold yet (saved after the page loaded, or on another device): fetch just that song
  const missing = rows ? addedIds.slice(0, RECENT_LIMIT * 2).filter((id) => !rows.some((r) => r.id === id)) : [];
  const missingKey = missing.join(",");
  useEffect(() => {
    if (!missingKey) return;
    void loadSongRowsByIds(missingKey.split(",")).then((found) => {
      if (found.length) setRows((cur) => [...found.filter((f) => !(cur ?? []).some((r) => r.id === f.id)), ...(cur ?? [])]);
    });
  }, [missingKey]);
  const [options, setOptions] = useState<SongOption[]>([]);
  useEffect(() => { if (rows) setOptions(buildSongOptions(rows, addedIds)); }, [rows, addedIds]);
  return options;
}

// ---------- Recent readings and scriptures (the Builder's other two Recent lists) ----------
export const RECENT_READINGS_KEY = "addedReadingsLog";       // readings added from the Readings page, newest first (snapshots)
export const HIDDEN_SCRIPTURES_KEY = "builderHiddenRecentScriptures";

export function readRecentReadings(): { id: string; title: string }[] {
  try {
    return (JSON.parse(localStorage.getItem(RECENT_READINGS_KEY) || "[]") as { id?: string; title?: string }[])
      .filter((x): x is { id: string; title: string } => !!x.id && !!x.title);
  } catch { return []; }
}
export function readHiddenScriptureIds(): string[] {
  try { return JSON.parse(localStorage.getItem(HIDDEN_SCRIPTURES_KEY) || "[]"); } catch { return []; }
}
// The Builder shows the 8 newest saved studies, minus the ones hidden there
export function recentStudyIds(studiesNewestFirst: { id: string }[], hidden: string[] = readHiddenScriptureIds()): Set<string> {
  return new Set(studiesNewestFirst.slice(0, RECENT_LIMIT).filter((x) => !hidden.includes(x.id)).map((x) => x.id));
}

// A reading to choose in the Program. Recent readings carry an id (their saved copy); other saved readings are plain text.
export interface ReadingOption { id?: string; value: string; date: string; recent?: boolean }
export async function loadReadingOptions(): Promise<ReadingOption[]> {
  const recent: ReadingOption[] = readRecentReadings().map((r) => ({ id: r.id, value: r.title, date: "", recent: true }));
  const norm = (t: string) => t.trim().toLowerCase();
  let all: ReadingOption[] = [];
  if (supabase) {
    const { data } = await supabase.from("readings").select("number, title, updated_at").order("updated_at", { ascending: false });
    all = (data ?? []).map((x) => ({ value: (x.number ? `${x.number}. ` : "") + (x.title || ""), date: x.updated_at ?? "" })).filter((o) => o.value);
  }
  // A reading that is already in the Recent group is not listed twice
  const inRecent = (v: string) => recent.some((r) => norm(v) === norm(r.value) || norm(v).endsWith(`. ${norm(r.value)}`));
  return [...recent, ...all.filter((o) => !inRecent(o.value))];
}

// ---------- Matching a song typed by hand ----------
const norm = (t: string) => t.normalize("NFC").toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
// "12. Brah Yê-su", "12 Brah Yê-su" or "12" → number "12" and title "Brah Yê-su"
export function splitLabel(label: string): { number: string; title: string } {
  const m = label.trim().match(/^(\d+[a-z]?)\s*[.)\-:]?\s*(.*)$/i);
  return m ? { number: m[1].toLowerCase(), title: m[2].trim() } : { number: "", title: label.trim() };
}

// Find the saved song a typed line means. Tries the exact "number. title", then the number (with the title when typed),
// then the title alone, then a title that is part of exactly one song. The first match wins, so list the Recent songs first.
export function matchSong(label: string, options: { id: string; value: string }[]): string | undefined {
  const q = norm(label);
  if (!q) return undefined;
  const exact = options.find((o) => norm(o.value) === q);
  if (exact) return exact.id;
  const typed = splitLabel(label);
  const parsed = options.map((o) => ({ o, ...splitLabel(o.value) }));
  const tq = norm(typed.title);
  if (typed.number) {
    const same = parsed.filter((p) => p.number === typed.number);
    if (same.length === 1) return same[0].o.id;
    const byTitle = tq ? same.find((p) => norm(p.title) === tq || norm(p.title).includes(tq) || tq.includes(norm(p.title))) : undefined;
    if (byTitle) return byTitle.o.id;
    if (same.length && !tq) return same[0].o.id;
  }
  if (tq) {
    const byTitle = parsed.find((p) => norm(p.title) === tq);
    if (byTitle) return byTitle.o.id;
    if (tq.length >= 4) {
      const part = parsed.filter((p) => norm(p.title).includes(tq));
      if (part.length === 1) return part[0].o.id;
    }
  }
  return undefined;
}

// For a song the list above did not hold (the list is cut at 1000 songs), ask the database for songs with that number or title
export async function findSongOptions(label: string): Promise<{ id: string; value: string }[]> {
  if (!supabase) return [];
  const { number, title } = splitLabel(label);
  const found = new Map<string, { id: string; value: string }>();
  const add = (rows: { id: string; song_number: string | null; title: string | null }[] | null) => {
    for (const r of rows ?? []) found.set(r.id, { id: r.id, value: songLabel(r.song_number, r.title) });
  };
  if (number) add((await supabase.from("lyric_songs").select("id, song_number, title").eq("song_number", number).limit(10)).data);
  const clean = title.replace(/[%_,()*]/g, " ").trim();
  if (clean.length >= 3) add((await supabase.from("lyric_songs").select("id, song_number, title").ilike("title", `%${clean}%`).limit(10)).data);
  return [...found.values()];
}
