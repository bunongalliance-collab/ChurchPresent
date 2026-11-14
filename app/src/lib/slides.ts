// Shared slide engine: turns lyrics text into slides. Pure functions, no DOM access.
// Ported from lyrics.html so the Lyrics page, the scripture page and the builder can share one engine.

// Widescreen 16:9 slide (13.33 × 7.5 in = 960 × 540 pt)
export const SLIDE_W_IN = 13.333;
export const SLIDE_H_IN = 7.5;
export const MARGIN_IN = 0.6; // safe area on all sides
export const USABLE_W = SLIDE_W_IN - 2 * MARGIN_IN; // inches
export const USABLE_H = SLIDE_H_IN - 2 * MARGIN_IN;
export const SLIDE_W_PT = 960;
export const MAX_PT = 84;
export const MIN_PT = 28;
export const LINE_H = 1.3;
export const MIN_LH = 1.1; // tightest line spacing for a singing slide before its verse is split
// Singing slides use smaller margins, so the text can be bigger
export const SING_MARGIN_IN = 0.2;
export const SING_W_PT = (SLIDE_W_IN - 2 * SING_MARGIN_IN) * 72;
export const SING_H_PT = (SLIDE_H_IN - 2 * SING_MARGIN_IN) * 72;
// The recommended size for projection (readable from the back of the room). Automatic size never goes above it.
export const RECOMMENDED_PT = 58;
// Automatic size for singing slides: the recommended size, or smaller if the longest line would not fit the width
export const SING_MAX_PT = RECOMMENDED_PT;

// Average character width as a fraction of font size, per font (bold adds about 5%)
export const CHAR_W: Record<string, number> = { Arial: 0.487, Verdana: 0.58, Calibri: 0.44, Georgia: 0.52 }; // average bold character width, measured (x1.05 safety factor applied in the engine)
export const FONTS = Object.keys(CHAR_W);

// Visible length of text: formatting markers (bold, colour, highlight, verse-number marks) take no space
const MARKER_RE = /\*\*|~~|__|\{#[0-9a-fA-F]{6}\}|\{\/\}|\{h#[0-9a-fA-F]{6}\}|\{\/h\}|\{\/?[vn]\}|[\u0001-\u0003]/g;
export const visLen = (t: string) => t.replace(MARKER_RE, "").length;


export interface Slide extends Array<string> {
  label?: string;
  size?: number;  // a font size for this slide only (singing slides use one size for all, so this is unused there)
  lineH?: number; // line spacing for this slide (singing slides tighten it to fit the height)
}

export interface Notes {
  repeats: number;
  removeRepeats: boolean;
  title?: string;
  number?: string;
}

export interface Meta {
  title?: string;
  number?: string;
}

// "Title, ...", "Title: ...", "Number, 90", "#90", "Number #90"
export function metaOf(line: string): Meta | null {
  let m = line.match(/^\s*title\s*[:,\-]\s*(.+?)\s*$/i);
  if (m) return { title: m[1] };
  m =
    line.match(/^\s*(?:song\s*)?(?:number|no\.?)?\s*[:,]?\s*#\s*(\d+)\s*$/i) ||
    line.match(/^\s*(?:song\s*)?number\s*[:,]?\s*(?:as\s*)?#?\s*[:,]?\s*(\d+)\s*$/i);
  if (m) return { number: m[1] };
  return null;
}

// Section labels: [Verse 1], Verse 2, Chorus, v1, c2, bridge 1, and so on.
const LABEL_WORDS: Record<string, string> = {
  v: "V", verse: "V", c: "C", chorus: "C", b: "B", bridge: "B",
  "pre-chorus": "PC", prechorus: "PC", intro: "I", outro: "O", tag: "T", ending: "E", refrain: "C",
};
// "Plõ mpro" is only a verse marker in these songs: it is not shown on slides (see buildSections)
// Matches "Plõ mpro", "Plõ mprõ", "Plo mpro" and so on: accents are ignored when comparing
export const isIgnoredMarker = (line: string) =>
  line.trim().normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ") === "plo mpro";
export function labelOf(line: string): string {
  const m = line.match(/^\s*(\[)?\s*([\p{L}-]+(?: [\p{L}-]+)?)\s*(\d*)\s*:?\s*(\])?\s*$/iu);
  if (!m) return "";
  const word = m[2].toLowerCase();
  const short = LABEL_WORDS[word];
  if (!short) return "";
  // A lone "v", "c" or "b" counts only with a number or brackets
  if (!m[3] && !m[1] && word.length === 1) return "";
  if (short === "C") return "Chorus";
  return short + m[3];
}

// Break a pasted line into short phrases (about 8 words each, at most).
const TARGET_WORDS = 8;
const MIN_WORDS = 6;
// keepWhole: the line is one phrase, kept on one row (used for singing slides that follow the lyric's own lines)
export function splitLine(line: string, keepWhole = false): string[] {
  if (keepWhole) {
    // Break only at a colon or at the end of a sentence (. ! ? with an optional closing quote). Words are never changed.
    return line.trim().split(/(?<=:)\s+|(?<=[?!.]["”']?)\s+(?=\S)/u).map((p) => p.trim()).filter(Boolean);
  }
  const phrases: string[][] = [];
  for (const piece of line.replace(/(\p{Ll})(\p{Lu})/gu, "$1\n$2").split("\n")) {
    for (const clause of piece.match(/[^,.;:]+[,.;:]*/g) || []) {
      const words = clause.replace(/[,.;:]+$/, "").trim().split(/\s+/).filter(Boolean);
      if (!words.length) continue;
      const count = Math.ceil(words.length / TARGET_WORDS);
      const per = Math.ceil(words.length / count);
      for (let i = 0; i < words.length; i += per) phrases.push(words.slice(i, i + per));
    }
  }
  const merged: string[][] = [];
  for (const p of phrases) {
    const last = merged[merged.length - 1];
    if (last && (last.length < MIN_WORDS || p.length < MIN_WORDS) && last.length + p.length <= TARGET_WORDS) {
      merged[merged.length - 1] = last.concat(p);
    } else {
      merged.push(p);
    }
  }
  return merged.map((w) => w.join(" "));
}

// Remove repeated runs (6+ identical words in a row keep only the first copy).
export function cleanRepeats(text: string, notes: Notes): string {
  const spaced = text.replace(/(\p{Ll})(\p{Lu})/gu, "$1 $2");
  const tokens: { w: string; k: string; brk: number }[] = [];
  const re = /(\s*)(\S+)/gu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(spaced))) {
    const breaks = (m[1].match(/\n/g) || []).length;
    const k = m[2].toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
    tokens.push({ w: m[2], k, brk: tokens.length ? Math.min(breaks, 2) : 0 });
  }
  const n = tokens.length;
  const same = (a: number, b: number, len: number) => {
    for (let k = 0; k < len; k++) if (tokens[a + k].k !== tokens[b + k].k) return false;
    return true;
  };
  const out: typeof tokens = [];
  let i = 0;
  while (i < n) {
    let best = 0;
    for (let L = 6; L <= Math.floor((n - i) / 2); L++) {
      if (same(i, i + L, L)) { best = L; break; }
    }
    if (!best) { out.push(tokens[i]); i++; continue; }
    let reps = 1;
    while (i + (reps + 1) * best <= n && same(i, i + reps * best, best)) reps++;
    out.push(...tokens.slice(i, i + best));
    notes.repeats += reps - 1;
    i += reps * best;
  }
  return out.map((t, k) => (k === 0 ? "" : t.brk ? "\n".repeat(t.brk) : " ") + t.w).join("");
}

// Split lyrics into sections: blank lines and labels end a section.
export function buildSections(text: string, notes: Notes, keepWhole = false): Slide[] {
  // Singing slides keep the lyric exactly: no repeat removal, so every chorus is shown
  const removeReps = notes.removeRepeats && !keepWhole;
  const cleaned = removeReps ? cleanRepeats(text.normalize("NFC"), notes) : text.normalize("NFC");
  const sections: Slide[] = [];
  const seen = new Set<string>();
  let cur: string[] = [];
  let curLabel = "";
  const flush = () => {
    if (cur.length) {
      const sec = Object.assign([...cur], { label: curLabel }) as Slide;
      const key = cur.join("|").toLowerCase();
      if (cur.length >= 2 && seen.has(key) && removeReps) notes.repeats++;
      else { seen.add(key); sections.push(sec); }
    }
    cur = [];
  };
  for (const raw of cleaned.split("\n")) {
    const line = raw.trim();
    const meta = metaOf(line);
    if (meta) {
      flush();
      if (meta.title) notes.title = meta.title;
      if (meta.number) notes.number = meta.number;
      continue;
    }
    // The marker ends the section above it and is not shown; the lines under it are a plain verse
    if (isIgnoredMarker(line)) { flush(); curLabel = ""; continue; }
    const lab = labelOf(line);
    if (lab) { flush(); curLabel = lab; continue; }
    if (!line) {
      if (cur.length) { flush(); curLabel = ""; }
      continue;
    }
    cur.push(...splitLine(line, keepWhole));
  }
  flush();
  return sections;
}

// One size for the whole deck, so every slide looks the same on the projector.
export function deckSize(slides: string[][], font: string, perSlide: number): number {
  let maxChars = 0;
  for (const s of slides) {
    for (const line of s) {
      for (const w of line.split(/\s+/)) maxChars = Math.max(maxChars, visLen(w));
    }
  }
  if (!maxChars) maxChars = 10;
  const widthPt = (USABLE_W * 72) / (CHAR_W[font] * 1.05 * maxChars);
  const heightPt = (USABLE_H * 72) / (perSlide * LINE_H);
  return Math.max(MIN_PT, Math.min(MAX_PT, Math.floor(Math.min(widthPt, heightPt))));
}

// One font size for every singing slide: the largest size at which the longest lyric line fits the width.
// Verses and choruses are never shrunk to fit; their line spacing and height are handled per slide.
export function singingSize(sections: Slide[], font: string): number {
  let longest = 0;
  for (const sec of sections) for (const line of sec) longest = Math.max(longest, visLen(line));
  if (!longest) return SING_MAX_PT;
  // The biggest size at which the longest line fits the slide width, inside the tighter singing margins
  const fit = Math.floor((SING_W_PT * 0.98) / (CHAR_W[font] * longest));
  return Math.max(MIN_PT, Math.min(SING_MAX_PT, fit));
}

// How many rows fit on one slide at a font size (at least 1)
export function rowsThatFit(size: number): number {
  return Math.max(1, Math.floor((USABLE_H * 72) / (size * LINE_H)));
}

// Wrap lines to the slide width and split them across slides so nothing overflows.
// Line breaks the user typed are kept; long lines wrap onto extra rows.
export function flowLines(lines: string[], font: string, size: number, maxRows = Infinity): string[][] {
  const maxW = USABLE_W * 72;
  const widthOf = (t: string) => visLen(t) * CHAR_W[font] * 1.05 * size;
  const rows: string[] = [];
  for (const line of lines) {
    let cur = "";
    for (const word of line.split(/\s+/).filter(Boolean)) {
      const next = cur ? `${cur} ${word}` : word;
      if (cur && widthOf(next) > maxW) { rows.push(cur); cur = word; } else cur = next;
    }
    if (cur) rows.push(cur);
  }
  const per = Math.min(maxRows, rowsThatFit(size));
  const out: string[][] = [];
  for (let i = 0; i < rows.length; i += per) out.push(rows.slice(i, i + per));
  return out;
}

// Lay out one section as slides of up to perSlide rows. A section that fits stays on one slide.
export function packSection(sec: Slide, font: string, size: number, perSlide: number, paragraphBreaks = false, keepWhole = false): Slide[] {
  const maxW = USABLE_W * 72;
  const widthOf = (t: string) => visLen(t) * CHAR_W[font] * 1.05 * size;
  if (keepWhole) {
    // Singing slides: every slide uses the same font size (the deck size, set so the longest line fits the width).
    // A verse or chorus stays on one slide. Its line spacing tightens only as far as MIN_LH; if it is still too
    // tall, it is split across slides at a phrase boundary, with the same font size.
    const maxRows = Math.max(1, Math.floor(SING_H_PT / (size * MIN_LH)));
    const groups = Math.max(1, Math.ceil(sec.length / maxRows));
    const per = Math.ceil(sec.length / groups);
    const out: Slide[] = [];
    for (let i = 0; i < sec.length; i += per) {
      const rows = sec.slice(i, i + per);
      const lh = Math.min(LINE_H, SING_H_PT / (rows.length * size));
      const slide = Object.assign([...rows], { label: sec.label, lineH: Math.round(lh * 100) / 100 }) as Slide;
      out.push(slide);
    }
    return out;
  }
  const rows: string[] = [];
  let cur = "";
  for (const phrase of sec) {
    for (const word of phrase.split(/\s+/).filter(Boolean)) {
      const next = cur ? `${cur} ${word}` : word;
      // With paragraph breaks on, every verse (a word marked as a verse number) starts a new row
      if (cur && paragraphBreaks && word.startsWith("\u0001")) { rows.push(cur); cur = word; continue; }
      if (cur && widthOf(next) > maxW) {
        rows.push(cur);
        cur = word;
      } else {
        cur = next;
      }
    }
  }
  if (cur) rows.push(cur);
  // Never put more rows on a slide than fit its height at this size; extra rows flow to the next slide
  perSlide = Math.min(perSlide, rowsThatFit(size));
  const count = Math.ceil(rows.length / perSlide);
  const target = Math.ceil(rows.length / count) || 1;
  const slides: string[][] = [];
  for (let i = 0; i < rows.length; i += target) slides.push(rows.slice(i, i + target));
  const countWords = (sl: string[]) => sl.join(" ").split(/\s+/).filter(Boolean).length;
  // The last slide of a section needs at least 4 words; take the missing words from the slide before it
  if (slides.length > 1 && countWords(slides[slides.length - 1]) < 4) {
    const prev = slides[slides.length - 2];
    const last = slides[slides.length - 1];
    let need = 4 - countWords(last);
    const moved: string[] = [];
    for (let r = prev.length - 1; r >= 0 && need > 0; r--) {
      const ws = prev[r].split(" ");
      const take = Math.min(need, ws.length - 1);
      if (take > 0) {
        moved.unshift(ws.splice(ws.length - take, take).join(" "));
        prev[r] = ws.join(" ");
        need -= take;
      }
    }
    if (moved.length) {
      const mv = moved.join(" ");
      if (last.length < perSlide) last.unshift(mv);
      else last[0] = mv + " " + last[0];
    }
  }
  return slides.map((sl) => Object.assign(sl, { label: sec.label }) as Slide);
}

export interface Deck {
  font: string;
  size: number;
  slides: Slide[];   // all slides, title slide first
  titleSlide: Slide[];
  title: string;
  number: string;
  notes: Notes;
}

// Build the whole deck from the form values. Custom size overrides the automatic one when > 0.
export function buildDeck(opts: {
  lyrics: string;
  font: string;
  perSlide: number;
  removeRepeats: boolean;
  showTitle: boolean;
  songTitle: string;
  songNumber: string;
  customSize: number;
  paragraphBreaks?: boolean; // justified text: each verse starts its own row
  keepLines?: boolean;       // singing slides: each lyric line is one phrase and is never split
}): Deck {
  const notes: Notes = { repeats: 0, removeRepeats: opts.removeRepeats };
  const sections = buildSections(opts.lyrics, notes, !!opts.keepLines);
  const title = opts.songTitle.trim() || notes.title || "";
  const number = (opts.songNumber.trim() || notes.number || "").replace(/^#/, "");
  const titleLines = [title, number ? `#${number}` : ""].filter(Boolean);
  const titleSlide: Slide[] = titleLines.length && opts.showTitle ? [Object.assign(titleLines, {}) as Slide] : [];
  const all = [...titleSlide, ...sections];
  let size: number;
  if (opts.customSize > 0) size = opts.customSize;
  else if (opts.keepLines) size = singingSize(sections, opts.font);
  else size = all.length ? deckSize(all, opts.font, opts.perSlide) : MAX_PT;
  const packed = sections.flatMap((sec) => packSection(sec, opts.font, size, opts.perSlide, !!opts.paragraphBreaks, !!opts.keepLines));
  return {
    font: opts.font,
    size,
    slides: [...titleSlide, ...packed],
    titleSlide,
    title,
    number,
    notes,
  };
}

// Warnings for a size that is too big for the slide (estimate ignores extra wrapped rows)
export function sizeWarning(slides: Slide[], font: string, size: number): string {
  const tooWide = slides.some((s) => s.some((l) => l.length * CHAR_W[font] * 1.05 * size > USABLE_W * 72));
  const tooTall = slides.some((s) => s.length * size * LINE_H > USABLE_H * 72);
  return slides.length && (tooWide || tooTall)
    ? "Warning: at this size some lines may wrap or run past the edge of the slide. Try a smaller size."
    : "";
}

// Turn a typed shortcut line into the full word: "v1" → "Verse 1", "c2" → "Chorus 2", "b1" → "Bridge 1".
const FULL_WORD: Record<string, string> = { v: "Verse", c: "Chorus", b: "Bridge" };
export function expandShortcuts(text: string, caret: number): { text: string; caret: number } {
  const lines = text.split("\n");
  const caretLine = text.slice(0, caret).split("\n").length - 1;
  let changed = false;
  const out = lines.map((l) => {
    const m = l.match(/^(\s*)(v|c|b)\s*(\d+)\s*:?\s*$/i);
    if (!m) return l;
    changed = true;
    return `${m[1]}${FULL_WORD[m[2].toLowerCase()]} ${m[3]}`;
  });
  if (!changed) return { text, caret };
  const before = out.slice(0, caretLine).reduce((s, l) => s + l.length + 1, 0);
  return { text: out.join("\n"), caret: before + out[caretLine].length };
}

// Move finished "Title: ..." and "Number: ..." lines out of the lyrics (above the caret line only).
export function takeMetaLines(text: string, caret: number): { text: string; caret: number; title?: string; number?: string } {
  const caretLine = text.slice(0, caret).split("\n").length - 1;
  const kept: string[] = [];
  let removedBeforeCaret = 0;
  let changed = false;
  let title: string | undefined;
  let number: string | undefined;
  text.split("\n").forEach((l, i) => {
    const m = i < caretLine ? metaOf(l) : null;
    if (m && (m.title || m.number)) {
      changed = true;
      if (m.title) title = m.title;
      if (m.number) number = m.number;
      removedBeforeCaret += l.length + 1;
      return;
    }
    kept.push(l);
  });
  if (!changed) return { text, caret };
  return { text: kept.join("\n"), caret: Math.max(0, caret - removedBeforeCaret), title, number };
}

// Bulk add: each song starts with a "Title, ..." line, optionally followed by "Number, ...".
export interface ParsedSong { title: string; number: string; lyrics: string }
export function parseBulk(text: string): ParsedSong[] {
  const out: { title: string; number: string; lines: string[] }[] = [];
  let cur: { title: string; number: string; lines: string[] } | null = null;
  for (const line of text.replace(/\r/g, "").split("\n")) {
    const t = line.match(/^\s*title\s*[,:]\s*(.+?)\s*$/i);
    const n = line.match(/^\s*number\s*[,:#]?\s*#?\s*(.+?)\s*$/i);
    if (t) { cur = { title: t[1], number: "", lines: [] }; out.push(cur); }
    else if (cur && n && !cur.number && !cur.lines.some((l) => l.trim())) cur.number = n[1];
    else if (cur) cur.lines.push(line);
  }
  return out
    .map((s) => ({ title: s.title, number: s.number, lyrics: s.lines.join("\n").trim() }))
    .filter((s) => s.lyrics);
}

// Recommended background and text colour combinations (they read clearly from the back of a room)
export const COLOR_PRESETS: { name: string; bg: string; fg: string; num: string }[] = [
  { name: "Navy and cream", bg: "#213648", fg: "#F5F2EA", num: "#F2C14E" },
  { name: "Black and white", bg: "#000000", fg: "#FFFFFF", num: "#FFC857" },
  { name: "Charcoal and white", bg: "#1E1E1E", fg: "#FFFFFF", num: "#7FD1B9" },
  { name: "Deep green and cream", bg: "#0F3B2E", fg: "#F4F1DE", num: "#E9B44C" },
  { name: "Deep blue and gold", bg: "#0B2545", fg: "#FFD166", num: "#7EC8E3" },
  { name: "Maroon and white", bg: "#5C1A1B", fg: "#F7F3EA", num: "#F6C6A8" },
  { name: "Cream and dark", bg: "#F4F1DE", fg: "#1D2A36", num: "#B5452D" },
  { name: "White and navy", bg: "#FFFFFF", fg: "#1B2A41", num: "#C2410C" },
];

// Scripture slides: one text block that wraps at word boundaries, with 10 px padding (about 8 pt on the
// 960 pt slide) and a band at the bottom for the reference.
export const SCRIPTURE_PAD_PT = 8;
export const SCRIPTURE_REF_BAND_PT = 60;
export const SCRIPTURE_BOX_W = SLIDE_W_PT - 2 * SCRIPTURE_PAD_PT;
export const SCRIPTURE_BOX_H = SLIDE_W_PT * (SLIDE_H_IN / SLIDE_W_IN) - 2 * SCRIPTURE_PAD_PT - SCRIPTURE_REF_BAND_PT;

// How many lines the text takes when whole words wrap at the box width (Infinity if a word is too wide)
export function wrappedLineCount(text: string, font: string, size: number, boxW: number): number {
  const widthOf = (t: string) => visLen(t) * CHAR_W[font] * 1.02 * size;
  let lines = 0;
  let cur = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (widthOf(word) > boxW) return Infinity;
    const next = cur ? `${cur} ${word}` : word;
    if (cur && widthOf(next) > boxW) { lines++; cur = word; } else cur = next;
  }
  return cur ? lines + 1 : 0;
}

// The largest font size (up to maxPt) at which the wrapped text fits the block height
export function fitScripture(text: string, font: string, maxPt: number): number {
  for (let s = Math.floor(maxPt); s >= MIN_PT; s--) {
    if (wrappedLineCount(text, font, s, SCRIPTURE_BOX_W) * s * LINE_H <= SCRIPTURE_BOX_H) return s;
  }
  return MIN_PT;
}

// The largest font size (up to maxPt) at which the text wraps to at most maxLines visible lines and fits the
// block height. 0 when no size works. Used to split a passage so each slide shows the chosen number of lines.
export function fitForLines(text: string, font: string, maxLines: number, maxPt: number, manualPt = 0): number {
  const sizes = manualPt > 0 ? [manualPt] : Array.from({ length: Math.floor(maxPt) - MIN_PT + 1 }, (_, k) => Math.floor(maxPt) - k);
  for (const s of sizes) {
    const n = wrappedLineCount(text, font, s, SCRIPTURE_BOX_W);
    if (n <= maxLines && n * s * LINE_H <= SCRIPTURE_BOX_H) return s;
  }
  return 0;
}

// Width of text in pt at a font size (the browser measures it)
export type Measure = (text: string, size: number) => number;
export const plainText = (t: string) => t.replace(MARKER_RE, "");

// Automatic size for a passage: the largest size (up to cap) at which every word fits the width.
// The size is the same for the whole passage; it is never reduced for a single slide.
export function passageAutoSize(words: string[], font: string, cap: number, measure?: Measure): number {
  const widthOf = (w: string, s: number) => (measure ? measure(plainText(w), s) : visLen(w) * CHAR_W[font] * 1.02 * s);
  for (let s = Math.floor(cap); s >= MIN_PT; s--) {
    if (words.every((w) => widthOf(w, s) <= SCRIPTURE_BOX_W)) return s;
  }
  return MIN_PT;
}

// Lay out words in order at one font size: whole words per line, as many lines per slide as the height allows.
// Returns the lines of each slide. Words wider than the box are placed alone and listed in tooWide (a warning).
export function layoutPassage(words: string[], font: string, size: number, boxW: number, boxH: number, measure?: Measure): { slides: string[][]; tooWide: string[] } {
  // The browser measures the real text when it can; the estimate is the fallback
  const widthOf = (t: string) => (measure ? measure(plainText(t), size) : visLen(t) * CHAR_W[font] * 1.02 * size);
  // A little extra room per line for the superscript verse numbers, so the last line never runs off the slide
  // Keep a 3% margin: the browser draws text a little wider than the measure, so a line that is exactly full would wrap early
  const limit = boxW * 0.97;
  const capacity = Math.max(1, Math.floor(boxH / (size * LINE_H * 1.06)));
  const lines: string[] = [];
  const tooWide: string[] = [];
  let cur = "";
  for (const w of words) {
    if (widthOf(w) > limit) {
      tooWide.push(w);
      if (cur) { lines.push(cur); cur = ""; }
      lines.push(w);
      continue;
    }
    const next = cur ? `${cur} ${w}` : w;
    if (cur && widthOf(next) > limit) { lines.push(cur); cur = w; } else cur = next;
  }
  if (cur) lines.push(cur);
  const slides: string[][] = [];
  for (let i = 0; i < lines.length; i += capacity) slides.push(lines.slice(i, i + capacity));
  return { slides, tooWide };
}

// Padding inside every slide's text area: 10 px on the 1219 px wide projector, written as a share of the
// width so the projector and the previews show the same space around the text.
export const SLIDE_PAD = "0.8%";

// The browser measures text with the same font the slide uses, so line breaks match what is shown
export function browserMeasure(font: string): Measure | undefined {
  if (typeof document === "undefined") return undefined;
  const ctx = document.createElement("canvas").getContext("2d");
  if (!ctx) return undefined;
  return (text, size) => {
    ctx.font = `700 100px "${font}", sans-serif`;
    return (ctx.measureText(text).width * size) / 100;
  };
}
