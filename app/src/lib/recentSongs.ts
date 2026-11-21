// Recent songs, shared by the Presentation Builder and the Program page.
// "Recent" means the songs added with Add to Presentation on the Lyric page, newest first, minus the ones hidden in the Builder.
import { selectAll, supabase } from "./supabase";

export const ADDED_SONGS_KEY = "addedSongsLog";
export const HIDDEN_SONGS_KEY = "builderHiddenRecentSongs";
export const RECENT_LIMIT = 8;

export function readAddedIds(): string[] {
  try { return (JSON.parse(localStorage.getItem(ADDED_SONGS_KEY) || "[]") as { id: string }[]).map((x) => x.id); } catch { return []; }
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

// The Program's song choices: the recent songs first (the Builder's list), then every saved song, newest first
export async function loadSongOptions(): Promise<SongOption[]> {
  let rows: { id: string; number: string; title: string; date: string }[] = [];
  if (supabase) {
    const sb = supabase;
    const { data } = await selectAll((from, to) => sb.from("lyric_songs").select("id, song_number, title, updated_at").order("updated_at", { ascending: false }).order("id").range(from, to));
    rows = (data ?? []).map((r) => ({ id: r.id, number: r.song_number ?? "", title: r.title ?? "", date: r.updated_at ?? "" }));
  } else {
    try {
      const ls = JSON.parse(localStorage.getItem("lyricsSongs") || "[]") as { id: string; number?: string; title?: string }[];
      rows = ls.map((x) => ({ id: x.id, number: x.number ?? "", title: x.title ?? "", date: "" }));
    } catch { rows = []; }
  }
  const recentIds = new Set(pickRecent(rows, readAddedIds(), readHiddenIds()).map((x) => x.id));
  const toOption = (r: (typeof rows)[number]): SongOption => ({ id: r.id, value: songLabel(r.number, r.title), date: r.date, recent: recentIds.has(r.id) });
  const recent = pickRecent(rows, readAddedIds(), readHiddenIds()).map(toOption);
  return [...recent, ...rows.filter((r) => !recentIds.has(r.id)).map(toOption)].filter((o) => o.value);
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
