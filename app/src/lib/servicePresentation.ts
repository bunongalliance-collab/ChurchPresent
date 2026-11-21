// The service presentation: slides built from the Program's order of worship, in the Program's order.
// It reads the Program, songs, readings and scriptures; it stores nothing of its own, so the Program stays the one source.
// Pure functions (no storage or network), so they are easy to test. The page loads the data and passes it in.
import { buildDeck, CHAR_W, LYRIC_PAD, LYRIC_PAD_CSS, SLIDE_H_PT, SLIDE_PAD, SLIDE_W_PT, plainText, visLen, type Measure } from "./slides";
import { STAGES } from "./programPdf";
import { subKind, type Line, type Lines } from "./orderLines";
import type { ProjSlide } from "../pages/Projector";

export interface SongData { id: string; title: string; number: string; lyrics: string; look?: { bg?: string; fg?: string; font?: string; customSize?: number } }
export interface ProgramInput { church: string; service: string; date: string; leader: string; announcements: string[]; lines: Lines }
export interface Resources {
  songs: Record<string, SongData>;                       // saved songs by id
  songIdForLabel: (label: string) => string | undefined; // a song typed by hand, matched to a saved song by "number. title"
  readings: Record<string, ProjSlide[]>;                 // the slides of a recent reading, by its id
  studies: Record<string, ProjSlide[]>;                  // the slides of a saved scripture study, by its id
}
export interface BuildOptions { font: string; bg: string; fg: string; measureFor?: (font: string) => Measure | undefined }
export interface OutlineEntry { stage: number; item: string; detail: string; first: number; count: number; warnings: string[] }
export interface ServiceDeck { slides: ProjSlide[]; outline: OutlineEntry[]; warnings: string[] }

// ---------- Reading the Program's lines ----------
interface Sub { text: string; line: Line; persons: string[] }
interface ProgItem { stage: number; name: string; subs: Sub[]; persons: string[] }

// Item → sub-items (a song, passage or detail) → people. People under no sub-item belong to the item.
export function parseItems(lines: Lines): ProgItem[] {
  const out: ProgItem[] = [];
  STAGES.forEach((_, s) => {
    let item: ProgItem | null = null;
    let sub: Sub | null = null;
    for (const ln of lines[s] ?? []) {
      const text = ln.text.trim();
      if (ln.level === 0) {
        sub = null;
        item = text ? { stage: s, name: text, subs: [], persons: [] } : null;
        if (item) out.push(item);
      } else if (!item) {
        continue;
      } else if (ln.level === 1) {
        sub = text ? { text, line: ln, persons: [] } : null;
        if (sub) item.subs.push(sub);
      } else if (text) {
        (sub ? sub.persons : item.persons).push(text);
      }
    }
  });
  return out;
}

// ---------- Plain slides (title, details, names) ----------
type RowKind = "title" | "detail" | "name";
interface Row { text: string; kind: RowKind }
const SIZE_MAX = 76;
const SIZE_MIN = 44;
const LH = 1.2;

function mix(a: string, b: string, t: number): string {
  const part = (h: string, i: number) => parseInt(h.slice(1 + 2 * i, 3 + 2 * i), 16);
  return `#${[0, 1, 2].map((i) => Math.round(part(a, i) * (1 - t) + part(b, i) * t).toString(16).padStart(2, "0")).join("")}`;
}

// Slides for a block of rows, centred, at the biggest size at which they fit. When they cannot fit at the smallest
// comfortable size, the detail and name rows continue on more slides, and each keeps the title.
export function textSlides(rows: Row[], o: BuildOptions): ProjSlide[] {
  const measure = o.measureFor?.(o.font);
  const W = SLIDE_W_PT * (1 - 2 * LYRIC_PAD) * 0.985;
  const H = SLIDE_H_PT * (1 - 2 * LYRIC_PAD);
  const widthOf = (t: string, s: number) => (measure ? measure(plainText(t), s) : visLen(t) * (CHAR_W[o.font] ?? 0.5) * 1.05 * s);
  const rowsAt = (t: string, s: number) => {
    let n = 0;
    let cur = "";
    for (const w of t.split(/\s+/).filter(Boolean)) {
      const next = cur ? `${cur} ${w}` : w;
      if (cur && widthOf(next, s) > W) { n++; cur = w; } else cur = next;
    }
    return n + (cur ? 1 : 0) || 1;
  };
  const best = (rs: Row[], floor: number) => {
    for (let s = SIZE_MAX; s >= floor; s -= 2) if (rs.reduce((n, r) => n + rowsAt(r.text, s), 0) * s * LH <= H) return s;
    return 0;
  };
  const muted = mix(o.fg, o.bg, 0.3);
  const make = (rs: Row[], size: number): ProjSlide => ({
    label: "",
    rows: rs.map((r) => r.text),
    segs: rs.map((r) => [{
      text: r.text,
      f: r.kind === "title" ? { bold: true } : r.kind === "name" ? { bold: false, italic: true, color: muted } : { bold: false },
    }]),
    size, lineH: LH, pad: LYRIC_PAD_CSS,
  });
  if (best(rows, SIZE_MIN)) return [make(rows, best(rows, SIZE_MIN))];
  // Too much for one slide: chunk the body rows, repeating the title
  const head = rows.filter((r) => r.kind === "title");
  const body = rows.filter((r) => r.kind !== "title");
  const out: ProjSlide[] = [];
  let chunk: Row[] = [];
  const flush = () => {
    if (!chunk.length) return;
    const title = out.length ? head.map((h) => ({ ...h, text: `${h.text} (continued)` })) : head;
    const set = [...title, ...chunk];
    out.push(make(set, best(set, SIZE_MIN) || best(set, 28) || 28));
    chunk = [];
  };
  for (const r of body) {
    if (chunk.length && !best([...head, ...chunk, r], SIZE_MIN)) flush();
    chunk.push(r);
  }
  flush();
  return out.length ? out : [make(rows, 28)];
}

// ---------- Songs ----------
const songLabel = (number: string, title: string) => `${number ? `${number}. ` : ""}${title}`;

// A song's lyrics as slides, with the Lyric page's rules (70 pt, left-aligned, padded, split at verse boundaries)
function lyricSlides(song: SongData, o: BuildOptions): ProjSlide[] {
  const look = song.look ?? {};
  const font = look.font || o.font;
  const deck = buildDeck({
    lyrics: song.lyrics, font, perSlide: 4, removeRepeats: false, showTitle: false, songTitle: song.title, songNumber: song.number,
    customSize: look.customSize ?? 0, keepLines: true, fill: true, measure: o.measureFor?.(font),
  });
  return deck.slides.map((s) => ({
    label: s.label ?? "", rows: [...s], size: s.size, lineH: s.lineH,
    pad: s.left ? LYRIC_PAD_CSS : SLIDE_PAD,
    ...(s.left ? { align: "left" as const, top: !s.vcenter, lyric: true } : {}),
    ...(look.bg ? { bg: look.bg } : {}), ...(look.fg ? { fg: look.fg } : {}), ...(look.font ? { font: look.font } : {}),
  }));
}

function songItemSlides(it: ProgItem, r: Resources, o: BuildOptions, warn: string[]): ProjSlide[] {
  if (!it.subs.length) {
    warn.push("No song chosen yet.");
    return textSlides([{ text: it.name, kind: "title" }, ...it.persons.map((n): Row => ({ text: n, kind: "name" }))], o);
  }
  const choir = /choir/i.test(it.name) ? it.name : "";
  const out: ProjSlide[] = [];
  for (const sub of it.subs) {
    const id = sub.line.songId ?? r.songIdForLabel(sub.text);
    const song = id ? r.songs[id] : undefined;
    const names = sub.persons.length ? sub.persons : it.persons;
    const singer = choir && names.length ? `${choir}: ${names.join(" · ")}` : choir || names.join(" · ");
    const title = song ? songLabel(song.number, song.title) : sub.text;
    out.push(...textSlides([{ text: title, kind: "title" }, ...(singer ? [{ text: singer, kind: "name" as const }] : [])], o));
    if (!song) {
      warn.push(sub.line.songId
        ? `"${sub.text}" was chosen, but that saved song is no longer available, so its lyrics are missing. Choose it again in the Program.`
        : `"${sub.text}" does not match a saved song, so its lyrics are missing. Pick it from the list in the Program.`);
    } else if (!song.lyrics.trim()) warn.push(`"${title}" has no lyrics saved.`);
    else out.push(...lyricSlides(song, o));
  }
  return out;
}

// ---------- Scriptures and readings ----------
function passageItemSlides(it: ProgItem, store: Record<string, ProjSlide[]>, idOf: (l: Line) => string | undefined, what: string, o: BuildOptions, warn: string[]): ProjSlide[] {
  if (!it.subs.length) {
    warn.push(`No ${what} chosen yet.`);
    return textSlides([{ text: it.name, kind: "title" }, ...it.persons.map((n): Row => ({ text: n, kind: "name" }))], o);
  }
  const out: ProjSlide[] = [];
  for (const sub of it.subs) {
    const readers = sub.persons.length ? sub.persons : it.persons;
    out.push(...textSlides([
      { text: it.name, kind: "title" }, { text: sub.text, kind: "detail" },
      ...readers.map((n): Row => ({ text: `Read by ${n}`, kind: "name" })),
    ], o));
    const id = idOf(sub.line);
    const slides = id ? store[id] : undefined;
    if (slides?.length) out.push(...slides);
    else if (id) warn.push(`"${sub.text}" could not be loaded${what === "scripture" ? " (saved scriptures need the owner to be signed in)" : " (it is no longer in the recent readings)"}, so only its title is shown.`);
    else warn.push(`"${sub.text}" was typed, not chosen from the Recent ${what}s list, so only its title is shown.`);
  }
  return out;
}

// ---------- The whole service ----------
export function buildServiceDeck(p: ProgramInput, r: Resources, o: BuildOptions): ServiceDeck {
  const slides: ProjSlide[] = [];
  const outline: OutlineEntry[] = [];
  const warnings: string[] = [];
  const add = (stage: number, item: string, detail: string, made: ProjSlide[], warn: string[]) => {
    outline.push({ stage, item, detail, first: slides.length, count: made.length, warnings: warn });
    slides.push(...made);
    for (const w of warn) warnings.push(`${item}: ${w}`);
  };

  // Opening slide: the church, the service and the date
  let when = p.date;
  try { when = new Date(`${p.date}T12:00:00`).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" }).replace(/(\d{1,2},) (\d{4})/, "$1\u00a0$2"); } catch { /* keep the typed date */ }
  const opening: Row[] = [
    { text: p.church || "Order of Worship", kind: "title" },
    ...(p.service ? [{ text: p.service, kind: "detail" as const }] : []),
    ...(when ? [{ text: when, kind: "detail" as const }] : []),
    ...(p.leader.trim() ? [{ text: `Led by ${p.leader.trim()}`, kind: "name" as const }] : []),
  ];
  add(0, "Welcome", when, textSlides(opening, o), []);

  for (const it of parseItems(p.lines)) {
    const warn: string[] = [];
    const kind = subKind(it.name);
    let made: ProjSlide[];
    if (kind === "song") made = songItemSlides(it, r, o, warn);
    else if (kind === "scripture") made = passageItemSlides(it, r.studies, (l) => l.studyId, "scripture", o, warn);
    else if (kind === "reading") made = passageItemSlides(it, r.readings, (l) => l.readingId, "reading", o, warn);
    else {
      const rows: Row[] = [{ text: it.name, kind: "title" }];
      for (const sub of it.subs) {
        rows.push({ text: sub.text, kind: "detail" });
        for (const n of sub.persons) rows.push({ text: n, kind: "name" });
      }
      for (const n of it.persons) rows.push({ text: n, kind: "name" });
      made = textSlides(rows, o);
      // The Program's announcements follow the Announcements item
      const notes = p.announcements.map((a) => a.trim()).filter(Boolean);
      if (/announcement/i.test(it.name) && notes.length) made.push(...textSlides([{ text: "Announcements", kind: "title" }, ...notes.map((n): Row => ({ text: n, kind: "detail" }))], o));
    }
    const detail = it.subs.map((s) => s.text).join(" · ");
    add(it.stage, it.name, detail, made, warn);
  }
  return { slides, outline, warnings };
}
