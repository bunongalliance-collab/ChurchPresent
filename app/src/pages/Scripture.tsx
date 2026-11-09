import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import PptxGenJS from "pptxgenjs";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import NavBar from "../components/NavBar";
import { buildDeck, COLOR_PRESETS, flowLines, FONTS, MARGIN_IN, SLIDE_H_IN, SLIDE_W_IN, USABLE_H } from "../lib/slides";
import { PROJECTOR_KEY, type ProjDeck, type SlideFmt } from "./Projector";
import { carryFormatting, carryFormattingSlides, carryLines, setColors, markVerses, setVerseMode, VERSE_SPLIT, contrastText, HIGHLIGHT_OPTIONS, parseRich, stripMarkers, TEXT_COLOR_OPTIONS, toggleMarker, type RichSeg } from "../lib/richtext";
import { editorHtml, editorToText, fmtAt, markerToVisible, NO_FMT, spaceVerseNumbers, tokenLenAt, visibleToMarker } from "../lib/richeditor";

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
  numColor: string;    // verse numbers
  labelColor: string;  // slide titles and labels
  customSize: number;  // font size in pt; 0 = automatic
}
interface StudyData extends Look { slides: StudySlide[] }
interface SavedStudy { id: string; title: string; reference: string; data: StudyData }

const DEFAULT_LOOK: Look = {
  font: "Arial", perSlide: 4, aspect: "16:9", bg: "#213648", fg: "#f5f2ea", verseNumbers: true, showLabels: false,
  numColor: "#f2c14e", labelColor: "#f2c14e", customSize: 0,
};
const uid = () => Math.random().toString(36).slice(2, 10);

function newSlide(kind: Kind): StudySlide {
  return {
    id: uid(), kind, text: "",
    title: kind === "passage" ? "" : kind === "questions" ? "Questions" : "Custom slide",
  };
}

// One verse from the Vercel function (or the Vite dev stand-in). The key stays on the server.
async function fetchVerse(bible: string, code: string, ch: number, v: number): Promise<string> {
  const path = `v1/bibles/${encodeURIComponent(bible)}/passages/${code}.${ch}.${v}`;
  const r = await fetch(`/api/yv?path=${encodeURIComponent(path)}`);
  if (r.status === 404) throw new Error("Verse not found. Check the book, chapter and verse.");
  if (!r.ok) throw new Error(`Bible service returned ${r.status}.`);
  const j = (await r.json()) as { content?: string };
  return (j.content || "").replace(/\s+/g, " ").trim();
}

// Rows for the projector and the .pptx, using the shared engine for passage and custom text
// A slide's own format: text formatting, plus its font size (pt) and background colour
type SlideFormat = SlideFmt & { size?: number; bg?: string; numColor?: string };
export interface OutSlide { label: string; rows: string[]; verse: boolean; fmt?: SlideFormat; bg?: string; fg?: string; font?: string; size?: number; numColor?: string; segs?: RichSeg[][] }

export function buildOutput(slides: StudySlide[], look: Look): { size: number; slides: OutSlide[] } {
  const all = slides.filter((s) => s.text.trim()).map((s) => s.text).join("\n");
  const size = look.customSize > 0 ? look.customSize : all ? buildDeck({
    lyrics: all, font: look.font, perSlide: look.perSlide, removeRepeats: false,
    showTitle: false, songTitle: "", songNumber: "", customSize: 0,
  }).size : 84;
  const pieces: OutSlide[] = [];
  for (const sl of slides) {
    const lines = carryFormatting(sl.text.split("\n").filter((l) => l.trim()));
    if (!lines.length) continue;
    if (sl.kind === "passage") {
      // Mark a leading verse number so it can take the verse-number colour
      // Mark each verse number before the engine splits the text, so the marker survives
      // wherever the number lands (even in the middle of a row where two verses share it)
      const marked = lines.map((l) => markVerses(l, look.verseNumbers));
      const deck = buildDeck({
        lyrics: marked.join("\n"), font: look.font, perSlide: look.perSlide, removeRepeats: false,
        showTitle: false, songTitle: "", songNumber: "", customSize: sl.fmt?.size || look.customSize || 0,
      });
      // Mark each verse number at the start of a row, so it can be drawn smaller and in its own colour
      carryFormattingSlides(deck.slides).forEach((rows) => pieces.push({
        label: sl.title,
        rows,
        verse: true, segs: rows.map((r) => parseRich(r)), fmt: sl.fmt, bg: sl.fmt?.bg ?? look.bg, fg: sl.fmt?.color ?? look.fg, font: look.font, size: sl.fmt?.size, numColor: sl.fmt?.numColor ?? look.numColor,
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
  return { size, slides: pieces.map((p) => ({ ...p, label: look.showLabels ? p.label : "" })) };
}

// Draws the rows of a slide: verse numbers in their own size and colour, formatted text as formatted
function renderRows(rows: RichSeg[][], numColor: string, vnumClass: string) {
  return rows.map((line, ri) => (
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
  ));
}

// Selection helpers for the formatted editor (offsets are visible-text offsets)
function blockOf(el: HTMLElement, node: Node): Node {
  let n: Node = node;
  while (n.parentNode && n.parentNode !== el) n = n.parentNode;
  return n;
}
function visibleOffset(el: HTMLElement, node: Node, off: number): number {
  if (node === el) {
    return Array.from(el.children).slice(0, off).reduce((v, d) => v + (d.textContent ?? "").length + 1, 0);
  }
  const block = blockOf(el, node);
  let v = 0;
  for (const d of Array.from(el.children)) {
    if (d === block) break;
    v += (d.textContent ?? "").length + 1;
  }
  const r = document.createRange();
  r.setStart(block, 0);
  r.setEnd(node, off);
  return v + r.toString().length;
}
function locate(el: HTMLElement, v: number): { node: Node; off: number } {
  let rest = v;
  const blocks = Array.from(el.children);
  for (const d of blocks) {
    const len = (d.textContent ?? "").length;
    if (rest <= len) {
      const w = document.createTreeWalker(d, NodeFilter.SHOW_TEXT);
      let n = w.nextNode();
      let r = rest;
      while (n) {
        const tl = n.textContent?.length ?? 0;
        if (r <= tl) return { node: n, off: r };
        r -= tl;
        n = w.nextNode();
      }
      return { node: d, off: d.childNodes.length };
    }
    rest -= len + 1;
  }
  const last = blocks[blocks.length - 1];
  return last ? { node: last, off: last.childNodes.length } : { node: el, off: 0 };
}
// Puts the caret or selection back at the given stored-text offsets after a formatting change
function setTextSelection(el: HTMLElement, text: string, start: number, end: number) {
  const a = locate(el, markerToVisible(text, start));
  const b = locate(el, markerToVisible(text, end));
  const r = document.createRange();
  r.setStart(a.node, a.off);
  r.setEnd(b.node, b.off);
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(r);
}

// The formatted text editor. It shows the formatting and hides the markers; the stored text keeps them.
function VerseTextBox({ id, value, onChange, onSelect }: { id: string; value: string; onChange: (v: string) => void; onSelect: (start: number, end: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const last = useRef<string>("\u0000");
  // Undo/redo history for this text box (typing and every formatting change). Typing within
  // a short pause is one step. Formatting replaces the box's HTML, so the browser's own undo can't be used.
  const hist = useRef<{ past: string[]; future: string[]; cur: string; at: number }>({ past: [], future: [], cur: value, at: 0 });
  useEffect(() => {
    const h = hist.current;
    if (value === h.cur) return;
    const now = Date.now();
    const typing = value === last.current && now - h.at < 800 && h.past.length > 0;
    if (!typing) { h.past.push(h.cur); if (h.past.length > 200) h.past.shift(); }
    h.future = [];
    h.cur = value;
    h.at = value === last.current ? now : 0;
  }, [value]);
  const step = (back: boolean) => {
    const h = hist.current;
    const from = back ? h.past : h.future;
    const to = back ? h.future : h.past;
    const v = from.pop();
    if (v === undefined) return;
    to.push(h.cur);
    h.cur = v;
    h.at = 0;
    onChange(v);
  };
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && value !== last.current) {
      el.innerHTML = editorHtml(value);
      last.current = value;
    }
  }, [value]);
  useEffect(() => {
    const onSel = () => {
      const el = ref.current;
      const sel = window.getSelection();
      if (!el || !sel || sel.rangeCount === 0 || !sel.anchorNode || !el.contains(sel.anchorNode)) return;
      const a = visibleOffset(el, sel.anchorNode, sel.anchorOffset);
      const b = sel.focusNode ? visibleOffset(el, sel.focusNode, sel.focusOffset) : a;
      const s1 = visibleToMarker(last.current, Math.min(a, b));
      const s2 = visibleToMarker(last.current, Math.max(a, b));
      onSelect(s1, s2);
    };
    document.addEventListener("selectionchange", onSel);
    return () => document.removeEventListener("selectionchange", onSel);
  }, [onSelect]);
  return (
    <div
      id={id}
      ref={ref}
      className="vtb-edit"
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      onInput={() => {
        const el = ref.current;
        if (!el) return;
        const t = editorToText(el);
        last.current = t;
        onChange(t);
      }}
      onKeyDown={(e) => {
        if (!(e.metaKey || e.ctrlKey)) return;
        const k = e.key.toLowerCase();
        if (k === "z") { e.preventDefault(); step(!e.shiftKey); }
        else if (k === "y") { e.preventDefault(); step(false); }
      }}
      onPaste={(e) => {
        e.preventDefault();
        document.execCommand("insertText", false, spaceVerseNumbers(e.clipboardData.getData("text/plain")));
      }}
    />
  );
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
  useEffect(() => {
    try { sessionStorage.setItem(SCRIPTURE_DRAFT, JSON.stringify({ title, slides, selectedId, currentId })); } catch { /* storage blocked */ }
  }, [title, slides, selectedId, currentId]);
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

  // Feedback
  const [status, setStatus] = useState("Add a slide to start. Use Fetch to load a passage.");
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);

  const say = (m: string, e = false) => { setStatus(m); setError(e); };

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
  const output = useMemo(() => buildOutput(slides, look), [slides, look]);
  // The preview follows the slide picked in the middle column; with nothing picked it shows the whole study
  const shown = useMemo(
    () => (selected ? buildOutput([selected], look).slides : output.slides),
    [selected, look, output],
  );

  // ---------- Account and saved studies ----------
  async function loadSaved() {
    if (!supabase) return;
    const { data, error: err } = await supabase
      .from("scripture_studies")
      .select("id, study_title, reference, data")
      .order("updated_at", { ascending: false });
    if (err) { say("Could not load saved studies: " + err.message, true); return; }
    setSaved((data || []).map((r) => ({ id: r.id, title: r.study_title, reference: r.reference, data: r.data as StudyData })));
  }

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session) loadSaved();
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      if (s) loadSaved(); else setSaved([]);
    });
    return () => sub.subscription.unsubscribe();
    // loadSaved reads only, so subscribing once is enough
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    const q = currentId
      ? supabase.from("scripture_studies").update(row).eq("id", currentId).select("id").single()
      : supabase.from("scripture_studies").insert({ ...row, owner_id: user.id }).select("id").single();
    const { data: result, error: err } = await q;
    setBusy(false);
    if (err) { say("Could not save: " + err.message, true); return null; }
    setCurrentId(result.id);
    await loadSaved();
    say(`Saved "${title.trim()}".`);
    return result.id;
  }

  // Save the study, then open the Presentation Builder, where it is at the top of Recent scriptures
  async function addToPresentation() {
    const id = await save();
    if (id) window.location.hash = "#builder";
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
  useEffect(() => { try { localStorage.setItem(SC_FAV_KEY, JSON.stringify(scFavorites)); } catch { /* blocked */ } }, [scFavorites]);
  useEffect(() => { try { localStorage.setItem(SC_RECENT_KEY, JSON.stringify(scRecent)); } catch { /* blocked */ } }, [scRecent]);

  const sq = studyQuery.trim().toLowerCase();
  const studyMatches = sq
    ? saved.filter((st) => `${st.title} ${st.reference} ${st.data.slides.map((x) => x.title).join(" ")}`.toLowerCase().includes(sq))
    : [];
  const studyFavs = saved.filter((st) => scFavorites.includes(st.id));
  const studyRecent = scRecent.map((id) => saved.find((st) => st.id === id)).filter((st): st is SavedStudy => !!st);

  function toggleStudyFavorite() {
    if (!currentId) return;
    setScFavorites((cur) => (cur.includes(currentId) ? cur.filter((x) => x !== currentId) : [...cur, currentId]));
  }

  function openStudy(id: string) {
    setScRecent((cur) => [id, ...cur.filter((x) => x !== id)].slice(0, 8));
    const s = saved.find((x) => x.id === id);
    if (!s) return;
    const { slides: ss, ...rest } = s.data;
    setCurrentId(s.id);
    setTitle(s.title);
    setLook({ ...DEFAULT_LOOK, ...rest });
    setSlides(ss || []);
    setSelectedId("");
    setPreviewIndex(0);
    say(`Opened "${s.title}".`);
  }

  function newStudy() {
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
    const { error: err } = await supabase.from("scripture_studies").delete().eq("id", currentId);
    if (err) { say("Could not delete: " + err.message, true); return; }
    await loadSaved();
    newStudy();
    say("Study deleted.");
  }

  // ---------- Slide list ----------
  function addSlide(kind: Kind) {
    const s = newSlide(kind);
    setSlides((cur) => [...cur, s]);
    setSelectedId(s.id);
  }
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
    const bible = selected.bible || bibles[0]?.id;
    if (!bible) { say("Add a Bible version first.", true); return; }
    setBusy(true);
    say("Fetching…");
    try {
      const lines: string[] = [];
      for (let v = ref.v1; v <= ref.v2; v++) {
        const verse = await fetchVerse(bible, ref.code, ref.ch, v);
        lines.push(look.verseNumbers ? `${v} ${verse}` : verse);
      }
      const label = `${bookName(ref.code)} ${ref.ch}:${ref.v1}${ref.v2 !== ref.v1 ? `-${ref.v2}` : ""}`;
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
        if (ri < all.length - 1 && runs.length) runs[runs.length - 1].options.breakLine = true;
      });
      sl.addText(runs as never, {
        x: MARGIN_IN, y: MARGIN_IN, w: w - 2 * MARGIN_IN, h: uh,
        align: "center", valign: "middle", margin: 0, lineSpacingMultiple: 1.1, fit: "none",
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
      <div className="sc">
        <header className="sc-top">
          <div className="sc-title">
            <h1>Scripture Slides</h1>
          </div>
          <div className="sc-actions">
            <input className="sc-search" type="search" value={studyQuery} onChange={(e) => setStudyQuery(e.target.value)} placeholder="Search studies" aria-label="Search saved studies" />
            <button className={`sc-star${currentId && scFavorites.includes(currentId) ? " on" : ""}`} onClick={toggleStudyFavorite} disabled={!currentId} aria-label="Favourite this study" aria-pressed={!!currentId && scFavorites.includes(currentId)} title="Favourite">★</button>
            <select value={currentId} onChange={(e) => (e.target.value ? openStudy(e.target.value) : newStudy())} aria-label="Open a saved study">
              <option value="">{saved.length ? "Saved studies…" : user ? "No saved studies" : "Sign in to see studies"}</option>
              {sq ? (
                <optgroup label={`Results (${studyMatches.length})`}>
                  {studyMatches.map((st) => <option key={st.id} value={st.id}>{st.title}</option>)}
                </optgroup>
              ) : (
                <>
                  {studyFavs.length > 0 && <optgroup label="Favourites">{studyFavs.map((st) => <option key={st.id} value={st.id}>{st.title}</option>)}</optgroup>}
                  {studyRecent.length > 0 && <optgroup label="Recently used">{studyRecent.map((st) => <option key={st.id} value={st.id}>{st.title}</option>)}</optgroup>}
                  <optgroup label="All studies">{saved.map((st) => <option key={st.id} value={st.id}>{st.title}</option>)}</optgroup>
                </>
              )}
            </select>
            <button className="secondary" onClick={addToPresentation} disabled={busy || !user}>Add to presentation</button>
            <button className="secondary" onClick={newStudy}>New</button>
            <details className="sc-more">
              <summary>More</summary>
              <div className="sc-menu">
                <button className="secondary" onClick={duplicateStudy} disabled={!currentId}>Duplicate</button>
                <button className="secondary danger" onClick={deleteStudy} disabled={!currentId}>Delete</button>
              </div>
            </details>
            <button className="primary" onClick={present} disabled={!output.slides.length}>Present</button>
            <button className="secondary" onClick={downloadPptx} disabled={!output.slides.length}>Download .pptx</button>
          </div>
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

        <p className={error ? "sc-status error" : "sc-status"} role="status">{status}</p>

        <details className="sc-presentation">
          <summary>Presentation Settings <span className="sc-summary">{settingsSummary}</span></summary>
          <div className="sc-settings">
            <div className="sc-group">
              <h3>Layout</h3>
              <label htmlFor="sc-aspect">Shape</label>
              <select id="sc-aspect" value={look.aspect} onChange={(e) => setLook({ ...look, aspect: e.target.value as "16:9" | "4:3" })}>
                <option value="16:9">16:9 widescreen</option>
                <option value="4:3">4:3</option>
              </select>
              <label htmlFor="sc-per">Lines per slide</label>
              <select id="sc-per" value={look.perSlide} onChange={(e) => setLook({ ...look, perSlide: parseInt(e.target.value, 10) })}>
                {[2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <div className="sc-group">
              <h3>Typography</h3>
              <label htmlFor="sc-font">Font</label>
              <select id="sc-font" value={look.font} onChange={(e) => setLook({ ...look, font: e.target.value })}>
                {FONTS.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
              <label htmlFor="sc-size">Font size (pt)</label>
              <input id="sc-size" type="number" min={20} max={200} placeholder="Auto" value={look.customSize || ""} onChange={(e) => setLook({ ...look, customSize: parseInt(e.target.value, 10) || 0 })} />
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
            </div>
          </div>
        </details>

        <div className="sc-body">
          {/* Edit the selected slide */}
          <section className="sc-col sc-edit" aria-label="Edit slide">
            {!selected && <p className="sc-empty">Pick a slide on the right to edit it, or add a new one.</p>}
            {selected?.kind === "passage" && (
              <>
                <div className="sc-field">
                  <span className="sc-label">Bible version</span>
                  <div className="sc-radios" role="radiogroup" aria-label="Bible version">
                    {bibles.map((b) => (
                      <label key={b.id} className="sc-radio">
                        <input type="radio" name="bible" value={b.id} checked={(selected.bible || bibles[0]?.id) === b.id} onChange={() => update(selected.id, { bible: b.id })} />
                        {b.name}
                      </label>
                    ))}
                  </div>
                  <button className="link small" onClick={() => setShowBibles((v) => !v)}>{showBibles ? "Close versions" : "Manage versions"}</button>
                </div>
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

                <div className="sc-field">
                  <span className="sc-label">Passage</span>
                  <div className="passage-pick">
                    <select value={selected.book ?? ""} onChange={(e) => update(selected.id, { book: e.target.value })} aria-label="Book">
                      <option value="">Book…</option>
                      {BOOKS.map(([name, code]) => <option key={code} value={code}>{name}</option>)}
                    </select>
                    <input type="number" min={1} value={selected.chapter ?? ""} placeholder="Chapter" aria-label="Chapter" onChange={(e) => update(selected.id, { chapter: e.target.value })} />
                    <input type="number" min={1} value={selected.verseFrom ?? ""} placeholder="From" aria-label="First verse" onChange={(e) => update(selected.id, { verseFrom: e.target.value })} />
                    <input type="number" min={1} value={selected.verseTo ?? ""} placeholder="To" aria-label="Last verse" onChange={(e) => update(selected.id, { verseTo: e.target.value })} />
                  </div>
                  <button className="fetch" onClick={fetchPassage} disabled={busy}>{busy ? "Fetching…" : "Fetch passage"}</button>
                </div>
                <div className="sc-field">
                  <label className="sc-label" htmlFor="sc-label">Slide label</label>
                  <input id="sc-label" value={selected.title} onChange={(e) => update(selected.id, { title: e.target.value })} />
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
                <div className="sc-field">
                  <span className="sc-label">Formatting</span>
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
                    <button className="tool" onClick={() => update(selected.id, { fmt: undefined, text: stripMarkers(selected.text) })} title="Remove all formatting from this slide">Reset</button>
                  </div>
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
                  <div className="fmt-size">
                    <span className="sc-label">Font size</span>
                    <span className="fmt-small">A</span>
                    <input type="range" min={20} max={200} step={1} value={selected.fmt?.size ?? output.size} onChange={(e) => update(selected.id, { fmt: { ...selected.fmt, size: parseInt(e.target.value, 10) } })} aria-label="Font size for this slide" />
                    <span className="fmt-large">A</span>
                    <output>{selected.fmt?.size ? `${selected.fmt.size} pt` : `Auto (${output.size} pt)`}</output>
                    <button className="tool" onClick={() => update(selected.id, { fmt: { ...selected.fmt, size: undefined } })} disabled={!selected.fmt?.size}>Auto</button>
                  </div>
                  <div className="fmt-presets" role="group" aria-label="Recommended colours for this slide">
                    {COLOR_PRESETS.map((p) => (
                      <button key={p.name} type="button" className={`sc-preset${selected.fmt?.bg === p.bg && selected.fmt?.color === p.fg ? " on" : ""}`} title={p.name} aria-label={p.name}
                        style={{ background: p.bg, color: p.fg, boxShadow: `inset 0 -5px 0 ${p.num}` }} onClick={() => update(selected.id, { fmt: { ...selected.fmt, bg: p.bg, color: p.fg, numColor: p.num } })}>Aa</button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </section>

          {/* The slide sequence */}
          <section className="sc-col sc-slides" aria-label="Slides">
            <div className="sc-savebar">
              <input className="sc-study-title" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Study title" placeholder="Study title" />
              <button className="primary" onClick={save} disabled={busy || !user}>{busy ? "Saving…" : "Save"}</button>
            </div>
            <div className="sc-add">
              <button className="secondary small" onClick={() => addSlide("passage")}>+ Passage</button>
              <button className="secondary small" onClick={() => addSlide("custom")}>+ Custom</button>
              <button className="secondary small" onClick={() => addSlide("questions")}>+ Questions</button>
            </div>
            <ol className="sc-list">
              {slides.map((s, i) => (
                <li
                  key={s.id}
                  className={`sc-item${selectedId === s.id ? " selected" : ""}${dragId === s.id ? " dragging" : ""}${dragId && dragId !== s.id && dropAt === i ? " drop-before" : ""}${dragId && dragId !== s.id && dropAt === i + 1 && i === slides.length - 1 ? " drop-after" : ""}`}
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
                      <small>{s.kind === "passage" ? "Passage" : s.kind === "questions" ? "Questions" : "Custom"}</small>
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
            {shown.length ? (
              <>
                {(() => {
                  const cur = shown[Math.min(previewIndex, shown.length - 1)];
                  return (
                    <div className={`sc-big${look.aspect === "4:3" ? " ratio-43" : ""}`} style={{ background: cur.bg ?? look.bg, color: cur.fg ?? look.fg, fontFamily: `${cur.font ?? look.font}, sans-serif` }}>
                      <div className="sc-big-text" style={{ fontSize: `${((cur.size ?? output.size) / 960) * 100}cqw` }}>
                        {renderRows(cur.segs ?? cur.rows.map((r) => parseRich(r)), cur.numColor ?? look.numColor, "sc-big-vnum")}
                      </div>
                      {cur.label && look.showLabels && <div className="sc-big-tag" style={{ color: look.labelColor }}>{cur.label}</div>}
                    </div>
                  );
                })()}
                <div className="sc-cards">
                  {shown.map((sl, i) => (
                    <button
                      key={i}
                      type="button"
                      className={`sc-card${Math.min(previewIndex, shown.length - 1) === i ? " current" : ""}${look.aspect === "4:3" ? " ratio-43" : ""}`}
                      style={{ background: sl.bg ?? look.bg, color: sl.fg ?? look.fg, fontFamily: `${sl.font ?? look.font}, sans-serif` }}
                      onClick={() => setPreviewIndex(i)}
                      aria-label={`Slide ${i + 1}`}
                    >
                      <span className="sc-card-num">{i + 1}</span>
                      <span className="sc-card-text">
                        {renderRows(sl.segs ?? sl.rows.map((r) => parseRich(r)), sl.numColor ?? look.numColor, "sc-card-vnum")}
                      </span>
                      {sl.label && <span className="sc-card-tag" style={{ color: look.labelColor }}>{sl.label}</span>}
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
          </section>
        </div>
      </div>
    </>
  );
}
