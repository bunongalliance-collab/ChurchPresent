import { supabase } from "../lib/supabase";
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
    const { data, error } = await supabase.from("lyric_songs").select("id, title, song_number, lyrics, category, language, updated_at");
    if (error) throw new Error(error.message);
    const songs: ReaderSong[] = (data ?? []).map((r) => ({
      id: String(r.id), number: r.song_number ?? "", title: r.title ?? "", lyrics: r.lyrics ?? "",
      category: r.category ?? "", language: r.language ?? "", updated: r.updated_at ?? "",
    }));
    const now = new Date().toISOString();
    if (await cacheReaderSongs(songs)) { try { localStorage.setItem(SAVED_AT_KEY, now); } catch { /* ignore */ } }
    return { songs, source: "online", savedAt: now };
  } catch (e) {
    const saved = await loadSavedSongs();
    return { ...saved, error: e instanceof Error ? e.message : String(e) };
  }
}

// Song number order (1, 2, 10…), then songs without a number by title
export function bySongNumber(a: ReaderSong, b: ReaderSong): number {
  const na = parseInt(a.number, 10), nb = parseInt(b.number, 10);
  const ha = !Number.isNaN(na), hb = !Number.isNaN(nb);
  if (ha && hb && na !== nb) return na - nb;
  if (ha !== hb) return ha ? -1 : 1;
  return a.title.localeCompare(b.title);
}
