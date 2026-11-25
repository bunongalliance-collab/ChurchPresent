// Finding passages in the Bunong Bible reader: typed references, phrases in saved books, and the scripture reading of
// the church's published service. Pure functions (no storage or network), so they are easy to test.
import type { Book, BookText, Verse } from "./data";
import type { PublishedService } from "../lib/publishedService";

// A passage: book, chapter, and the verses (null: the whole chapter)
export interface Found { book: Book; chap: number; v1: number | null; v2: number | null }

// Letters and digits only, without accents, so "nau ntom" finds "Nau Ntơm"
const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/đ/g, "d").replace(/[^a-z0-9]/g, "");

const EXTRA: Record<string, string[]> = { SNG: ["Song of Solomon"], REV: ["Revelations"] };
// The ways a book can be typed: its Bunong name, English name and code; "I"/"Ii" as 1/2; with or without "Y-" or "H'"
function aliases(b: Book): string[] {
  const local = b.local.replace(/^Ii\s+/, "2 ").replace(/^I\s+/, "1 ");
  const bare = local.replace(/^([12] )?(?:Y-|H['’])/, "$1");
  return [b.local, local, bare, b.name, b.code, ...(EXTRA[b.code] ?? [])].map(fold);
}
// An exact name wins; otherwise every book that starts with what was typed
function booksNamed(typed: string, books: Book[]): Book[] {
  const q = fold(typed);
  if (q.replace(/\d/g, "").length < 1) return [];
  const exact = books.filter((b) => aliases(b).includes(q));
  if (exact.length) return exact;
  return q.length < 2 ? [] : books.filter((b) => aliases(b).some((a) => a.startsWith(q)));
}

// "Nau Ntơm 1:1-2", "John 3.16", "Psalm 23", "1co13:4". Empty when it isn't a reference to a chapter that exists.
export function parseReference(typed: string, books: Book[]): Found[] {
  const m = typed.normalize("NFC").match(/^\s*((?:[123]\s*)?\D+?)\s*(\d+)(?:\s*[:.]\s*(\d+)(?:\s*[-–—]\s*(\d+)(\s*[:.]\s*\d+)?)?|\s*[-–—]\s*\d+)?\s*$/);
  if (!m) return [];
  const num = Number(m[2]);
  return booksNamed(m[1], books).flatMap((book): Found[] => {
    let chap = num;
    let v1 = m[3] ? Number(m[3]) : null;
    // "Jude 5" means verse 5: a one-chapter book
    if (v1 === null && book.chapters === 1 && num > 1) { chap = 1; v1 = num; }
    if (chap < 1 || chap > book.chapters) return [];
    // A range into a later chapter ("1:26-2:3") opens its first chapter, to the end
    const v2 = v1 === null ? null : m[5] ? 999 : m[4] ? Math.max(v1, Number(m[4])) : v1;
    return [{ book, chap, v1, v2 }];
  });
}

// The verses of a range. A verse printed together with the next ("14-15") is included when any part of it is in range.
export const versesInRange = (verses: Verse[], v1: number, v2: number): Verse[] => verses.filter((v) => (v.end ?? v.v) >= v1 && v.v <= v2);

// ---------- Phrase search ----------
export interface Hit { b: string; c: number; v: number; end: number | null; text: string }
export const tidy = (s: string) => s.normalize("NFC").replace(/\s+/g, " ").trim();

export function searchSaved(phrase: string, texts: BookText[], books: Book[], limit: number): Hit[] {
  const q = tidy(phrase).toLowerCase();
  const out: Hit[] = [];
  if (!q) return out;
  const order = (code: string) => books.findIndex((b) => b.code === code);
  for (const t of [...texts].sort((a, b) => order(a.code) - order(b.code))) {
    for (const c of Object.keys(t.chapters).map(Number).sort((a, b) => a - b)) {
      for (const v of t.chapters[c].verses) {
        if (!tidy(v.text).toLowerCase().includes(q)) continue;
        out.push({ b: t.code, c, v: v.v, end: v.end, text: v.text });
        if (out.length >= limit) return out;
      }
    }
  }
  return out;
}

// ---------- The service's scripture reading ----------
// No timezone is stored for a church yet. The church is in Charlotte, North Carolina.
export const CHURCH_TIME_ZONE = "America/New_York";
// Today's date where the church is, as YYYY-MM-DD
export function churchDay(now = new Date(), timeZone = CHURCH_TIME_ZONE): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}
export const readingLabel = (serviceDate: string, today: string) => (serviceDate > today ? "Upcoming reading" : serviceDate < today ? "Previous reading" : "Today’s reading");

// The first scripture reading of the service that names a passage this Bible has. The Program saves the reference
// ("Psalm 23:1-6"); an older line may carry the study's title before it ("Trust in God — Psalm 23:1-6").
export function serviceScripture(service: PublishedService | null, books: Book[]): Found | null {
  for (const item of service?.items ?? []) {
    for (const sub of item.subs ?? []) {
      if (sub.kind !== "scripture") continue;
      for (const part of sub.text.split(";")) {
        const found = parseReference(part.split("—").pop()!, books);
        if (found.length === 1) return found[0];
      }
    }
  }
  return null;
}
