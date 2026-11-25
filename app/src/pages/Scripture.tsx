import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { setTextSelection, VerseTextBox } from "../components/RichTextBox";
import { QUEUED_NOTE, newId, saveRow, NOTHING_CHANGED } from "../lib/outbox";
import { canDeleteWork, saveChurchId, useChurch } from "../lib/church";
import { GONE_NOTE, lostAccess, shownInChurch, useRecheck } from "../lib/access";
import { toast } from "../lib/toast";
import PptxGenJS from "pptxgenjs";
import type { Session } from "@supabase/supabase-js";
import { onAuthChange, supabase } from "../lib/supabase";
import SlideshowStrip from "../components/SlideshowStrip";
import { recordAdded } from "../lib/slideshowQueue";
import NavBar from "../components/NavBar";
import VisSwitch from "../components/VisSwitch";
import { buildDeck, COLOR_PRESETS, flowLines, layoutPassage, passageAutoSize, SCRIPTURE_BOX_H, SCRIPTURE_BOX_W, browserMeasure, FONTS, MARGIN_IN, RECOMMENDED_PT, SCRIPTURE_PAD_BOTTOM, SLIDE_PAD, SLIDE_H_IN, SLIDE_W_IN, USABLE_H } from "../lib/slides";
import { PROJECTOR_KEY, type ProjDeck, type SlideFmt } from "./Projector";
import { breakRow } from "../lib/pptx";
import { groupParagraphs, paragraphEnds, carryFormatting, carryFormattingSlides, carryLines, setColors, markVerses, setVerseMode, VERSE_SPLIT, contrastText, HIGHLIGHT_OPTIONS, parseRich, stripMarkers, TEXT_COLOR_OPTIONS, toggleMarker, type RichSeg } from "../lib/richtext";
import { fmtAt, markerToVisible, NO_FMT, tokenLenAt, visibleToMarker } from "../lib/richeditor";
import { DB_BIBLES, fetchDbBooks, fetchDbPassage, isDbBible } from "../lib/bible";
import { addForSlides, claimForSlides, passCode, readForSlides, releaseForSlides, watchForSlides, writeForSlides, type SlidePass } from "../lib/forSlides";
import { savedBook } from "../bible/data";
import { mayDiscard, studyDirty, useUnsaved } from "../lib/unsaved";

// ---------- Bible versions (YouVersion IDs). Kept in this browser; add or remove as needed. ----------
interface BibleVersion { id: string; name: string }
const DEFAULT_BIBLES: BibleVersion[] = [
  { id: "1657", name: "Bunong" },
  { id: "1638", name: "Vietnamese (VCB)" },
  { id: "3034", name: "English (BSB)" },
];
const BIBLES_KEY = "scriptureBibles";
const LOOK_KEY = "scriptureLookDefaults";
const SCRIPTURE_DRAFT = "scriptureDraft";

function loadBibles(): BibleVersion[] {
  try {
    const list = JSON.parse(localStorage.getItem(BIBLES_KEY) || "null");
    if (Array.isArray(list) && list.length) return list.filter((b) => /^\d+$/.test(String(b.id)));
  } catch { /* use defaults */ }
  return DEFAULT_BIBLES;
}

// Book codes are the same in every language, so the book list works with any version
const BOOKS: [string, string][] = [
  ["Genesis", "GEN"], ["Exodus", "EXO"], ["Leviticus", "LEV"], ["Numbers", "NUM"], ["Deuteronomy", "DEU"],
  ["Joshua", "JOS"], ["Judges", "JDG"], ["Ruth", "RUT"], ["1 Samuel", "1SA"], ["2 Samuel", "2SA"],
  ["1 Kings", "1KI"], ["2 Kings", "2KI"], ["1 Chronicles", "1CH"], ["2 Chronicles", "2CH"], ["Ezra", "EZR"],
  ["Nehemiah", "NEH"], ["Esther", "EST"], ["Job", "JOB"], ["Psalms", "PSA"], ["Proverbs", "PRO"],
  ["Ecclesiastes", "ECC"], ["Song of Songs", "SNG"], ["Isaiah", "ISA"], ["Jeremiah", "JER"], ["Lamentations", "LAM"],
  ["Ezekiel", "EZK"], ["Daniel", "DAN"], ["Hosea", "HOS"], ["Joel", "JOL"], ["Amos", "AMO"], ["Obadiah", "OBA"],
  ["Jonah", "JON"], ["Micah", "MIC"], ["Nahum", "NAM"], ["Habakkuk", "HAB"], ["Zephaniah", "ZEP"],
  ["Haggai", "HAG"], ["Zechariah", "ZEC"], ["Malachi", "MAL"], ["Matthew", "MAT"], ["Mark", "MRK"],
  ["Luke", "LUK"], ["John", "JHN"], ["Acts", "ACT"], ["Romans", "ROM"], ["1 Corinthians", "1CO"],
  ["2 Corinthians", "2CO"], ["Galatians", "GAL"], ["Ephesians", "EPH"], ["Philippians", "PHP"],
  ["Colossians", "COL"], ["1 Thessalonians", "1TH"], ["2 Thessalonians", "2TH"], ["1 Timothy", "1TI"],
  ["2 Timothy", "2TI"], ["Titus", "TIT"], ["Philemon", "PHM"], ["Hebrews", "HEB"], ["James", "JAS"],
  ["1 Peter", "1PE"], ["2 Peter", "2PE"], ["1 John", "1JN"], ["2 John", "2JN"], ["3 John", "3JN"],
  ["Jude", "JUD"], ["Revelation", "REV"],
];
const bookName = (code: string) => BOOKS.find(([, c]) => c === code)?.[0] ?? code;

// Typed reference, e.g. "John 3:16-18" (English book names)
function parseTyped(text: string) {
  const m = text.trim().match(/^(.+?)\s+(\d+)(?::(\d+)(?:\s*[-–]\s*(\d+))?)?$/);
  if (!m) return null;
  const book = BOOKS.find(([n]) => n.toLowerCase() === m[1].toLowerCase().replace(/\s+/g, " "));
  if (!book) return null;
  const ch = parseInt(m[2], 10);
  const v1 = m[3] ? parseInt(m[3], 10) : 1;
  const v2 = m[4] ? parseInt(m[4], 10) : v1;
  return v2 >= v1 ? { code: book[1], ch, v1, v2 } : null;
}

// ---------- Study model ----------
type Kind = "passage" | "custom" | "questions";
interface StudySlide {
  id: string;
  kind: Kind;
  title: string;       // label on the slide (passage reference, or a custom title)
  bible?: string;      // passage: version used
  book?: string;       // passage: book code
  chapter?: string;
  verseFrom?: string;
  verseTo?: string;
  text: string;        // one line per row
  fetchedText?: string; // the text as it was last fetched; used to tell whether it was edited by hand
  fmt?: SlideFormat;      // bold, italic, underline and text colour for this slide
}
interface Look {
  font: string;
  perSlide: number;
  aspect: "16:9" | "4:3";
  bg: string;
  fg: string;
  verseNumbers: boolean;
  showLabels: boolean;
  verseNewLines: boolean; // each verse starts on its own line
  numColor: string;    // verse numbers
  labelColor: string;  // slide titles and labels
  customSize: number;  // font size in pt; 0 = automatic
  align: "left" | "center" | "right" | "justify"; // text alignment on every slide
}
interface StudyData extends Look { slides: StudySlide[] }
interface SavedStudy { id: string; title: string; reference: string; data: StudyData; owner?: string; church?: string; private?: boolean }   // private: Only me (supabase/plans-only-me.sql)

const DEFAULT_LOOK: Look = {
  font: "Arial", perSlide: 4, aspect: "16:9", bg: "#213648", fg: "#f5f2ea", verseNumbers: true, showLabels: false, verseNewLines: false,
  numColor: "#f2c14e", labelColor: "#f2c14e", customSize: 0, align: "left",
};
const uid = () => Math.random().toString(36).slice(2, 10);

function newSlide(kind: Kind): StudySlide {
  return {
    id: uid(), kind, text: "",
    title: kind === "passage" ? "" : kind === "questions" ? "Questions" : "Custom slide",
  };
}

// Passages sent from the Bunong Bible reader (/nau-brah-ndu-ngoi/), e.g. /scripture/?add=bunong-vn:EXO.3.1-3,EXO.3.6
// The translation is one of our database Bibles; the text is fetched from the database when they are added.
interface Incoming { bible: string; code: string; ch: number; v1: number; v2: number }
function readIncoming(): Incoming[] {
  const raw = new URLSearchParams(window.location.search).get("add");
  if (!raw) return [];
  const at = raw.indexOf(":");
  const tr = at > 0 ? raw.slice(0, at) : "bunong-vn";
  if (!/^[a-z0-9-]{2,40}$/.test(tr)) return [];
  const out: Incoming[] = [];
  for (const part of raw.slice(at + 1).split(",").slice(0, 50)) {
    const m = /^([1-3]?[A-Z]{2,3})\.(\d{1,3})\.(\d{1,3})(?:-(\d{1,3}))?$/.exec(part.trim());
    if (!m) continue;
    const v1 = +m[3], v2 = Math.max(v1, +(m[4] || m[3]));
    out.push({ bible: `db:${tr}`, code: m[1], ch: +m[2], v1, v2 });
  }
  return out;
}

const fromShared = (p: SlidePass): Incoming => ({ bible: `db:${p.t}`, code: p.b, ch: p.c, v1: p.v1, v2: p.v2 });
const toShared = (r: Incoming): SlidePass => ({ t: r.bible.replace(/^db:/, ""), b: r.code, c: r.ch, v1: r.v1, v2: r.v2 });

// One verse from the Vercel function (or the Vite dev stand-in). The key stays on the server.
async function fetchVerse(bible: string, code: string, ch: number, v: number): Promise<string> {
  const path = `v1/bibles/${encodeURIComponent(bible)}/passages/${code}.${ch}.${v}`;
  let r: Response;
  try {
    r = await fetch(`/api/yv?path=${encodeURIComponent(path)}`);
  } catch {
    // Offline and never fetched before: a verse is only kept after it has been opened online
    throw new Error("Offline: this verse has not been opened on this device yet. Open it once while online.");
  }
  if (r.status === 404) throw new Error("Verse not found. Check the book, chapter and verse.");
  if (!r.ok) throw new Error(`Bible service returned ${r.status}.`);
  const j = (await r.json()) as { content?: string };
  return (j.content || "").replace(/\s+/g, " ").trim();
}

// Rows for the projector and the .pptx, using the shared engine for passage and custom text
// A slide's own format: text formatting, plus its font size (pt) and background colour
type SlideFormat = SlideFmt & { size?: number; bg?: string; numColor?: string };
export interface OutSlide { label: string; ref?: string; rows: string[]; wrap?: boolean; verse: boolean; align?: "left" | "center" | "right" | "justify"; fmt?: SlideFormat; bg?: string; fg?: string; font?: string; size?: number; numColor?: string; segs?: RichSeg[][] }


export function buildOutput(slides: StudySlide[], look: Look): { size: number; slides: OutSlide[]; warnings: string[] } {
  const warnings: string[] = [];
  const all = slides.filter((s) => s.text.trim()).map((s) => s.text).join("\n");
  // Automatic size never goes above the recommended size
  const size = look.customSize > 0 ? look.customSize : all ? Math.min(RECOMMENDED_PT, buildDeck({
    lyrics: all, font: look.font, perSlide: look.perSlide, removeRepeats: false,
    showTitle: false, songTitle: "", songNumber: "", customSize: 0,
  }).size) : RECOMMENDED_PT;
  const pieces: OutSlide[] = [];
  for (const sl of slides) {
    const lines = carryFormatting(sl.text.split("\n").filter((l) => l.trim()));
    if (!lines.length) continue;
    if (sl.kind === "passage") {
      // One font size for the whole passage. Words wrap at word boundaries; the space decides how many lines fit.
      const marked = lines.map((l) => markVerses(l, look.verseNumbers));
      const words = marked.join(" ").split(/\s+/).filter(Boolean);
      const manual = sl.fmt?.size || look.customSize;
      const measure = browserMeasure(look.font);
      const size = manual > 0 ? manual : passageAutoSize(words, look.font, RECOMMENDED_PT, measure);
      const { slides: laid, tooWide } = layoutPassage(words, look.font, size, SCRIPTURE_BOX_W, SCRIPTURE_BOX_H, measure);
      tooWide.forEach((w) => warnings.push(`A word is too wide for the slide at ${size} pt: “${w.replace(/[\u0001-\u0003]/g, "")}”. Reduce the font size.`));
      laid.forEach((rows) => pieces.push({
        label: sl.title,
        ref: sl.title, // the passage reference, shown in the band at the bottom of every slide of the passage
        rows,
        verse: true, segs: rows.map((r) => parseRich(r)), fmt: sl.fmt, bg: sl.fmt?.bg ?? look.bg, fg: sl.fmt?.color ?? look.fg, font: look.font, size, numColor: sl.fmt?.numColor ?? look.numColor,
      }));
    } else {
      const markedLines = lines.map((l) => markVerses(l, look.verseNumbers));
      // Custom slides keep their line breaks, but wrap and flow onto extra slides when too long
      const flowSize = sl.fmt?.size || size;
      for (const rows of carryFormattingSlides(flowLines(markedLines, look.font, flowSize))) {
        pieces.push({ label: sl.title, rows, verse: true, segs: rows.map((l) => parseRich(l)), fmt: sl.fmt, bg: sl.fmt?.bg ?? look.bg, fg: sl.fmt?.color ?? look.fg, font: look.font, size: sl.fmt?.size, numColor: sl.fmt?.numColor ?? look.numColor });
      }
    }
  }
  return { size, slides: pieces.map((p) => ({ ...p, label: look.showLabels ? p.label : "", align: look.align })), warnings };
}

// Flex alignment for a column of rows, matching the text alignment
const alignItemsOf = (a: Look["align"]) => (a === "justify" ? "stretch" : a === "left" ? "flex-start" : a === "right" ? "flex-end" : "center");

// Draws the rows of a slide: verse numbers in their own size and colour, formatted text as formatted
function renderRows(rows: RichSeg[][], numColor: string, vnumClass: string, align: Look["align"] = "left") {
  const ends = paragraphEnds(rows.map((line) => line.map((s) => s.text).join("")));
  const rowNode = (line: RichSeg[], ri: number) => (
    <span key={ri} className="sc-row-line">
      {line.map((seg, k) =>
        seg.text.split(VERSE_SPLIT).map((part, j) => {
          if (!part) return null;
          if (j % 2) return <span key={`${k}-${j}`} className={vnumClass} style={{ color: numColor }}>{part} </span>;
          return (
            <span key={`${k}-${j}`} style={{ fontWeight: seg.bold ? 700 : undefined, fontStyle: seg.italic ? "italic" : undefined, textDecoration: seg.underline ? "underline" : undefined, color: seg.color, backgroundColor: seg.highlight }}>
              {j ? part.replace(/^ /, "") : part}
            </span>
          );
        })
      )}
    </span>
  );
  if (align !== "justify") return rows.map((line, ri) => rowNode(line, ri));
  // Justified: each paragraph (verse) is one block, so the browser wraps it and fills the full width
  return groupParagraphs(ends).map((grp, gi) => (
    <div key={`p${gi}`} className="sc-para" style={{ textAlign: "justify" }}>
      {grp.map((ri, k) => <span key={ri}>{k > 0 ? " " : null}{rowNode(rows[ri], ri)}</span>)}
    </div>
  ));
}

export default function Scripture() {
  // Study
  // The unsaved study is kept for this browser tab, so moving to another page keeps it
  const draft = useMemo(() => {
    try { return JSON.parse(sessionStorage.getItem(SCRIPTURE_DRAFT) || "null"); } catch { return null; }
  }, []);
  const [title, setTitle] = useState<string>(draft?.title ?? "Scripture study");
  const [slides, setSlides] = useState<StudySlide[]>(draft?.slides ?? []);
  // The look settings are remembered in this browser, so your colours become the defaults
  const [look, setLook] = useState<Look>(() => {
    try { return { ...DEFAULT_LOOK, ...JSON.parse(localStorage.getItem(LOOK_KEY) || "{}") }; } catch { return DEFAULT_LOOK; }
  });
  useEffect(() => {
    try { localStorage.setItem(LOOK_KEY, JSON.stringify(look)); } catch { /* storage blocked */ }
  }, [look]);
  const [selectedId, setSelectedId] = useState<string>(draft?.selectedId ?? "");
  const [currentId, setCurrentId] = useState<string>(draft?.currentId ?? "");
  const [currentOwner, setCurrentOwner] = useState<string>(draft?.currentOwner ?? "");   // who made the open study
  useEffect(() => {
    try { sessionStorage.setItem(SCRIPTURE_DRAFT, JSON.stringify({ title, slides, selectedId, currentId, currentOwner })); } catch { /* storage blocked */ }
  }, [title, slides, selectedId, currentId, currentOwner]);
  const [previewIndex, setPreviewIndex] = useState(0);

  // Saved studies and account
  const [saved, setSaved] = useState<SavedStudy[]>([]);
  const [session, setSession] = useState<Session | null>(null);
  const [authEmail, setAuthEmail] = useState("");
  const [authPass, setAuthPass] = useState("");

  // Bible versions
  const [bibles, setBibles] = useState<BibleVersion[]>(loadBibles);
  const [showBibles, setShowBibles] = useState(false);
  const [newBibleId, setNewBibleId] = useState("");
  const [newBibleName, setNewBibleName] = useState("");
  // Book codes each version actually has, fetched from YouVersion (null = not loaded or failed: show all books)
  // Each book's code and its name in that version's language (null = not loaded or failed: show all books in English)
  const [bookCodes, setBookCodes] = useState<Record<string, { code: string; title: string }[] | null>>({});

  // Feedback
  const [, setStatus] = useState("");
  const [, setError] = useState(false);
  const [busy, setBusy] = useState(false);

  const say = (m: string, e = false) => { setStatus(m); setError(e); toast(m, e); };

  // Passages from the Bible reader wait in a list shared with it (lib/forSlides), so they show here however this page is
  // opened. A link with ?add= puts its passages in that list too, and is then removed from the address.
  const [incoming, setIncoming] = useState<Incoming[]>(() => {
    // From the link and from storage, without doubles. Where storage is not shared or not saved (an iPhone home-screen
    // app, private browsing), the link alone still brings them.
    const fromLink = readIncoming();
    const { list } = addForSlides(fromLink.map(toShared));
    return list.map(fromShared);
  });
  const [laterIncoming, setLaterIncoming] = useState(false);   // "Later": hide the banner; the passages keep waiting
  useEffect(() => {
    const u = new URL(window.location.href);
    if (!u.searchParams.has("add")) return;
    u.searchParams.delete("add");
    window.history.replaceState(null, "", u.pathname + u.search + u.hash);
  }, []);
  // The banner shows the translation's own book names (e.g. "Nau Ngluh") once they are loaded
  const [incomingNames, setIncomingNames] = useState<Record<string, string>>({});
  const incomingBibles = [...new Set(incoming.map((r) => r.bible))].join(",");
  useEffect(() => {
    for (const b of incomingBibles.split(",").filter(Boolean)) {
      if (Object.keys(incomingNames).some((k) => k.startsWith(`${b}|`))) continue;
      fetchDbBooks(b).then((list) => setIncomingNames((cur) => ({ ...cur, ...Object.fromEntries(list.map((x) => [`${b}|${x.code}`, x.title])) }))).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incomingBibles]);
  // When the study has nothing in it yet, add the passages straight away; otherwise the banner asks first.
  // Checked when the page opens and whenever the list changes (another tab, or coming back to this page).
  const slidesRef = useRef(slides); slidesRef.current = slides;
  const addingRef = useRef(false);
  const autoAdd = (list: Incoming[]) => {
    if (!list.length || addingRef.current) return;
    if (slidesRef.current.every((x) => !x.text.trim()) && claimForSlides()) addIncoming(false, list);
  };
  useEffect(() => {
    autoAdd(incoming);
    return watchForSlides((list) => { const inc = list.map(fromShared); setIncoming(inc); if (inc.length) setLaterIncoming(false); autoAdd(inc); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // The first words of the first passage, so people recognise what they picked
  const [incomingPeek, setIncomingPeek] = useState("");
  const firstIncoming = incoming[0] ? passCode(toShared(incoming[0])) : "";
  useEffect(() => {
    const r = incoming[0];
    if (!r) { setIncomingPeek(""); return; }
    let live = true;
    fetchDbPassage(r.bible, r.code, r.ch, r.v1, r.v1).then((rows) => { if (live) setIncomingPeek((rows[0]?.text ?? "").split(/\s+/).slice(0, 10).join(" ")); }).catch(() => {});
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstIncoming]);
  // Slides just added from the Bible: tinted for a few seconds, with a "New" tag, and the first one scrolled into view
  const [newIds, setNewIds] = useState<string[]>([]);
  useEffect(() => {
    if (!newIds.length) return;
    const el = document.querySelector(".sc-item.sc-new");
    el?.scrollIntoView({ block: "nearest", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    const t = window.setTimeout(() => setNewIds([]), 6000);
    return () => window.clearTimeout(t);
  }, [newIds]);
  const incomingLabel = (r: Incoming) => `${incomingNames[`${r.bible}|${r.code}`] || bookName(r.code)} ${r.ch}:${r.v1}${r.v2 > r.v1 ? `-${r.v2}` : ""}`;

  const [pickColor, setPickColor] = useState("#ff5050");
  const [pickHighlight, setPickHighlight] = useState("#fff176");
  // The selection inside the text box, as stored-text offsets
  const [sel, setSel] = useState({ start: 0, end: 0 });
  const onSelect = useCallback((start: number, end: number) => setSel({ start, end }), []);
  // The formatting at the selection, so the B / I / U buttons show whether they are on
  // Formatting at the start of the selection (markers right at the start count as inside it)
  const activeNow = () => {
    if (!selected) return NO_FMT;
    let at = sel.start;
    if (sel.end > sel.start) while (at < sel.end && tokenLenAt(selected.text, at)) at += tokenLenAt(selected.text, at);
    return fmtAt(selected.text, at);
  };

  // Applies a text colour or a highlight to the selected text only. Choosing the colour that is
  // already there removes it (a toggle). An earlier colour in the selection is replaced.
  function applyColorHex(hex: string, kind: "text" | "highlight") {
    if (!selected) return;
    const { start: a, end: b } = sel;
    if (a === b) { say("Select the text in the text box first, then choose a colour.", true); return; }
    // Pressing the colour the selection already has removes it
    const lo = hex.replace("#", "").toLowerCase();
    let first = a;
    while (first < b && tokenLenAt(selected.text, first)) first += tokenLenAt(selected.text, first);
    const cur = fmtAt(selected.text, first)[kind === "text" ? "c" : "h"]?.replace("#", "").toLowerCase();
    const off = cur === lo;
    // A highlight comes with a text colour that reads clearly on it
    const r = kind === "text"
      ? setColors(selected.text, a, b, { c: off ? null : hex })
      : setColors(selected.text, a, b, off ? { h: null, c: null } : { h: hex, c: contrastText(hex) });
    if (!r) return;
    update(selected.id, { text: r.text });
    requestAnimationFrame(() => { const el = document.getElementById("sc-text"); if (el) setTextSelection(el, r.text, r.start, r.end); });
  }
  function applyColor() { applyColorHex(pickColor, "text"); }
  function applyHighlight() { applyColorHex(pickHighlight, "highlight"); }
  // Removes the formatting markers from the selected text (or from all of it when nothing is selected)
  function clearMarkers() {
    if (!selected) return;
    const hasSel = sel.start !== sel.end;
    const from = hasSel ? sel.start : 0;
    const to = hasSel ? sel.end : selected.text.length;
    update(selected.id, { text: selected.text.slice(0, from) + stripMarkers(selected.text.slice(from, to)) + selected.text.slice(to) });
  }
  // Bold, italic or underline only the selected text; the button shows whether it is on
  function applyMarker(token: string) {
    if (!selected) return;
    if (sel.start === sel.end) { say("Select the text in the text box first, then press B, I or U.", true); return; }
    const t = toggleMarker(selected.text, sel.start, sel.end, token);
    if (!t) return;
    // a selection over several lines: each line gets its own markers, so the text box shows them all
    const text = carryLines(t.text);
    const r = { text, start: visibleToMarker(text, markerToVisible(t.text, t.start)), end: visibleToMarker(text, markerToVisible(t.text, t.end)) };
    update(selected.id, { text: r.text });
    requestAnimationFrame(() => { const el = document.getElementById("sc-text"); if (el) setTextSelection(el, r.text, r.start, r.end); });
  }
  // Normal text / Match verse number on the selected text; pressing it again goes back to automatic
  function applyVerseMode(mode: "v" | "n") {
    if (!selected) return;
    if (sel.start === sel.end) { say("Select the text in the text box first.", true); return; }
    const r = setVerseMode(selected.text, sel.start, sel.end, mode);
    if (!r) return;
    update(selected.id, { text: r.text });
    requestAnimationFrame(() => { const el = document.getElementById("sc-text"); if (el) setTextSelection(el, r.text, r.start, r.end); });
  }
  const user = session?.user ?? null;
  const selected = slides.find((s) => s.id === selectedId) ?? null;

  // Versions to choose from: the Bibles in our own database first, then the YouVersion list (editable)
  const versions = [...DB_BIBLES, ...bibles];
  // A passage with no version picked yet uses the first one (Bunong, Vietnam)
  const defaultBible = versions[0]?.id;
  // The books this Bible version has (from YouVersion, or from our database), so the Book list only offers real choices
  const bibleForBooks = selected ? (selected.bible || defaultBible) : undefined;
  useEffect(() => {
    if (!bibleForBooks || bibleForBooks in bookCodes) return;
    let cancelled = false;
    (async () => {
      try {
        if (isDbBible(bibleForBooks)) {
          const books = await fetchDbBooks(bibleForBooks);
          if (!cancelled) setBookCodes((cur) => ({ ...cur, [bibleForBooks]: books.length ? books : null }));
          return;
        }
        const path = `v1/bibles/${encodeURIComponent(bibleForBooks)}/books`;
        const r = await fetch(`/api/yv?path=${encodeURIComponent(path)}`);
        if (!r.ok) throw new Error(String(r.status));
        const j = (await r.json()) as { data?: { id?: string; title?: string }[] };
        const books = (j.data ?? [])
          .filter((b): b is { id: string; title?: string } => typeof b.id === "string" && b.id.length > 0)
          .map((b) => ({ code: b.id, title: (b.title ?? "").trim() }));
        if (!cancelled) setBookCodes((cur) => ({ ...cur, [bibleForBooks]: books.length ? books : null }));
      } catch {
        if (!cancelled) setBookCodes((cur) => ({ ...cur, [bibleForBooks]: null }));
      }
    })();
    return () => { cancelled = true; };
  }, [bibleForBooks, bookCodes]);
  const availableBooks = bibleForBooks ? bookCodes[bibleForBooks] ?? null : null;
  // Books in the version's own language when YouVersion gives the name; English otherwise
  const bookOptions: [string, string][] = availableBooks
    ? availableBooks.map((b) => [b.title || bookName(b.code), b.code] as [string, string])
    : BOOKS;
  const output = useMemo(() => buildOutput(slides, look), [slides, look]);
  // The preview follows the slide picked in the middle column; with nothing picked it shows the whole study
  const shown = useMemo(
    () => (selected ? buildOutput([selected], look).slides : output.slides),
    [selected, look, output],
  );

  // ---------- Account and saved studies ----------
  // Only me / Share with the team for the open study (only the person who made it can change this)
  const openSaved = saved.find((x) => x.id === currentId) ?? null;
  async function setStudyPrivate(on: boolean) {
    if (!supabase || !openSaved) return;
    const { data: hit, error: err } = await supabase.from("scripture_studies").update({ private: on }).eq("id", openSaved.id).select("id");
    if (!err && !hit?.length) { say(NOTHING_CHANGED, true); await loadSaved(); return; }
    if (err) { say(/private/.test(err.message) && /column/i.test(err.message) ? "Only me isn't switched on yet. Ask the person who looks after the app." : "That didn't work. Check the connection and try again.", true); return; }
    setSaved((cur) => cur.map((x) => (x.id === openSaved.id ? { ...x, private: on } : x)));
    say(on ? `"${openSaved.title}" is now only for you. Your team can't see it until you share it.` : `"${openSaved.title}" is shared with your team.`);
  }
  // The ids in the latest list read from the database, to notice when the open study is no longer shared
  const [fresh, setFresh] = useState<{ uid: string; ids: string[] } | null>(null);
  // quiet: a background re-read, which keeps the list shown if it fails
  async function loadSaved(quiet = false) {
    if (!supabase) return;
    const who = (await supabase.auth.getSession()).data.session?.user.id ?? "";
    // "private" exists once plans-only-me.sql is run; before that the list loads without it
    let res = await supabase.from("scripture_studies").select("id, study_title, reference, data, owner_id, church_id, private").order("updated_at", { ascending: false });
    if (res.error && /private/.test(res.error.message)) res = await supabase.from("scripture_studies").select("id, study_title, reference, data, owner_id, church_id").order("updated_at", { ascending: false }) as typeof res;
    if (res.error) { if (!quiet) say("Could not load saved studies: " + res.error.message, true); return; }
    setSaved((res.data || []).map((r) => ({ id: r.id, title: r.study_title, reference: r.reference, data: r.data as StudyData, owner: r.owner_id ?? "", church: r.church_id ?? "", private: !!(r as { private?: boolean }).private })));
    if (who) setFresh({ uid: who, ids: (res.data || []).map((r) => r.id) });
  }

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session) loadSaved();
    });
    const unsubAuth = onAuthChange((s) => {
      setSession(s);
      if (s) loadSaved(); else setSaved([]);
    });
    return unsubAuth;
    // loadSaved reads only, so subscribing once is enough
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useRecheck(() => void loadSaved(true), !!session);
  useEffect(() => {
    if (!fresh || !lostAccess(currentId, currentOwner, fresh.uid, fresh.ids)) return;
    resetStudy();
    toast(GONE_NOTE("study"), true);
    // Only when a new list arrives
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fresh]);

  async function authAction(kind: "in" | "up") {
    if (!supabase) return;
    if (!authEmail.trim() || authPass.length < 6) { say("Enter an email and a password of 6+ characters.", true); return; }
    const creds = { email: authEmail.trim(), password: authPass };
    const { data, error: err } = kind === "up" ? await supabase.auth.signUp(creds) : await supabase.auth.signInWithPassword(creds);
    if (err) { say(err.message, true); return; }
    if (kind === "up" && !data.session) say("Account created. Check your email to confirm, then sign in.");
    else setAuthPass("");
  }

  // Save: insert a new study, or update the open one. Shows the real result either way.
  // Returns the saved study's id, or null if nothing was saved
  async function save(): Promise<string | null> {
    if (!supabase) { say("Saving needs the Supabase settings in app/.env.local.", true); return null; }
    if (!user) { say("Sign in above to save studies to your account.", true); return null; }
    if (!title.trim()) { say("Give the study a title first.", true); return null; }
    const data: StudyData = { ...look, slides };
    const reference = slides.find((s) => s.kind === "passage" && s.title)?.title ?? "";
    const row = { study_title: title.trim(), reference, data };
    setBusy(true);
    const id = currentId || newId();
    const r = currentId
      ? await saveRow({ table: "scripture_studies", op: "update", id, data: row })
      : await saveRow({ table: "scripture_studies", op: "insert", id, data: { ...row, owner_id: user.id, church_id: saveChurchId() } });
    setBusy(false);
    if (r.status === "error") { say("Could not save: " + r.message, true); void loadSaved(true); return null; }
    if (!currentId) setCurrentOwner(user.id);
    setCurrentId(id);
    if (r.status === "queued") { say(QUEUED_NOTE); return id; }
    await loadSaved();
    say(`Saved "${title.trim()}".`);
    return id;
  }

  // Save the study, then open the Presentation Builder, where it is at the top of Recent scriptures.
  // The presentation takes the study's name.
  // Stays on this page: the study is saved, listed in Recent scriptures in the Builder, and shown in Your slideshow
  const [addedStudies, setAddedStudies] = useState<{ id: string; label: string }[]>([]);
  const [justAdded, setJustAdded] = useState(false);
  async function addToPresentation() {
    const id = await save();
    if (!id) return;
    try { if (title.trim()) sessionStorage.setItem("pendingBuilderTitle", title.trim()); } catch { /* blocked */ }
    setAddedStudies((cur) => [...cur.filter((x) => x.id !== id), { id, label: title.trim() || "Scripture study" }]);
    recordAdded({ id, kind: "scripture", label: title.trim() || "Scripture study" });
    setJustAdded(true);
    window.setTimeout(() => setJustAdded(false), 2500);
    say(`✓ Added "${title.trim() || "Scripture study"}" to the presentation. Open the Presentation Builder to arrange it.`);
  }

  // Favourite and recently used studies (this browser). Search covers the title, the reference and the passage labels.
  const SC_FAV_KEY = "scriptureFavorites";
  const SC_RECENT_KEY = "scriptureRecent";
  const [scFavorites, setScFavorites] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(SC_FAV_KEY) || "[]"); } catch { return []; }
  });
  const [scRecent, setScRecent] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(SC_RECENT_KEY) || "[]"); } catch { return []; }
  });
  const [studyQuery, setStudyQuery] = useState("");
  const moreRef = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const close = (e: PointerEvent) => {
      const d = moreRef.current;
      if (d?.open && !d.contains(e.target as Node)) d.open = false;
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);
  useEffect(() => { try { localStorage.setItem(SC_FAV_KEY, JSON.stringify(scFavorites)); } catch { /* blocked */ } }, [scFavorites]);
  useEffect(() => { try { localStorage.setItem(SC_RECENT_KEY, JSON.stringify(scRecent)); } catch { /* blocked */ } }, [scRecent]);

  // The lists show the chosen church's studies
  const church = useChurch();
  const listed = saved.filter((st) => shownInChurch(st.church, church.current?.id));
  const sq = studyQuery.trim().toLowerCase();
  const studyMatches = sq
    ? listed.filter((st) => `${st.title} ${st.reference} ${st.data.slides.map((x) => x.title).join(" ")}`.toLowerCase().includes(sq))
    : [];
  const studyFavs = listed.filter((st) => scFavorites.includes(st.id));
  const studyRecent = scRecent.map((id) => listed.find((st) => st.id === id)).filter((st): st is SavedStudy => !!st);

  function toggleStudyFavorite() {
    if (!currentId) return;
    setScFavorites((cur) => (cur.includes(currentId) ? cur.filter((x) => x !== currentId) : [...cur, currentId]));
  }

  // Before the study on the page is replaced: ask when it holds changes that aren't saved
  function dirty(): boolean {
    const open = saved.find((x) => x.id === currentId);
    const { slides: was, ...rest } = open?.data ?? { slides: [] };
    return studyDirty(open ? { title: open.title, slides: was, look: { ...DEFAULT_LOOK, ...rest } } : null, { title, slides, look });
  }
  const studyName = title === "Scripture study" ? "" : title;   // the starting name says nothing
  const mayLeave = () => mayDiscard(dirty(), "study", studyName);
  // For the warning when the tab is closed (unknown while the open study's saved copy hasn't loaded)
  useUnsaved("study", currentId && !saved.length ? null : dirty(), studyName);
  async function onSave() { await save(); }

  function openStudy(id: string) {
    if (id !== currentId && !mayLeave()) return;
    setScRecent((cur) => [id, ...cur.filter((x) => x !== id)].slice(0, 8));
    const s = saved.find((x) => x.id === id);
    if (!s) return;
    const { slides: ss, ...rest } = s.data;
    setCurrentId(s.id);
    setCurrentOwner(s.owner ?? "");
    setTitle(s.title);
    setLook({ ...DEFAULT_LOOK, ...rest });
    setSlides(ss || []);
    setSelectedId("");
    setPreviewIndex(0);
    say(`Opened "${s.title}".`);
  }

  // A passage's verses: from the database, or when that fails (offline) from the Bunong Bible reader's saved copy of the book
  async function passageRows(r: Incoming) {
    try { return await fetchDbPassage(r.bible, r.code, r.ch, r.v1, r.v2); }
    catch (e) {
      const book = r.bible === "db:bunong-vn" ? await savedBook(r.code) : undefined;
      const vs = (book?.chapters[r.ch]?.verses ?? []).filter((v) => (v.end ?? v.v) >= r.v1 && v.v <= r.v2);
      if (!vs.length) throw e;
      return vs.map((v) => ({ verse: v.v, verseEnd: v.end, text: v.text }));
    }
  }

  // Add the passages from the Bible reader as passage slides, with their text fetched from the database
  async function addIncoming(fresh: boolean, list: Incoming[] = incoming) {
    if (addingRef.current) return;
    addingRef.current = true;
    setBusy(true);
    say("Adding passages…");
    const made: StudySlide[] = [];
    const added = new Set<string>();
    let failed = 0;
    const names: Record<string, { code: string; title: string }[] | null> = {};
    for (const r of list) {
      try {
        if (!(r.bible in names)) names[r.bible] = bookCodes[r.bible] ?? await fetchDbBooks(r.bible).catch(() => null);
        const rows = await passageRows(r);
        const lines = rows.map((x) => { const num = x.verseEnd ? `${x.verse}-${x.verseEnd}` : String(x.verse); return look.verseNumbers ? `${num} ${x.text}` : x.text; });
        const bookLabel = names[r.bible]?.find((b) => b.code === r.code)?.title || bookName(r.code);
        made.push({
          ...newSlide("passage"), title: `${bookLabel} ${r.ch}:${r.v1}${r.v2 > r.v1 ? `-${r.v2}` : ""}`,
          bible: r.bible, book: r.code, chapter: String(r.ch), verseFrom: String(r.v1), verseTo: String(r.v2),
          text: lines.join("\n"), fetchedText: lines.join("\n"),
        });
        added.add(passCode(toShared(r)));
      } catch { failed++; }
    }
    // Added passages leave the shared list; any that failed stay, so they can be tried again
    writeForSlides(readForSlides().filter((p) => !added.has(passCode(p))));
    setIncoming(readForSlides().map(fromShared));
    addingRef.current = false;
    releaseForSlides();
    setBusy(false);
    if (fresh) { setCurrentId(""); setTitle("Scripture study"); setPreviewIndex(0); }
    // An empty passage slide (the one a new study starts with) is replaced
    setSlides((cur) => [...(fresh ? [] : cur.filter((x) => !(x.kind === "passage" && !x.text.trim()))), ...made]);
    if (made[0]) { setSelectedId(made[0].id); setNewIds(made.map((x) => x.id)); }
    if (!made.length) say("The passages could not be loaded. Check the connection and try again.", true);
    else say(`Added ${made.length} passage slide${made.length === 1 ? "" : "s"}${failed ? `; ${failed} could not be loaded` : ""}.`, failed > 0);
  }

  function newStudy() {
    if (mayLeave()) resetStudy();
  }
  function resetStudy() {
    setCurrentId(""); setTitle("Scripture study"); setSlides([]); setSelectedId(""); setPreviewIndex(0);
    say("New study. Add a slide to start.");
  }

  function duplicateStudy() {
    setCurrentId("");
    setTitle(`${title} (copy)`);
    say("Copy ready. Press Save to keep it as a new study.");
  }

  async function deleteStudy() {
    if (!currentId) { newStudy(); return; }
    if (!supabase || !user) { say("Sign in to delete saved studies.", true); return; }
    if (!window.confirm(`Delete "${title}"? This cannot be undone.`)) return;
    const r = await saveRow({ table: "scripture_studies", op: "delete", id: currentId });
    if (r.status === "error") { say("Could not delete: " + r.message, true); return; }
    if (r.status === "sent") await loadSaved();
    resetStudy();
    say(r.status === "queued" ? QUEUED_NOTE : "Study deleted.");
  }

  // ---------- Slide list ----------
  function addSlide(kind: Kind) {
    const s = newSlide(kind);
    setSlides((cur) => [...cur, s]);
    setSelectedId(s.id);
  }
  // Opening the page with no saved draft adds a passage slide, the same as pressing + Passage
  const openedPassage = useRef(false);
  useEffect(() => {
    if (openedPassage.current || draft) return;
    openedPassage.current = true;
    addSlide("passage");
  }, [draft]);
  function update(id: string, patch: Partial<StudySlide>) {
    setSlides((cur) => cur.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }
  function move(id: string, dir: -1 | 1) {
    setSlides((cur) => {
      const i = cur.findIndex((s) => s.id === id), j = i + dir;
      if (i < 0 || j < 0 || j >= cur.length) return cur;
      const next = cur.slice();
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }
  // Drag and drop in the slide list: dropAt is the position the dragged slide goes before
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);
  function moveTo(id: string, at: number) {
    setSlides((cur) => {
      const i = cur.findIndex((s) => s.id === id);
      if (i < 0) return cur;
      const next = cur.slice();
      const [it] = next.splice(i, 1);
      next.splice(at > i ? at - 1 : at, 0, it);
      return next;
    });
  }
  function duplicateSlide(id: string) {
    setSlides((cur) => {
      const i = cur.findIndex((s) => s.id === id);
      if (i < 0) return cur;
      return [...cur.slice(0, i + 1), { ...cur[i], id: uid() }, ...cur.slice(i + 1)];
    });
  }
  function removeSlide(id: string) {
    setSlides((cur) => cur.filter((s) => s.id !== id));
    if (selectedId === id) setSelectedId("");
  }

  // ---------- Fetch ----------
  async function fetchPassage() {
    if (!selected || selected.kind !== "passage") return;
    const picked = selected.book && selected.chapter && selected.verseFrom
      ? { code: selected.book, ch: parseInt(selected.chapter, 10), v1: parseInt(selected.verseFrom, 10), v2: parseInt(selected.verseTo || selected.verseFrom, 10) }
      : null;
    const ref = picked && picked.v2 >= picked.v1 && picked.ch > 0 ? picked : parseTyped(selected.title);
    if (!ref) { say("Choose a book, chapter and verse first.", true); return; }
    const bible = selected.bible || defaultBible;
    if (!bible) { say("Add a Bible version first.", true); return; }
    setBusy(true);
    say("Fetching…");
    try {
      const lines: string[] = [];
      if (isDbBible(bible)) {
        // Our own database: the whole range in one request; a verse printed as "14-15" keeps that number
        for (const r of await fetchDbPassage(bible, ref.code, ref.ch, ref.v1, ref.v2)) {
          const num = r.verseEnd ? `${r.verse}-${r.verseEnd}` : String(r.verse);
          lines.push(look.verseNumbers ? `${num} ${r.text}` : r.text);
        }
      } else {
        for (let v = ref.v1; v <= ref.v2; v++) {
          const verse = await fetchVerse(bible, ref.code, ref.ch, v);
          lines.push(look.verseNumbers ? `${v} ${verse}` : verse);
        }
      }
      // The label uses the book's name in this version's language (English if YouVersion's list is not loaded)
      const bookLabel = bookCodes[bible]?.find((b) => b.code === ref.code)?.title || bookName(ref.code);
      const label = `${bookLabel} ${ref.ch}:${ref.v1}${ref.v2 !== ref.v1 ? `-${ref.v2}` : ""}`;
      update(selected.id, {
        text: lines.join("\n"), fetchedText: lines.join("\n"), title: label, bible, book: ref.code,
        chapter: String(ref.ch), verseFrom: String(ref.v1), verseTo: String(ref.v2),
      });
      say(`Loaded ${lines.length} verse${lines.length === 1 ? "" : "s"}: ${label}.`);
    } catch (e) {
      say(e instanceof Error ? e.message : "Could not fetch the passage.", true);
    } finally {
      setBusy(false);
    }
  }

  // ---------- Bible versions ----------
  function saveBibles(list: BibleVersion[]) {
    setBibles(list);
    try { localStorage.setItem(BIBLES_KEY, JSON.stringify(list)); } catch { /* storage blocked */ }
  }
  function addBible() {
    const id = newBibleId.trim();
    if (!/^\d+$/.test(id)) { say("A Bible ID is a number, such as 1638.", true); return; }
    if (bibles.some((b) => b.id === id)) { say("That Bible is already in the list.", true); return; }
    saveBibles([...bibles, { id, name: newBibleName.trim() || `Bible ${id}` }]);
    setNewBibleId(""); setNewBibleName("");
    say("Bible version added.");
  }

  // ---------- Output ----------
  function present() {
    if (!output.slides.length) { say("Add some text to a slide first.", true); return; }
    const deck: ProjDeck = {
      font: look.font, size: output.size, bg: look.bg, fg: look.fg, showLabels: look.showLabels,
      numColor: look.numColor, labelColor: look.labelColor,
      slides: output.slides.map((s) => ({
        align: look.align,
        ref: s.ref, pad: s.ref ? SLIDE_PAD : undefined,
        label: s.label, rows: s.rows, verse: s.verse, fmt: s.fmt, bg: s.bg, fg: s.fg, numColor: s.numColor ?? look.numColor, size: s.size ?? output.size,
        segs: (s.segs ?? s.rows.map((r) => parseRich(r))).map((line) => line.map((seg) => ({
          text: seg.text,
          f: seg.bold || seg.italic || seg.underline || seg.color || seg.highlight ? { bold: seg.bold, italic: seg.italic, underline: seg.underline, color: seg.color, highlight: seg.highlight } : null,
        }))),
      })),
    };
    try { localStorage.setItem(PROJECTOR_KEY, JSON.stringify(deck)); } catch { /* storage blocked */ }
    window.open(`${import.meta.env.BASE_URL}#projector`, "_blank");
  }

  function downloadPptx() {
    if (!output.slides.length) return;
    const is43 = look.aspect === "4:3";
    const pptx = new PptxGenJS();
    pptx.layout = is43 ? "LAYOUT_4x3" : "LAYOUT_WIDE";
    pptx.title = title || "Scripture";
    const w = is43 ? 10 : SLIDE_W_IN;
    const h = is43 ? 7.5 : SLIDE_H_IN;
    const uh = is43 ? h - 2 * MARGIN_IN : USABLE_H;
    const hex = (c: string) => c.replace("#", "");
    for (const s of output.slides) {
      const sl = pptx.addSlide();
      sl.background = { color: hex(s.bg ?? look.bg) };
      if (s.label) {
        sl.addText(s.label, {
          x: w - MARGIN_IN - 3, y: h - MARGIN_IN - 0.5, w: 3, h: 0.5,
          fontFace: look.font, fontSize: 24, bold: true, color: hex(look.labelColor), align: "right", valign: "bottom", margin: 0,
        });
      }
      // Build text runs: verse numbers in their colour, the slide's formatting on the rest
      const runs: { text: string; options: Record<string, unknown> }[] = [];
      const base = {
        fontFace: look.font, fontSize: s.size ?? output.size, bold: s.fmt?.bold ?? true,
        italic: !!s.fmt?.italic, underline: s.fmt?.underline ? { style: "sng" } : undefined,
        color: hex(s.fmt?.color || look.fg),
      };
      const jEnds = s.align === "justify" ? paragraphEnds(s.rows ?? []) : null;
      (s.segs ?? s.rows.map((r) => parseRich(r))).forEach((line, ri, all) => {
        line.forEach((seg) => {
          seg.text.split(VERSE_SPLIT).forEach((part, k) => {
            if (!part) return;
            const isNum = !!s.verse && k % 2 === 1;
            runs.push({
              text: isNum ? `${part} ` : k ? part.replace(/^ /, "") : part,
              options: isNum
                ? { ...base, color: hex(s.numColor ?? look.numColor), fontSize: Math.round((s.size ?? output.size) * 0.5) }
                : { ...base, bold: seg.bold ?? base.bold, italic: seg.italic || base.italic, underline: seg.underline ? { style: "sng" } : base.underline, color: seg.color ? hex(seg.color) : base.color, ...(seg.highlight ? { highlight: hex(seg.highlight) } : {}) },
            });
          });
        });
        if (ri < all.length - 1) breakRow(runs, jEnds?.[ri] ?? true);
      });
      // The passage reference, bottom-right, on every slide of the passage (kept clear of the text)
      if (s.ref) sl.addText(s.ref, { x: w - MARGIN_IN - 4.5, y: h - MARGIN_IN - 0.4, w: 4.5, h: 0.4, fontFace: look.font, fontSize: 14, color: hex(look.fg), transparency: 35, align: "right", valign: "bottom", margin: 0 });
      sl.addText(runs as never, {
        x: MARGIN_IN, y: MARGIN_IN, w: w - 2 * MARGIN_IN, h: s.ref ? uh - 0.5 : uh,
        align: look.align, valign: "middle", margin: 0, lineSpacingMultiple: 1.1, fit: "none",
      });
    }
    const safe = (title || "scripture").replace(/[^\w]+/g, "-").replace(/^-|-$/g, "").slice(0, 50) || "scripture";
    pptx.writeFile({ fileName: `${safe}.pptx` });
  }

  // ---------- Layout ----------
  const settingsSummary = `${look.aspect} · ${look.font} · ${look.customSize > 0 ? `${look.customSize} pt` : "Auto size"} · ${look.perSlide} lines per slide`;

  return (
    <>
      <NavBar />
      <div className="sc rl">
        <header className="sc-top">
          <div className="sc-title">
            <h1>Scripture Slides</h1>
          </div>
          {incoming.length > 0 && !laterIncoming && (
            <section className="sc-incoming" aria-labelledby="sc-incoming-hd">
              <span className="sc-incoming-ic" aria-hidden="true">
                <svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="12" rx="1.5" /><path d="M8 21h8M12 17v4M7 9h10M7 13h6" /></svg>
              </span>
              <div className="sc-incoming-txt">
                <div className="sc-incoming-hd" id="sc-incoming-hd">From the Bible <span className="sc-incoming-count">{incoming.length} passage{incoming.length === 1 ? "" : "s"}</span></div>
                <p className="sc-incoming-refs">{incoming.map(incomingLabel).join(" · ")}</p>
                {incomingPeek && <p className="sc-incoming-peek">“{incomingPeek}…</p>}
              </div>
              <div className="sc-incoming-btns">
                <button className="secondary" onClick={() => setLaterIncoming(true)} disabled={busy}>Later</button>
                <button className="secondary" onClick={() => { if (mayLeave()) void addIncoming(true); }} disabled={busy}>Start a new study</button>
                <button className="primary" onClick={() => addIncoming(false)} disabled={busy}>Add to this study</button>
              </div>
            </section>
          )}
          <SlideshowStrip inline extra={addedStudies.map((x) => ({ ...x, kind: "scripture" as const }))} />
          <div className="sc-actions">
            <input className="sc-search" type="search" value={studyQuery} onChange={(e) => setStudyQuery(e.target.value)} placeholder="Search studies" aria-label="Search saved studies" />
            <button className={`sc-star${currentId && scFavorites.includes(currentId) ? " on" : ""}`} onClick={toggleStudyFavorite} disabled={!currentId} aria-label="Favourite this study" aria-pressed={!!currentId && scFavorites.includes(currentId)} title="Favourite">★</button>
            <select value={currentId} onChange={(e) => (e.target.value ? openStudy(e.target.value) : newStudy())} aria-label="Open a saved study">
              <option value="">{listed.length ? "Saved studies…" : user ? "No saved studies" : "Sign in to see studies"}</option>
              {sq ? (
                <optgroup label={`Results (${studyMatches.length})`}>
                  {studyMatches.map((st) => <option key={st.id} value={st.id}>{st.title}</option>)}
                </optgroup>
              ) : (
                <>
                  {studyFavs.length > 0 && <optgroup label="Favourites">{studyFavs.map((st) => <option key={st.id} value={st.id}>{st.title}</option>)}</optgroup>}
                  {studyRecent.length > 0 && <optgroup label="Recently used">{studyRecent.map((st) => <option key={st.id} value={st.id}>{st.title}</option>)}</optgroup>}
                  <optgroup label="All studies">{listed.map((st) => <option key={st.id} value={st.id}>{st.title}{st.private ? " · Only me" : ""}</option>)}</optgroup>
                </>
              )}
            </select>
            <button className="secondary" onClick={newStudy}>New</button>
            <details className="sc-more" ref={moreRef}>
              <summary>More</summary>
              <div className="sc-menu">
                <button className="secondary" onClick={duplicateStudy} disabled={!currentId}>Duplicate</button>
                <button className="secondary danger" onClick={deleteStudy} disabled={!currentId || (!!openSaved && !canDeleteWork(openSaved))} title={openSaved && !canDeleteWork(openSaved) ? "Only the person who made it, or a church admin, can delete it" : undefined}>Delete</button>
              </div>
            </details>
            <button className="primary" onClick={present} disabled={!output.slides.length}>Present</button>
            <button className="secondary" onClick={downloadPptx} disabled={!output.slides.length}>Download .pptx</button>
          </div>
          {openSaved?.private && <p className="vis-note sc-vis-note">Only you can see this study. Your team sees it once you switch to Team.</p>}
        </header>

        {supabase && !user && (
          <form className="sc-signin" onSubmit={(e) => { e.preventDefault(); authAction("in"); }}>
            <div className="sc-signin-text">
              <strong>Sign in to save your studies</strong>
              <small>Your saved studies follow you to any device.</small>
            </div>
            <input type="email" placeholder="Email" autoComplete="email" aria-label="Email" value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} />
            <input type="password" placeholder="Password" autoComplete="current-password" aria-label="Password" value={authPass} onChange={(e) => setAuthPass(e.target.value)} />
            <button type="submit" className="primary">Sign in</button>
            <button type="button" className="sc-signin-link" onClick={() => authAction("up")}>Create account</button>
          </form>
        )}



        <div className="sc-body">
          {/* Edit the selected slide */}
          <section className="sc-col sc-edit" aria-label="Edit slide">
            <div className="lv2-step-head"><span className="lv2-step-n">2</span><h2>Check the words</h2>
              <button className="primary small step-save" onClick={() => void onSave()} disabled={busy}>Save Study</button>
              {openSaved && (
                <span className="sc-head-vis">
                  <VisSwitch isPrivate={!!openSaved.private} canChange={!!user && openSaved.owner === user.id}
                    what={openSaved.title || "this study"} onChange={(on) => void setStudyPrivate(on)} />
                </span>
              )}
            </div>
            {!selected && <p className="sc-empty">Pick a slide on the right to edit it, or add a new one.</p>}
            {selected?.kind === "passage" && (
              <>
                <details className="sc-version">
                  <summary>Bible version <span className="sc-version-now">{versions.find((b) => b.id === (selected.bible || defaultBible))?.name ?? ""}</span></summary>
                  <div className="sc-radios" role="radiogroup" aria-label="Bible version">
                    {versions.map((b) => (
                      <label key={b.id} className="sc-radio">
                        <input type="radio" name="bible" value={b.id} checked={(selected.bible || defaultBible) === b.id} onChange={() => update(selected.id, { bible: b.id })} />
                        {b.name}
                      </label>
                    ))}
                  </div>
                  <button className="link small" onClick={() => setShowBibles((v) => !v)}>{showBibles ? "Close versions" : "Manage versions"}</button>
                {showBibles && (
                  <div className="sc-box">
                    <ul className="bible-list">
                      {bibles.map((b) => (
                        <li key={b.id}>
                          <span>{b.name} <small>({b.id})</small></span>
                          <button className="secondary small" onClick={() => saveBibles(bibles.filter((x) => x.id !== b.id))}>Remove</button>
                        </li>
                      ))}
                    </ul>
                    <div className="grid2">
                      <input placeholder="Bible ID (number)" value={newBibleId} onChange={(e) => setNewBibleId(e.target.value)} />
                      <input placeholder="Name" value={newBibleName} onChange={(e) => setNewBibleName(e.target.value)} />
                    </div>
                    <button className="secondary small" onClick={addBible}>Add version</button>
                  </div>
                )}
                </details>

                <div className="sc-field">
                  <span className="sc-label">Passage</span>
                  <div className="passage-pick" onKeyDown={(e) => { if (e.key === "Enter" && !busy && (e.target as HTMLElement).matches("input, select")) { e.preventDefault(); fetchPassage(); } }}>
                    <select value={selected.book ?? ""} onChange={(e) => update(selected.id, { book: e.target.value })} aria-label="Book">
                      <option value="">Book…</option>
                      {bookOptions.map(([name, code]) => <option key={code} value={code}>{name}</option>)}
                      {availableBooks === null && bibleForBooks && bookCodes[bibleForBooks] === null && (
                        <option disabled value="">Book list unavailable for this version</option>
                      )}
                    </select>
                    <input type="number" min={1} value={selected.chapter ?? ""} placeholder="Chapter" aria-label="Chapter" onChange={(e) => update(selected.id, { chapter: e.target.value })} />
                    <input type="number" min={1} value={selected.verseFrom ?? ""} placeholder="From" aria-label="First verse" onChange={(e) => update(selected.id, { verseFrom: e.target.value })} />
                    <input type="number" min={1} value={selected.verseTo ?? ""} placeholder="To" aria-label="Last verse" onChange={(e) => update(selected.id, { verseTo: e.target.value })} />
                    <button className="fetch" onClick={fetchPassage} disabled={busy}>{busy ? "Fetching…" : "Fetch passage"}</button>
                  </div>
                </div>
              </>
            )}
            {selected && selected.kind !== "passage" && (
              <div className="sc-field">
                <label className="sc-label" htmlFor="sc-title">Slide title</label>
                <input id="sc-title" value={selected.title} onChange={(e) => update(selected.id, { title: e.target.value })} />
              </div>
            )}
            {selected && (
              <>
                <div className="sc-field">
                  <label className="sc-label" htmlFor="sc-text">Text (one verse or line per row)</label>
                  <VerseTextBox key={selected.id} id="sc-text" value={selected.text} onChange={(v) => update(selected.id, { text: v })} onSelect={onSelect} />
                </div>
                <div className="sc-format-dock cmp">
                <div className="sc-field">
                  <div className="rv2-line"><span className="lv2-field-label">Format</span><div className="rv2-row">
                  <div className="fmt-toolbar">
                    <button className={`tool${activeNow().b? " on" : ""}`} onClick={() => applyMarker("**")} aria-pressed={!!activeNow().b} aria-label="Bold selected text" title="Bold selected text"><b>B</b></button>
                    <button className={`tool${activeNow().i? " on" : ""}`} onClick={() => applyMarker("~~")} aria-pressed={!!activeNow().i} aria-label="Italic selected text" title="Italic selected text"><i>I</i></button>
                    <button className={`tool${activeNow().u? " on" : ""}`} onClick={() => applyMarker("__")} aria-pressed={!!activeNow().u} aria-label="Underline selected text" title="Underline selected text"><u>U</u></button>
                    <label className="tool-color" title="Text colour for the selected text">Text <input type="color" value={pickColor} onChange={(e) => { setPickColor(e.target.value); applyColorHex(e.target.value, "text"); }} /></label>
                    <button className="tool" onClick={applyColor} aria-label="Colour the selected text">Colour</button>
                    <label className="tool-color" title="Highlight colour for the selected text">Highlight <input type="color" value={pickHighlight} onChange={(e) => { setPickHighlight(e.target.value); applyColorHex(e.target.value, "highlight"); }} /></label>
                    <button className="tool" onClick={applyHighlight} aria-label="Highlight the selected text">Mark</button>
                    <button className={`tool${activeNow().n ? " on" : ""}`} onClick={() => applyVerseMode("n")} aria-pressed={!!activeNow().n} title="Show the selected text as normal text, not as a verse number">Normal</button>
                    <button className={`tool${activeNow().v ? " on" : ""}`} onClick={() => applyVerseMode("v")} aria-pressed={!!activeNow().v} title="Style the selected text like a verse number"><span className="vtb-num" style={{ verticalAlign: "0.3em" }}>1</span> Verse</button>
                    <button className="tool" onClick={clearMarkers} aria-label="Clear formatting of the selected text">Clear</button>
                    <label className="tool-color" title="Verse number colour">Verse no. <input type="color" value={selected.fmt?.numColor || look.numColor} onChange={(e) => update(selected.id, { fmt: { ...selected.fmt, numColor: e.target.value } })} /></label>
                    <span className="fmt-align" role="group" aria-label="Text alignment">
                      {([["left", "Left", "Align left"], ["center", "Ctr", "Align centre"], ["right", "Right", "Align right"], ["justify", "Just", "Justify"]] as const).map(([v, label, title]) => (
                        <button key={v} type="button" className={`tool${look.align === v ? " on" : ""}`} aria-pressed={look.align === v} title={title} aria-label={title} onClick={() => setLook({ ...look, align: v })}>{label}</button>
                      ))}
                    </span>
                    <button className="tool" onClick={() => update(selected.id, { fmt: undefined, text: stripMarkers(selected.text) })} title="Remove all formatting from this slide">Reset</button>
                  </div>
                  </div></div>
                  <div className="rv2-line"><span className="lv2-field-label">Colours</span><div className="rv2-row">
                  <div className="fmt-swatch-row">
                  <div className="fmt-swatches" aria-label="Ready-made text colours">
                    {TEXT_COLOR_OPTIONS.map((c) => (
                      <button key={c} type="button" className="swatch" title={`Text ${c}`} aria-label={`Text colour ${c}`} style={{ color: c }} onClick={() => applyColorHex(c, "text")}>A</button>
                    ))}
                  </div>
                  <div className="fmt-swatches" aria-label="Ready-made highlight colours">
                    {HIGHLIGHT_OPTIONS.map((c) => (
                      <button key={c} type="button" className="swatch swatch-bg" title={`Highlight ${c}`} aria-label={`Highlight colour ${c}`} style={{ background: c }} onClick={() => applyColorHex(c, "highlight")}>A</button>
                    ))}
                  </div>
                  </div>
                  </div></div>
                  <div className="rv2-line"><span className="lv2-field-label">Size</span><div className="rv2-row">
                  <div className="fmt-size rl-qsize">
                    <button type="button" className="rl-qb" aria-label="Smaller text" onClick={() => update(selected.id, { fmt: { ...selected.fmt, size: Math.max(20, (selected.fmt?.size ?? output.size) - 2) } })}>A−</button>
                    <input type="range" min={20} max={200} step={1} value={selected.fmt?.size ?? output.size} onChange={(e) => update(selected.id, { fmt: { ...selected.fmt, size: parseInt(e.target.value, 10) } })} aria-label="Font size for this slide" />
                    <button type="button" className="rl-qb" aria-label="Larger text" onClick={() => update(selected.id, { fmt: { ...selected.fmt, size: Math.min(200, (selected.fmt?.size ?? output.size) + 2) } })}>A+</button>
                    <output>{selected.fmt?.size ? `${selected.fmt.size} pt` : `Auto (${output.size} pt)`}</output>
                    <button className="tool" onClick={() => update(selected.id, { fmt: { ...selected.fmt, size: undefined } })} disabled={!selected.fmt?.size}>Auto</button>
                  </div>
                  </div></div>
                  <div className="rv2-line"><span className="lv2-field-label">Theme</span><div className="rv2-row">
                  <div className="fmt-presets" role="group" aria-label="Recommended colours for this slide">
                    {COLOR_PRESETS.map((p) => (
                      <button key={p.name} type="button" className={`sc-preset${selected.fmt?.bg === p.bg && selected.fmt?.color === p.fg ? " on" : ""}`} title={p.name} aria-label={p.name}
                        style={{ background: p.bg, color: p.fg }} onClick={() => update(selected.id, { fmt: { ...selected.fmt, bg: p.bg, color: p.fg, numColor: p.num } })}>Aa</button>
                    ))}
                  </div>
                  </div></div>
                </div>
                </div>
              </>
            )}
          </section>

          {/* The slide sequence */}
          <section className="sc-col sc-slides" aria-label="Slides">
            <div className="lv2-step-head"><span className="lv2-step-n">1</span><h2>Choose the slides</h2></div>
            <div className="sc-start">
              <span className="sc-start-tag">Start here</span>
              <div className="sc-add">
                <button className="secondary small" onClick={() => addSlide("passage")}>+ Passage</button>
                <button className="secondary small" onClick={() => addSlide("custom")}>+ Custom</button>
              </div>
            </div>
            <ol className="sc-list">
              {slides.map((s, i) => (
                <li
                  key={s.id}
                  className={`sc-item${selectedId === s.id ? " selected" : ""}${newIds.includes(s.id) ? " sc-new" : ""}${dragId === s.id ? " dragging" : ""}${dragId && dragId !== s.id && dropAt === i ? " drop-before" : ""}${dragId && dragId !== s.id && dropAt === i + 1 && i === slides.length - 1 ? " drop-after" : ""}`}
                  draggable
                  onDragStart={(e) => { setDragId(s.id); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", s.id); }}
                  onDragOver={(e) => {
                    if (!dragId) return;
                    e.preventDefault();
                    const box = e.currentTarget.getBoundingClientRect();
                    setDropAt(e.clientY < box.top + box.height / 2 ? i : i + 1);
                  }}
                  onDrop={(e) => { e.preventDefault(); if (dragId && dropAt !== null) moveTo(dragId, dropAt); setDragId(null); setDropAt(null); }}
                  onDragEnd={() => { setDragId(null); setDropAt(null); }}
                  title="Drag to reorder"
                >
                  <button className="sc-pick" onClick={() => setSelectedId(s.id)}>
                    <span className="sc-num">{i + 1}</span>
                    <span className="sc-pick-text">
                      <strong>{s.title || (s.kind === "passage" ? "Passage (not fetched)" : "Untitled")}</strong>
                      <small>{s.kind === "passage" ? "Passage" : s.kind === "questions" ? "Questions" : "Custom"}{newIds.includes(s.id) && <span className="sc-new-tag"> · New</span>}</small>
                    </span>
                  </button>
                  <span className="sc-arrows">
                    <button type="button" className="sc-arrow" onClick={() => move(s.id, -1)} disabled={i === 0} aria-label={`Move slide ${i + 1} up`} title="Move up">▲</button>
                    <button type="button" className="sc-arrow" onClick={() => move(s.id, 1)} disabled={i === slides.length - 1} aria-label={`Move slide ${i + 1} down`} title="Move down">▼</button>
                  </span>
                  <details className="sc-dots">
                    <summary aria-label="Slide actions">⋯</summary>
                    <div className="sc-menu">
                      <button className="secondary small" onClick={() => move(s.id, -1)} disabled={i === 0}>Move up</button>
                      <button className="secondary small" onClick={() => move(s.id, 1)} disabled={i === slides.length - 1}>Move down</button>
                      <button className="secondary small" onClick={() => duplicateSlide(s.id)}>Copy</button>
                      <button className="secondary small danger" onClick={() => removeSlide(s.id)}>Remove</button>
                    </div>
                  </details>
                </li>
              ))}
            </ol>
            {!slides.length && <p className="sc-empty">No slides yet. Add a passage, custom or questions slide.</p>}
          </section>

          {/* The finished slides, several cards at once. Click a card to select that slide. */}
          <section className="sc-col sc-preview" aria-label="Preview">
            {/* The study name and Add to Presentation share the heading's row */}
            <div className="lv2-step-head sc-preview-head">
              <span className="lv2-step-n">3</span><h2>Preview the slides</h2>
              <div className="sc-pres-add sc-pres-inline">
                <label className="sc-footer-name">
                  <span className="sr-only">Study name</span>
                  <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Study name" />
                </label>
                <button className={`primary${justAdded ? " flash" : ""}`} onClick={addToPresentation} disabled={busy || !user}>{justAdded ? "✓ Added" : "+ Add to Presentation"}</button>
              </div>
            </div>
            {shown.length ? (
              <>
                {(() => {
                  const cur = shown[Math.min(previewIndex, shown.length - 1)];
                  return (
                    <div className={`sc-big${look.aspect === "4:3" ? " ratio-43" : ""}${cur.ref ? " sc-passage" : ""}`} style={{ background: cur.bg ?? look.bg, color: cur.fg ?? look.fg, fontFamily: `${cur.font ?? look.font}, sans-serif` }}>
                      <div className="sc-big-text" style={{ textAlign: look.align, padding: SLIDE_PAD, ...(cur.ref ? { paddingBottom: SCRIPTURE_PAD_BOTTOM } : {}), fontSize: `${((cur.size ?? output.size) / 960) * 100}cqw` }}>
                        {renderRows(cur.segs ?? cur.rows.map((r) => parseRich(r)), cur.numColor ?? look.numColor, "sc-big-vnum", look.align)}
                      </div>
                      {cur.label && look.showLabels && <div className="sc-big-tag" style={{ color: look.labelColor }}>{cur.label}</div>}
                      {cur.ref && <div className="sc-big-ref">{cur.ref}</div>}
                    </div>
                  );
                })()}
                <div className="sc-cards">
                  {shown.map((sl, i) => (
                    <button
                      key={i}
                      type="button"
                      className={`sc-card${Math.min(previewIndex, shown.length - 1) === i ? " current" : ""}${look.aspect === "4:3" ? " ratio-43" : ""}${sl.ref ? " sc-passage" : ""}`}
                      style={{ background: sl.bg ?? look.bg, color: sl.fg ?? look.fg, fontFamily: `${sl.font ?? look.font}, sans-serif` }}
                      onClick={() => setPreviewIndex(i)}
                      aria-label={`Slide ${i + 1}`}
                    >
                      <span className="sc-card-num">{i + 1}</span>
                      <span className="sc-card-text" style={{ alignItems: alignItemsOf(look.align), textAlign: look.align, ...(sl.ref ? { padding: SLIDE_PAD, paddingBottom: SCRIPTURE_PAD_BOTTOM } : {}), fontSize: `${((sl.size ?? output.size) / 960) * 100}cqw` }}>
                        {renderRows(sl.segs ?? sl.rows.map((r) => parseRich(r)), sl.numColor ?? look.numColor, "sc-card-vnum", look.align)}
                      </span>
                      {sl.label && <span className="sc-card-tag" style={{ color: look.labelColor }}>{sl.label}</span>}
                      {sl.ref && <span className="sc-card-ref">{sl.ref}</span>}
                    </button>
                  ))}
                </div>
                <div className="sc-nav">
                  <button className="secondary small" onClick={() => setPreviewIndex((i) => Math.max(0, i - 1))} disabled={previewIndex === 0}>← Previous</button>
                  <span className="sc-counter">{Math.min(previewIndex, shown.length - 1) + 1} / {shown.length}</span>
                  <button className="secondary small" onClick={() => setPreviewIndex((i) => Math.min(shown.length - 1, i + 1))} disabled={previewIndex >= shown.length - 1}>Next →</button>
                </div>
              </>
            ) : <p className="sc-empty">Nothing to preview yet.</p>}

            {/* Presentation settings: the look for this study */}
            <details className="sc-presentation">
                <summary>Presentation Settings <span className="sc-summary">{settingsSummary}</span></summary>
                {output.warnings.length > 0 && <p className="sc-warn" role="alert">{output.warnings[0]}{output.warnings.length > 1 ? ` (${output.warnings.length - 1} more)` : ""}</p>}
                <div className="sc-settings">
                  <div className="sc-group">
                    <h3>Layout</h3>
                    <label htmlFor="sc-align">Text alignment</label>
                    <select id="sc-align" value={look.align} onChange={(e) => setLook({ ...look, align: e.target.value as Look["align"] })}>
                      <option value="left">Left</option>
                      <option value="center">Centre</option>
                      <option value="right">Right</option>
                      <option value="justify">Justify</option>
                    </select>
                    <label htmlFor="sc-aspect">Shape</label>
                    <select id="sc-aspect" value={look.aspect} onChange={(e) => setLook({ ...look, aspect: e.target.value as "16:9" | "4:3" })}>
                      <option value="16:9">16:9 widescreen</option>
                      <option value="4:3">4:3</option>
                    </select>
                  </div>
                  <div className="sc-group">
                    <h3>Typography</h3>
                    <label htmlFor="sc-font">Font</label>
                    <select id="sc-font" value={look.font} onChange={(e) => setLook({ ...look, font: e.target.value })}>
                      {FONTS.map((f) => <option key={f} value={f}>{f}</option>)}
                    </select>
                    <div className="sc-size-row">
                      <label htmlFor="sc-size">Font size (pt)</label>
                      <input id="sc-size" type="number" min={20} max={200} placeholder="Auto" value={look.customSize || ""} onChange={(e) => setLook({ ...look, customSize: parseInt(e.target.value, 10) || 0 })} />
                      <button type="button" className="tool" onClick={() => setLook({ ...look, customSize: 0 })} disabled={!look.customSize}>Auto</button>
                      <button type="button" className="tool" onClick={() => setLook({ ...look, customSize: RECOMMENDED_PT })}>Recommended {RECOMMENDED_PT} pt</button>
                    </div>
                  </div>
                  <div className="sc-group">
                    <h3>Colors</h3>
                    <div className="sc-presets" role="group" aria-label="Recommended colours">
                      {COLOR_PRESETS.map((p) => (
                        <button key={p.name} type="button" className={`sc-preset${look.bg === p.bg && look.fg === p.fg ? " on" : ""}`} title={p.name} aria-label={p.name}
                          style={{ background: p.bg, color: p.fg }} onClick={() => setLook({ ...look, bg: p.bg, fg: p.fg })}>Aa</button>
                      ))}
                    </div>
                    <div className="sc-colors">
                      <label>Background <input type="color" value={look.bg} onChange={(e) => setLook({ ...look, bg: e.target.value })} /></label>
                      <label>Text <input type="color" value={look.fg} onChange={(e) => setLook({ ...look, fg: e.target.value })} /></label>
                      <label>Verse number <input type="color" value={look.numColor} onChange={(e) => setLook({ ...look, numColor: e.target.value })} /></label>
                      <label>Title <input type="color" value={look.labelColor} onChange={(e) => setLook({ ...look, labelColor: e.target.value })} /></label>
                    </div>
                  </div>
                  <div className="sc-group">
                    <h3>Display</h3>
                    <label className="check"><input type="checkbox" checked={look.verseNumbers} onChange={(e) => setLook({ ...look, verseNumbers: e.target.checked })} /> Show verse numbers</label>
                    <label className="check"><input type="checkbox" checked={look.showLabels} onChange={(e) => setLook({ ...look, showLabels: e.target.checked })} /> Show slide labels</label>
                    <label className="check" title="Each verse starts on its own line, so its last line can stay short"><input type="checkbox" checked={look.verseNewLines} onChange={(e) => setLook({ ...look, verseNewLines: e.target.checked })} /> Each verse on its own line</label>
                  </div>
                </div>
              </details>
          </section>
        </div>
      </div>
    </>
  );
}
