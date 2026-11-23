import { supabase, withTimeout } from "./supabase";

// Bibles stored in our own database (supabase/bible.sql). Their version id starts with "db:" so they
// never clash with YouVersion's numeric ids, e.g. "db:bunong-vn".
export const DB_PREFIX = "db:";
export const DB_BIBLES = [{ id: "db:bunong-vn", name: "Bunong (Vietnam)" }];
export const isDbBible = (id: string | undefined): id is string => !!id && id.startsWith(DB_PREFIX);
const translationOf = (id: string) => id.slice(DB_PREFIX.length);

export interface DbBook { code: string; title: string }
export interface DbVerse { verse: number; verseEnd: number | null; text: string }

// The books of a translation, in Bible order, with the translation's own names (e.g. EXO -> "Nau Ngluh")
export async function fetchDbBooks(bible: string): Promise<DbBook[]> {
  if (!supabase) throw new Error("This Bible needs the Supabase settings in app/.env.local.");
  const res = await withTimeout(
    supabase.from("bible_book_names").select("book_code, name, bible_books(book_order)").eq("translation_id", translationOf(bible)),
    15000,
    { data: null, error: { message: "The Bible list took too long to load." } } as never,
  );
  if (res.error) throw new Error(res.error.message);
  type Row = { book_code: string; name: string; bible_books: { book_order: number } | { book_order: number }[] | null };
  const order = (r: Row) => (Array.isArray(r.bible_books) ? r.bible_books[0]?.book_order : r.bible_books?.book_order) ?? 99;
  return ((res.data ?? []) as Row[]).sort((a, b) => order(a) - order(b)).map((r) => ({ code: r.book_code, title: r.name }));
}

// Verses v1..v2 of one chapter in one request. A verse printed together with the next ("14-15") is one row
// and is included when any part of it falls in the range.
export async function fetchDbPassage(bible: string, book: string, chapter: number, v1: number, v2: number): Promise<DbVerse[]> {
  if (!supabase) throw new Error("This Bible needs the Supabase settings in app/.env.local.");
  const res = await withTimeout(
    supabase.from("bible_verses").select("verse, verse_end, text")
      .eq("translation_id", translationOf(bible)).eq("book_code", book).eq("chapter", chapter)
      .gte("verse", v1 - 5).lte("verse", v2).order("verse"),
    15000,
    { data: null, error: { message: "The passage took too long to load. Check the connection and try again." } } as never,
  );
  if (res.error) throw new Error(res.error.message);
  const rows = ((res.data ?? []) as { verse: number; verse_end: number | null; text: string }[])
    .filter((r) => (r.verse_end ?? r.verse) >= v1)
    .map((r) => ({ verse: r.verse, verseEnd: r.verse_end, text: r.text }));
  if (!rows.length) throw new Error("Verse not found. Check the book, chapter and verse.");
  return rows;
}
