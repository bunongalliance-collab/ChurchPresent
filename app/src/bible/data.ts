// Bunong Bible reader: Bible text from our own database (supabase/bible.sql), kept on the device.
// A book is fetched whole the first time any chapter of it is opened, then saved in IndexedDB, so it reads offline
// afterwards. "Save the whole Bible" in Settings fetches every book.
import { supabase, selectAll, withTimeout } from "../lib/supabase";
import { searchSaved, tidy, type Hit } from "./find";

export const TRANSLATION = "bunong-vn";

export interface Book { code: string; order: number; testament: "OT" | "NT"; name: string; local: string; chapters: number }
export interface Verse { v: number; end: number | null; text: string; para: boolean }
export interface Heading { before: number; pos: number; kind: string; text: string }
export interface Chapter { verses: Verse[]; headings: Heading[] }
export interface BookText { code: string; chapters: Record<number, Chapter>; savedAt: number }

// The 66 books in Bible order (codes match bible_books). Chapter counts are the usual ones and are used until a book's
// text is loaded; after that the chapters in the text are used.
const BASE: [string, string, number][] = [
  ["GEN","Genesis",50],["EXO","Exodus",40],["LEV","Leviticus",27],["NUM","Numbers",36],["DEU","Deuteronomy",34],["JOS","Joshua",24],["JDG","Judges",21],["RUT","Ruth",4],["1SA","1 Samuel",31],["2SA","2 Samuel",24],["1KI","1 Kings",22],["2KI","2 Kings",25],["1CH","1 Chronicles",29],["2CH","2 Chronicles",36],["EZR","Ezra",10],["NEH","Nehemiah",13],["EST","Esther",10],["JOB","Job",42],["PSA","Psalms",150],["PRO","Proverbs",31],["ECC","Ecclesiastes",12],["SNG","Song of Songs",8],["ISA","Isaiah",66],["JER","Jeremiah",52],["LAM","Lamentations",5],["EZK","Ezekiel",48],["DAN","Daniel",12],["HOS","Hosea",14],["JOL","Joel",3],["AMO","Amos",9],["OBA","Obadiah",1],["JON","Jonah",4],["MIC","Micah",7],["NAM","Nahum",3],["HAB","Habakkuk",3],["ZEP","Zephaniah",3],["HAG","Haggai",2],["ZEC","Zechariah",14],["MAL","Malachi",4],
  ["MAT","Matthew",28],["MRK","Mark",16],["LUK","Luke",24],["JHN","John",21],["ACT","Acts",28],["ROM","Romans",16],["1CO","1 Corinthians",16],["2CO","2 Corinthians",13],["GAL","Galatians",6],["EPH","Ephesians",6],["PHP","Philippians",4],["COL","Colossians",4],["1TH","1 Thessalonians",5],["2TH","2 Thessalonians",3],["1TI","1 Timothy",6],["2TI","2 Timothy",4],["TIT","Titus",3],["PHM","Philemon",1],["HEB","Hebrews",13],["JAS","James",5],["1PE","1 Peter",5],["2PE","2 Peter",3],["1JN","1 John",5],["2JN","2 John",1],["3JN","3 John",1],["JUD","Jude",1],["REV","Revelation",22],
];

const NAMES_KEY = "bible.bookNames";
const COUNTS_KEY = "bible.chapterCounts";
const read = <T,>(k: string, fallback: T): T => { try { const s = localStorage.getItem(k); return s ? (JSON.parse(s) as T) : fallback; } catch { return fallback; } };
const write = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage blocked */ } };

// The book list from what this device already knows (works offline)
export function localBooks(): Book[] {
  const names = read<Record<string, string>>(NAMES_KEY, {});
  const counts = read<Record<string, number>>(COUNTS_KEY, {});
  return BASE.map(([code, name, ch], i) => ({ code, order: i + 1, testament: i < 39 ? "OT" : "NT", name, local: names[code] || name, chapters: counts[code] || ch }));
}

// The translation's own book names (e.g. EXO -> "Nau Ngluh"), fetched once and remembered
export async function refreshBookNames(): Promise<Book[] | null> {
  if (!supabase) return null;
  const res = await withTimeout(
    supabase.from("bible_book_names").select("book_code, name").eq("translation_id", TRANSLATION),
    10000, { data: null, error: { message: "timeout" } } as never,
  );
  if (res.error || !res.data) return null;
  const names: Record<string, string> = {};
  for (const r of res.data as { book_code: string; name: string }[]) names[r.book_code] = r.name;
  write(NAMES_KEY, names);
  return localBooks();
}

// ---------- IndexedDB: one record per book ----------
const DB = "bunong-bible";
const STORE = "books";
function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "code" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function idb<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T | undefined> {
  try {
    const db = await openDb();
    return await new Promise<T>((resolve, reject) => {
      const req = fn(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result as T);
      req.onerror = () => reject(req.error);
    });
  } catch { return undefined; } // private window or storage blocked: read from the network each time
}
// A book saved on this device, or undefined (never fetches). The Scripture page uses it when offline.
export const savedBook = (code: string) => idb<BookText>("readonly", (s) => s.get(code));
export const savedBookCodes = async () => ((await idb<IDBValidKey[]>("readonly", (s) => s.getAllKeys())) ?? []).map(String);
export const clearSavedBooks = () => idb("readwrite", (s) => s.clear());

// ---------- Network ----------
type VerseRow = { chapter: number; verse: number; verse_end: number | null; text: string; para: boolean };
type HeadingRow = { chapter: number; before_verse: number; position: number; kind: string; text: string };

async function fetchBook(code: string): Promise<BookText> {
  if (!supabase) throw new Error("The Bible text needs the Supabase settings in app/.env.local.");
  if (!navigator.onLine) throw new Error("offline");
  const sb = supabase;
  const [verses, headings] = await Promise.all([
    selectAll<VerseRow>((a, b) => sb.from("bible_verses").select("chapter, verse, verse_end, text, para")
      .eq("translation_id", TRANSLATION).eq("book_code", code).order("chapter").order("verse").range(a, b)),
    selectAll<HeadingRow>((a, b) => sb.from("bible_headings").select("chapter, before_verse, position, kind, text")
      .eq("translation_id", TRANSLATION).eq("book_code", code).order("chapter").order("before_verse").order("position").range(a, b)),
  ]);
  if (verses.error) throw new Error(verses.error.message);
  if (headings.error) throw new Error(headings.error.message);
  if (!verses.data?.length) throw new Error("This book has no text in the database yet.");
  const chapters: Record<number, Chapter> = {};
  const ch = (n: number) => (chapters[n] ??= { verses: [], headings: [] });
  for (const r of verses.data) ch(r.chapter).verses.push({ v: r.verse, end: r.verse_end, text: r.text, para: r.para });
  for (const r of headings.data ?? []) ch(r.chapter).headings.push({ before: r.before_verse, pos: r.position, kind: r.kind, text: r.text });
  const counts = read<Record<string, number>>(COUNTS_KEY, {});
  counts[code] = Math.max(...Object.keys(chapters).map(Number));
  write(COUNTS_KEY, counts);
  return { code, chapters, savedAt: Date.now() };
}

// A book's text: from the device if saved, otherwise fetched and saved
const pending = new Map<string, Promise<BookText>>();
export function getBook(code: string): Promise<BookText> {
  const p = pending.get(code);
  if (p) return p;
  const run = (async () => {
    const saved = await idb<BookText>("readonly", (s) => s.get(code));
    if (saved) return saved;
    const book = await fetchBook(code);
    await idb("readwrite", (s) => s.put(book));
    return book;
  })().finally(() => pending.delete(code));
  pending.set(code, run);
  return run;
}

// Save every book on this device. Calls onProgress after each book; stops early when shouldStop() is true.
export async function saveWholeBible(onProgress: (done: number, total: number) => void, shouldStop: () => boolean): Promise<void> {
  const have = new Set(await savedBookCodes());
  let done = have.size;
  onProgress(done, BASE.length);
  for (const [code] of BASE) {
    if (shouldStop()) return;
    if (have.has(code)) continue;
    await getBook(code);
    onProgress(++done, BASE.length);
  }
}

// ---------- Phrase search ----------
export const SEARCH_LIMIT = 100;
// searched: how many books were looked through, when it was only the ones saved on this device (offline); otherwise null
export interface SearchResult { hits: Hit[]; more: boolean; searched: number | null }
// With the whole Bible saved, or offline, the saved books are searched; otherwise the database, so every book is covered
export async function searchBible(phrase: string, books: Book[]): Promise<SearchResult> {
  const q = tidy(phrase);
  const have = await savedBookCodes();
  const whole = have.length >= BASE.length;
  const done = (hits: Hit[], searched: number | null) => ({ hits: hits.slice(0, SEARCH_LIMIT), more: hits.length > SEARCH_LIMIT, searched });
  if (!whole && supabase && navigator.onLine) {
    const res = await withTimeout(
      supabase.from("bible_verses").select("book_code, chapter, verse, verse_end, text, bible_books(book_order)")
        .eq("translation_id", TRANSLATION).ilike("text", `%${q.replace(/[\\%_]/g, "\\$&")}%`)
        .order("bible_books(book_order)").order("chapter").order("verse").limit(SEARCH_LIMIT + 1),
      15000, { data: null, error: { message: "timeout" } } as never,
    );
    if (!res.error && res.data) {
      const rows = res.data as unknown as { book_code: string; chapter: number; verse: number; verse_end: number | null; text: string }[];
      return done(rows.map((r) => ({ b: r.book_code, c: r.chapter, v: r.verse, end: r.verse_end, text: r.text })), null);
    }
  }
  const texts = (await idb<BookText[]>("readonly", (s) => s.getAll())) ?? [];
  return done(searchSaved(q, texts, books, SEARCH_LIMIT + 1), whole ? null : texts.length);
}
