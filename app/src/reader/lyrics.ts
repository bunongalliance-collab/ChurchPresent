import { isIgnoredMarker, labelOf } from "../lib/slides";
import { parseRich } from "../lib/richtext";

// Lyrics for reading: sections with their labels, using the same label rules as the slides
// ([Verse 1], Verse 2, Chorus, v1, c2, bridge 1…). Formatting marks (bold, colours) are removed.

export interface Section { label: string; chorus: boolean; lines: string[] }

const LABEL_NAMES: Record<string, string> = { V: "Verse", B: "Bridge", PC: "Pre-chorus", I: "Intro", O: "Outro", T: "Tag", E: "Ending" };

// "V1" → "Verse 1", "B" → "Bridge", "Chorus" stays "Chorus"
export function labelName(short: string): string {
  if (short === "Chorus") return "Chorus";
  const m = short.match(/^([A-Z]+)(\d*)$/);
  if (!m) return short;
  const word = LABEL_NAMES[m[1]] ?? m[1];
  return m[2] ? `${word} ${m[2]}` : word;
}

const plain = (line: string) => parseRich(line).map((s) => s.text).join("");

// A blank line or a label starts a new section. "Plõ mpro" markers only separate verses and are not shown.
export function toSections(lyrics: string): Section[] {
  const out: Section[] = [];
  let cur: Section | null = null;
  const finish = () => {
    if (cur && cur.lines.length) out.push(cur);
    cur = null;
  };
  for (const raw of lyrics.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trim();
    if (!line || isIgnoredMarker(line)) { finish(); continue; }
    const lab = labelOf(line);
    if (lab) {
      finish();
      cur = { label: labelName(lab), chorus: lab === "Chorus", lines: [] };
      continue;
    }
    const text = plain(line).trim();
    if (!text) continue;
    if (!cur) cur = { label: "", chorus: false, lines: [] };
    (cur as Section).lines.push(text);
  }
  finish();
  return out;
}

// Search that ignores accents and case, so "gap tam" finds "GÂP TÂM" and "yesu" finds "Yê-Su"
export function fold(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "").replace(/[đĐ]/g, "d").toLowerCase().replace(/[-–—]/g, " ").replace(/\s+/g, " ").trim();
}

// A catalogue entry kept for its number although its page is missing from the scanned hymn book:
// the title says so and there are no words. It stops being "unavailable" once words are added.
export function isUnavailable(s: { title: string; lyrics: string }): boolean {
  return /page missing/i.test(s.title) && (!s.lyrics.trim() || fold(s.lyrics) === fold(s.title));
}

// The library can hold copies of one song: same number and title
export const songKey = (s: { number: string; title: string }) => `${s.number.trim()}|${fold(s.title)}`;

interface Copy { number: string; title: string; lyrics: string; updated: string; scorePath?: string; scoreImages?: string[] }

// A copy with its music sheet (the hymn book's) beats one without. A missing-page entry beats nothing.
const rank = (s: Copy) => isUnavailable(s) ? 0 : s.scoreImages?.length || s.scorePath ? 2 : 1;

// Each song once: the best ranked copy, shown whole so the words match the sheet; else the most recently updated
export function onePerSong<T extends Copy>(songs: T[]): T[] {
  const best = new Map<string, T>();
  for (const s of songs) {
    const key = songKey(s), had = best.get(key);
    if (!had || rank(s) > rank(had) || (rank(s) === rank(had) && s.updated > had.updated)) best.set(key, s);
  }
  return [...best.values()];
}

const hasSheet = (s: Copy) => !isUnavailable(s) && !!(s.scoreImages?.length || s.scorePath);

// The songs the reader shows without a music sheet, in number order, and why (for the Notes page)
export function withoutSheet<T extends Copy>(songs: T[]): { total: number; missing: { song: T; why: string }[] } {
  const all = onePerSong(songs);
  const num = (s: T) => { const n = parseInt(s.number, 10); return Number.isNaN(n) ? Infinity : n; };
  const missing = all.filter((s) => !hasSheet(s)).sort((a, b) => (num(a) === num(b) ? 0 : num(a) - num(b))).map((song) => {
    const n = song.number.trim();
    const other = n ? all.find((x) => x.number.trim() === n && hasSheet(x)) : undefined;
    const why = other ? `Hymn book ${n} has a sheet under “${other.title}”`
      : isUnavailable(song) ? "Page missing from the scanned hymn book" : "No sheet on any copy";
    return { song, why };
  });
  return { total: all.length, missing };
}
