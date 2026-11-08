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

// Average character width as a fraction of font size, per font (bold adds about 5%)
export const CHAR_W: Record<string, number> = { Arial: 0.53, Verdana: 0.6, Calibri: 0.49, Georgia: 0.56 };
export const FONTS = Object.keys(CHAR_W);

export interface Slide extends Array<string> {
  label?: string;
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
  "plõ mpro": "C", "plo mpro": "C",
};
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
export function splitLine(line: string): string[] {
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
export function buildSections(text: string, notes: Notes): Slide[] {
  const cleaned = notes.removeRepeats ? cleanRepeats(text.normalize("NFC"), notes) : text.normalize("NFC");
  const sections: Slide[] = [];
  const seen = new Set<string>();
  let cur: string[] = [];
  let curLabel = "";
  const flush = () => {
    if (cur.length) {
      const sec = Object.assign([...cur], { label: curLabel }) as Slide;
      const key = cur.join("|").toLowerCase();
      if (cur.length >= 2 && seen.has(key) && notes.removeRepeats) notes.repeats++;
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
    const lab = labelOf(line);
    if (lab) { flush(); curLabel = lab; continue; }
    if (!line) {
      if (cur.length) { flush(); curLabel = ""; }
      continue;
    }
    cur.push(...splitLine(line));
  }
  flush();
  return sections;
}

// One size for the whole deck, so every slide looks the same on the projector.
export function deckSize(slides: string[][], font: string, perSlide: number): number {
  let maxChars = 0;
  for (const s of slides) {
    for (const line of s) {
      for (const w of line.split(/\s+/)) maxChars = Math.max(maxChars, w.length);
    }
  }
  if (!maxChars) maxChars = 10;
  const widthPt = (USABLE_W * 72) / (CHAR_W[font] * 1.05 * maxChars);
  const heightPt = (USABLE_H * 72) / (perSlide * LINE_H);
  return Math.max(MIN_PT, Math.min(MAX_PT, Math.floor(Math.min(widthPt, heightPt))));
}

// Lay out one section as slides of up to perSlide rows. A section that fits stays on one slide.
export function packSection(sec: Slide, font: string, size: number, perSlide: number): Slide[] {
  const maxW = USABLE_W * 72;
  const widthOf = (t: string) => t.length * CHAR_W[font] * 1.05 * size;
  const rows: string[] = [];
  let cur = "";
  for (const phrase of sec) {
    for (const word of phrase.split(/\s+/).filter(Boolean)) {
      const next = cur ? `${cur} ${word}` : word;
      if (cur && widthOf(next) > maxW) {
        rows.push(cur);
        cur = word;
      } else {
        cur = next;
      }
    }
  }
  if (cur) rows.push(cur);
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
}): Deck {
  const notes: Notes = { repeats: 0, removeRepeats: opts.removeRepeats };
  const sections = buildSections(opts.lyrics, notes);
  const title = opts.songTitle.trim() || notes.title || "";
  const number = (opts.songNumber.trim() || notes.number || "").replace(/^#/, "");
  const titleLines = [title, number ? `#${number}` : ""].filter(Boolean);
  const titleSlide: Slide[] = titleLines.length && opts.showTitle ? [Object.assign(titleLines, {}) as Slide] : [];
  const all = [...titleSlide, ...sections];
  const size = opts.customSize > 0 ? opts.customSize : all.length ? deckSize(all, opts.font, opts.perSlide) : MAX_PT;
  const packed = sections.flatMap((sec) => packSection(sec, opts.font, size, opts.perSlide));
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
