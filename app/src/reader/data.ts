import { selectAll, supabase } from "../lib/supabase";
import { cacheReaderSongs, loadReaderSongs, type ReaderSong } from "../lib/offlineCache";

// Songs for the reader. Everyone can read the song library without signing in.
// Every song is saved on the device after each online load, so the whole hymn book opens offline.

export type Source = "online" | "saved" | "none";
export interface LoadResult { songs: ReaderSong[]; source: Source; savedAt: string | null; error?: string }

const SAVED_AT_KEY = "readerSavedAt";
const savedAt = (): string | null => { try { return localStorage.getItem(SAVED_AT_KEY); } catch { return null; } };

// The copy saved on this device (shown at once while the latest copy loads)
export async function loadSavedSongs(): Promise<LoadResult> {
  const songs = await loadReaderSongs();
  return { songs, source: songs.length ? "saved" : "none", savedAt: savedAt() };
}

// The latest songs from the library; falls back to the saved copy when offline
export async function loadSongs(): Promise<LoadResult> {
  if (!supabase) {
    // No Supabase settings: the team app keeps songs in this browser instead
    try {
      const ls = JSON.parse(localStorage.getItem("lyricsSongs") || "[]") as { id: string; number?: string; title?: string; lyrics?: string; category?: string; language?: string }[];
      const songs = ls.map((x) => ({ id: String(x.id), number: x.number ?? "", title: x.title ?? "", lyrics: x.lyrics ?? "", category: x.category ?? "", language: x.language ?? "", updated: "" }));
      return { songs, source: songs.length ? "saved" : "none", savedAt: null };
    } catch {
      return { songs: [], source: "none", savedAt: null };
    }
  }
  try {
    // Score images and music facts come from hymn-score-images.sql; until it is run, load without them
    const FULL = "id, title, song_number, lyrics, category, language, updated_at, score_path, score_images, music";
    const BASIC = "id, title, song_number, lyrics, category, language, updated_at, score_path";
    const sb = supabase;
    // The library has more than 1000 songs, the most Supabase returns at once: read it in pages
    let res = await selectAll((from, to) => sb.from("lyric_songs").select(FULL).order("id").range(from, to));
    if (res.error && /score_images|music/.test(res.error.message)) res = await selectAll((from, to) => sb.from("lyric_songs").select(BASIC).order("id").range(from, to)) as typeof res;
    const { data, error } = res;
    if (error) throw new Error(error.message);
    const songs: ReaderSong[] = (data ?? []).map((r) => {
      const m = (r.music ?? {}) as { key?: string; meter?: string; chords?: string[] };
      return {
        id: String(r.id), number: r.song_number ?? "", title: r.title ?? "", lyrics: r.lyrics ?? "",
        category: r.category ?? "", language: r.language ?? "", updated: r.updated_at ?? "",
        scorePath: r.score_path ?? "",
        scoreImages: Array.isArray(r.score_images) ? r.score_images : [],
        music: { key: m.key ?? "", meter: m.meter ?? "", chords: Array.isArray(m.chords) ? m.chords : [] },
      };
    });
    const now = new Date().toISOString();
    if (await cacheReaderSongs(songs)) { try { localStorage.setItem(SAVED_AT_KEY, now); } catch { /* ignore */ } }
    return { songs, source: "online", savedAt: now };
  } catch (e) {
    const saved = await loadSavedSongs();
    return { ...saved, error: e instanceof Error ? e.message : String(e) };
  }
}

// Public link to a file in the hymn-scores bucket (score PDF or scan image); "" when there is none
export function scoreUrl(path: string): string {
  if (!supabase || !path) return "";
  return supabase.storage.from("hymn-scores").getPublicUrl(path).data.publicUrl;
}

// Song number order (1, 2, 10…), then songs without a number by title
export function bySongNumber(a: ReaderSong, b: ReaderSong): number {
  const na = parseInt(a.number, 10), nb = parseInt(b.number, 10);
  const ha = !Number.isNaN(na), hb = !Number.isNaN(nb);
  if (ha && hb && na !== nb) return na - nb;
  if (ha !== hb) return ha ? -1 : 1;
  return a.title.localeCompare(b.title);
}
