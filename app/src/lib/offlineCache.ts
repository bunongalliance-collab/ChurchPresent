import Dexie, { type Table } from "dexie";

// A copy of the song list and of the lyrics the user has opened, kept in this browser (IndexedDB).
// The app uses it when Supabase cannot be reached, so the songs stay available during a service
// if the internet drops. It is a read-only copy: writes still go straight to Supabase.

export interface CachedSong {
  id: string;
  title: string;
  number: string;
  owner?: string;
  category?: string;
  language?: string;
  look?: unknown;
  savedAt: number;
}

export interface CachedLyrics {
  id: string;
  lyrics: string;
  savedAt: number;
}

export interface CachedReading {
  id: string;
  number: string;
  title: string;
  subtitle: string;
  categoryId: string;
  content: string;
  look?: unknown;
  owner?: string;
  savedAt: number;
}

export interface CachedReadingCategory {
  id: string;
  name: string;
  sort: number;
  savedAt: number;
}

class ChurchCache extends Dexie {
  songs!: Table<CachedSong, string>;
  lyrics!: Table<CachedLyrics, string>;
  readings!: Table<CachedReading, string>;
  readingCategories!: Table<CachedReadingCategory, string>;
  outbox!: Table<OutboxItem, number>;
  readerSongs!: Table<ReaderSong, string>;

  constructor() {
    super("churchAppCache");
    this.version(1).stores({ songs: "id", lyrics: "id" });
    this.version(2).stores({ songs: "id", lyrics: "id", readings: "id", readingCategories: "id, sort" });
    this.version(3).stores({ songs: "id", lyrics: "id", readings: "id", readingCategories: "id, sort", outbox: "++seq" });
    this.version(4).stores({ songs: "id", lyrics: "id", readings: "id", readingCategories: "id, sort", outbox: "++seq", readerSongs: "id" });
  }
}

// The Nau Mpro reader keeps every song with its lyrics, so the whole hymn book opens offline
export interface ReaderSong {
  id: string;
  number: string;
  title: string;
  lyrics: string;
  category: string;
  language: string;
  updated: string;
}

// Replace the saved hymn book with the latest copy (songs deleted on the server go too)
export async function cacheReaderSongs(rows: ReaderSong[]): Promise<boolean> {
  const d = getDb();
  if (!d) return false;
  try {
    await d.transaction("rw", d.readerSongs, async () => {
      await d.readerSongs.clear();
      await d.readerSongs.bulkPut(rows);
    });
    return true;
  } catch {
    return false;   // storage full or blocked: the reader still works while online
  }
}

export async function loadReaderSongs(): Promise<ReaderSong[]> {
  const d = getDb();
  if (!d) return [];
  try {
    return await d.readerSongs.toArray();
  } catch {
    return [];
  }
}

// A save waiting to reach Supabase. Written in order (seq) and sent when the device is online.
export interface OutboxItem {
  seq?: number;
  table: string;
  op: "insert" | "update" | "delete";
  id: string;
  data?: Record<string, unknown>;
  queuedAt: number;
  error?: string;   // set when the server refused it; kept so nothing is lost silently
}

// Created lazily, so a browser without IndexedDB only fails inside the try/catch below
let db: ChurchCache | null = null;
function getDb(): ChurchCache | null {
  try {
    if (!db && typeof indexedDB !== "undefined") db = new ChurchCache();
    return db;
  } catch {
    return null;
  }
}

export function getOutbox(): Table<OutboxItem, number> | null {
  return getDb()?.outbox ?? null;
}

// Replace the saved song list with the latest one from the server (removes songs deleted there)
export async function cacheSongList(rows: Omit<CachedSong, "savedAt">[]): Promise<void> {
  const d = getDb();
  if (!d) return;
  try {
    const savedAt = Date.now();
    await d.transaction("rw", d.songs, async () => {
      await d.songs.clear();
      await d.songs.bulkPut(rows.map((r) => ({ ...r, savedAt })));
    });
  } catch {
    // Storage full or blocked: the app still works, just without the offline copy
  }
}

export async function loadCachedSongs(): Promise<CachedSong[]> {
  const d = getDb();
  if (!d) return [];
  try {
    return await d.songs.orderBy("savedAt").reverse().toArray();
  } catch {
    return [];
  }
}

// Readings and reading categories: the same idea as the song list
export async function cacheReadings(rows: Omit<CachedReading, "savedAt">[]): Promise<void> {
  const d = getDb();
  if (!d) return;
  try {
    const savedAt = Date.now();
    await d.transaction("rw", d.readings, async () => {
      await d.readings.clear();
      await d.readings.bulkPut(rows.map((r) => ({ ...r, savedAt })));
    });
  } catch {
    // see cacheSongList
  }
}

export async function loadCachedReadings(): Promise<CachedReading[]> {
  const d = getDb();
  if (!d) return [];
  try {
    return await d.readings.toArray();
  } catch {
    return [];
  }
}

export async function cacheReadingCategories(rows: Omit<CachedReadingCategory, "savedAt">[]): Promise<void> {
  const d = getDb();
  if (!d) return;
  try {
    const savedAt = Date.now();
    await d.transaction("rw", d.readingCategories, async () => {
      await d.readingCategories.clear();
      await d.readingCategories.bulkPut(rows.map((r) => ({ ...r, savedAt })));
    });
  } catch {
    // see cacheSongList
  }
}

export async function loadCachedReadingCategories(): Promise<CachedReadingCategory[]> {
  const d = getDb();
  if (!d) return [];
  try {
    return (await d.readingCategories.orderBy("sort").toArray());
  } catch {
    return [];
  }
}

export async function cacheLyrics(id: string, lyrics: string): Promise<void> {
  const d = getDb();
  if (!d) return;
  try {
    await d.lyrics.put({ id, lyrics, savedAt: Date.now() });
  } catch {
    // ignore: see cacheSongList
  }
}

export async function loadCachedLyrics(id: string): Promise<string | undefined> {
  const d = getDb();
  if (!d) return undefined;
  try {
    return (await d.lyrics.get(id))?.lyrics;
  } catch {
    return undefined;
  }
}
