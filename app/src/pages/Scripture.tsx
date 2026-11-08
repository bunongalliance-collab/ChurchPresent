import { useEffect, useMemo, useState } from "react";
import PptxGenJS from "pptxgenjs";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import NavBar from "../components/NavBar";
import { buildDeck, FONTS, MARGIN_IN, SLIDE_H_IN, SLIDE_W_IN, USABLE_H } from "../lib/slides";
import { PROJECTOR_KEY, type ProjDeck, type SlideFmt } from "./Projector";

// ---------- Bible versions (YouVersion IDs). Kept in this browser; add or remove as needed. ----------
interface BibleVersion { id: string; name: string }
const DEFAULT_BIBLES: BibleVersion[] = [
  { id: "1657", name: "Bunong" },
  { id: "1638", name: "Vietnamese (VCB)" },
  { id: "3034", name: "English (BSB)" },
];
const BIBLES_KEY = "scriptureBibles";
const LOOK_KEY = "scriptureLookDefaults";

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
  fmt?: SlideFmt;      // bold, italic, underline and text colour for this slide
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
// Slide formatting as CSS, for the preview
function fmtCss(f?: SlideFmt): React.CSSProperties {
  if (!f) return {};
  return {
    fontWeight: f.bold === false ? 400 : 700,
    fontStyle: f.italic ? "italic" : undefined,
    textDecoration: f.underline ? "underline" : undefined,
    color: f.color || undefined,
  };
}

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
// Marker for a verse number: \u0001 before the number, so the projector and .pptx colour it
const VERSE_MARK = "\u0001";
export interface OutSlide { label: string; rows: string[]; verse: boolean; fmt?: SlideFmt; bg?: string; fg?: string; font?: string }

export function buildOutput(slides: StudySlide[], look: Look): { size: number; slides: OutSlide[] } {
  const pieces: OutSlide[] = [];
  for (const sl of slides) {
    const lines = sl.text.split("\n").filter((l) => l.trim());
    if (!lines.length) continue;
    if (sl.kind === "passage") {
      // Mark a leading verse number so it can take the verse-number colour
      const deck = buildDeck({
        lyrics: lines.join("\n"), font: look.font, perSlide: look.perSlide, removeRepeats: false,
        showTitle: false, songTitle: "", songNumber: "", customSize: look.customSize || 0,
      });
      // Mark each verse number at the start of a row, so it can be drawn smaller and in its own colour
      deck.slides.forEach((rows) => pieces.push({
        label: sl.title,
        rows: rows.map((r) => (look.verseNumbers ? r.replace(/^(\d{1,3})(?=\s)/, `${VERSE_MARK}$1`) : r)),
        verse: true, fmt: sl.fmt, bg: look.bg, fg: look.fg, font: look.font,
      }));
    } else {
      pieces.push({ label: sl.title, rows: lines, verse: false, fmt: sl.fmt, bg: look.bg, fg: look.fg, font: look.font });
    }
  }
  const all = slides.filter((s) => s.text.trim()).map((s) => s.text).join("\n");
  const size = look.customSize > 0 ? look.customSize : all ? buildDeck({
    lyrics: all, font: look.font, perSlide: look.perSlide, removeRepeats: false,
    showTitle: false, songTitle: "", songNumber: "", customSize: 0,
  }).size : 84;
  return { size, slides: pieces.map((p) => ({ ...p, label: look.showLabels ? p.label : "" })) };
}

export default function Scripture() {
  // Study
  const [title, setTitle] = useState("Scripture study");
  const [slides, setSlides] = useState<StudySlide[]>([]);
  // The look settings are remembered in this browser, so your colours become the defaults
  const [look, setLook] = useState<Look>(() => {
    try { return { ...DEFAULT_LOOK, ...JSON.parse(localStorage.getItem(LOOK_KEY) || "{}") }; } catch { return DEFAULT_LOOK; }
  });
  useEffect(() => {
    try { localStorage.setItem(LOOK_KEY, JSON.stringify(look)); } catch { /* storage blocked */ }
  }, [look]);
  const [selectedId, setSelectedId] = useState("");
  const [currentId, setCurrentId] = useState("");
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
  const user = session?.user ?? null;
  const selected = slides.find((s) => s.id === selectedId) ?? null;
  const output = useMemo(() => buildOutput(slides, look), [slides, look]);
  const preview = output.slides[Math.min(previewIndex, Math.max(0, output.slides.length - 1))];

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

  function openStudy(id: string) {
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
    if (selected.text.trim() && !window.confirm("Replace the text on this slide with the fetched passage?")) return;
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
        text: lines.join("\n"), title: label, bible, book: ref.code,
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
      slides: output.slides.map((s) => ({ label: s.label, rows: s.rows, verse: s.verse, fmt: s.fmt, numColor: look.numColor, size: output.size })),
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
      sl.background = { color: hex(look.bg) };
      if (s.label) {
        sl.addText(s.label, {
          x: w - MARGIN_IN - 3, y: h - MARGIN_IN - 0.5, w: 3, h: 0.5,
          fontFace: look.font, fontSize: 24, bold: true, color: hex(look.labelColor), align: "right", valign: "bottom", margin: 0,
        });
      }
      // Build text runs: verse numbers in their colour, the slide's formatting on the rest
      const runs: { text: string; options: Record<string, unknown> }[] = [];
      const base = {
        fontFace: look.font, fontSize: output.size, bold: s.fmt?.bold ?? true,
        italic: !!s.fmt?.italic, underline: s.fmt?.underline ? { style: "sng" } : undefined,
        color: hex(s.fmt?.color || look.fg),
      };
      s.rows.forEach((row, ri) => {
        row.split(/\u0001(\d{1,3})/).forEach((part, k) => {
          if (!part) return;
          const isNum = s.verse && k % 2 === 1;
          runs.push({ text: isNum ? `${part} ` : k ? part.replace(/^ /, "") : part, options: isNum ? { ...base, color: hex(look.numColor) } : { ...base } });
        });
        if (ri < s.rows.length - 1 && runs.length) runs[runs.length - 1].options.breakLine = true;
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
  return (
    <>
      <NavBar />
      <div className="sc">
        <header className="sc-top">
          <div className="sc-title">
            <h1>Scripture Slides</h1>
            <input value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Study title" />
          </div>
          <div className="sc-actions">
            <select value={currentId} onChange={(e) => (e.target.value ? openStudy(e.target.value) : newStudy())} aria-label="Open a saved study">
              <option value="">{saved.length ? "Open a saved study…" : user ? "No saved studies yet" : "Sign in to see saved studies"}</option>
              {saved.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
            </select>
            <button onClick={save} disabled={busy || !user}>{busy ? "Saving…" : "Save"}</button>
            <button onClick={addToPresentation} disabled={busy || !user}>Add to presentation</button>
            <button className="secondary" onClick={newStudy}>New</button>
            <button className="secondary" onClick={duplicateStudy} disabled={!currentId}>Duplicate</button>
            <button className="secondary" onClick={deleteStudy} disabled={!currentId}>Delete</button>
            <button onClick={present} disabled={!output.slides.length}>Present</button>
            <button className="secondary" onClick={downloadPptx} disabled={!output.slides.length}>Download .pptx</button>
          </div>
        </header>

        {supabase && !user && (
          <div className="sc-signin">
            <span>Not signed in: sign in to save studies.</span>
            <input type="email" placeholder="Email" value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} />
            <input type="password" placeholder="Password" value={authPass} onChange={(e) => setAuthPass(e.target.value)} />
            <button onClick={() => authAction("in")}>Sign in</button>
            <button className="secondary" onClick={() => authAction("up")}>Create account</button>
          </div>
        )}
        {user && <p className="sc-who">Signed in as {user.email}</p>}
        <p className={error ? "status error" : "status"} role="status">{status}</p>

        <div className="sc-settings" aria-label="Settings">
            <div className="grid2">
              <div>
                <label htmlFor="sc-font">Font</label>
                <select id="sc-font" value={look.font} onChange={(e) => setLook({ ...look, font: e.target.value })}>
                  {FONTS.map((f) => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="sc-aspect">Shape</label>
                <select id="sc-aspect" value={look.aspect} onChange={(e) => setLook({ ...look, aspect: e.target.value as "16:9" | "4:3" })}>
                  <option value="16:9">16:9 widescreen</option>
                  <option value="4:3">4:3</option>
                </select>
              </div>
              <div>
                <label htmlFor="sc-per">Lines per slide</label>
                <select id="sc-per" value={look.perSlide} onChange={(e) => setLook({ ...look, perSlide: parseInt(e.target.value, 10) })}>
                  {[2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="sc-size">Size (pt)</label>
                <input id="sc-size" type="number" min={20} max={200} placeholder="Auto" value={look.customSize || ""} onChange={(e) => setLook({ ...look, customSize: parseInt(e.target.value, 10) || 0 })} />
              </div>
              <div className="colors">
                <label>Background</label>
                <input type="color" value={look.bg} onChange={(e) => setLook({ ...look, bg: e.target.value })} />
                <label>Text</label>
                <input type="color" value={look.fg} onChange={(e) => setLook({ ...look, fg: e.target.value })} />
              </div>
              <div className="colors">
                <label>Verse no.</label>
                <input type="color" value={look.numColor} onChange={(e) => setLook({ ...look, numColor: e.target.value })} />
                <label>Titles</label>
                <input type="color" value={look.labelColor} onChange={(e) => setLook({ ...look, labelColor: e.target.value })} />
              </div>
            </div>
            <label className="check"><input type="checkbox" checked={look.verseNumbers} onChange={(e) => setLook({ ...look, verseNumbers: e.target.checked })} /> Verse numbers</label>
            <label className="check"><input type="checkbox" checked={look.showLabels} onChange={(e) => setLook({ ...look, showLabels: e.target.checked })} /> Show slide labels</label>
        </div>
        <div className="sc-body">
          {/* Left: edit the selected slide */}
          <section className="sc-col sc-edit" aria-label="Edit slide">
            <h2>Edit slide</h2>
            {!selected && <p className="empty">Pick a slide on the left to edit it.</p>}
            {selected?.kind === "passage" && (
              <>
                <label htmlFor="sc-bible">Bible version</label>
                <div className="row">
                  <select id="sc-bible" value={selected.bible || bibles[0]?.id} onChange={(e) => update(selected.id, { bible: e.target.value })}>
                    {bibles.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                  <button className="secondary small" onClick={() => setShowBibles((v) => !v)}>{showBibles ? "Close" : "Manage versions"}</button>
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

                <label>Passage</label>
                <div className="passage-pick">
                  <select value={selected.book ?? ""} onChange={(e) => update(selected.id, { book: e.target.value })} aria-label="Book">
                    <option value="">Book…</option>
                    {BOOKS.map(([name, code]) => <option key={code} value={code}>{name}</option>)}
                  </select>
                  <input type="number" min={1} value={selected.chapter ?? ""} placeholder="Chapter" aria-label="Chapter" onChange={(e) => update(selected.id, { chapter: e.target.value })} />
                  <input type="number" min={1} value={selected.verseFrom ?? ""} placeholder="From" aria-label="First verse" onChange={(e) => update(selected.id, { verseFrom: e.target.value })} />
                  <input type="number" min={1} value={selected.verseTo ?? ""} placeholder="To" aria-label="Last verse" onChange={(e) => update(selected.id, { verseTo: e.target.value })} />
                </div>
                <div className="row">
                  <button onClick={fetchPassage} disabled={busy}>{busy ? "Fetching…" : "Fetch passage"}</button>
                </div>
                <label>Label on slide</label>
                <input value={selected.title} onChange={(e) => update(selected.id, { title: e.target.value })} />
              </>
            )}
            {selected && selected.kind !== "passage" && (
              <>
                <label>Slide title</label>
                <input value={selected.title} onChange={(e) => update(selected.id, { title: e.target.value })} />
              </>
            )}
            {selected && (
              <>
                <label>Text (one line per row)</label>
                <textarea className="sc-text" value={selected.text} onChange={(e) => update(selected.id, { text: e.target.value })} />
                <label>Slide formatting</label>
                <div className="row fmt-row">
                  <button className={`secondary small${selected.fmt?.bold ? " on" : ""}`} onClick={() => update(selected.id, { fmt: { ...selected.fmt, bold: !selected.fmt?.bold } })} aria-pressed={!!selected.fmt?.bold}><b>B</b></button>
                  <button className={`secondary small${selected.fmt?.italic ? " on" : ""}`} onClick={() => update(selected.id, { fmt: { ...selected.fmt, italic: !selected.fmt?.italic } })} aria-pressed={!!selected.fmt?.italic}><i>I</i></button>
                  <button className={`secondary small${selected.fmt?.underline ? " on" : ""}`} onClick={() => update(selected.id, { fmt: { ...selected.fmt, underline: !selected.fmt?.underline } })} aria-pressed={!!selected.fmt?.underline}><u>U</u></button>
                  <label className="fmt-color">Text colour <input type="color" value={selected.fmt?.color || look.fg} onChange={(e) => update(selected.id, { fmt: { ...selected.fmt, color: e.target.value } })} /></label>
                  <button className="secondary small" onClick={() => update(selected.id, { fmt: undefined })}>Reset</button>
                </div>
              </>
            )}
          </section>

          {/* Middle: slides in order */}
          <section className="sc-col sc-slides" aria-label="Slides">
            <h2>Slides</h2>
            <div className="row">
              <button className="secondary small" onClick={() => addSlide("passage")}>+ Passage</button>
              <button className="secondary small" onClick={() => addSlide("custom")}>+ Custom</button>
              <button className="secondary small" onClick={() => addSlide("questions")}>+ Questions</button>
            </div>
            <ol className="sc-list">
              {slides.map((s, i) => (
                <li key={s.id} className={`sc-item ${s.kind}${selectedId === s.id ? " selected" : ""}`}>
                  <button className="sc-pick" onClick={() => setSelectedId(s.id)}>
                    <span className="seq-num">{i + 1}</span>
                    <span className="sc-pick-text">
                      <strong>{s.title || (s.kind === "passage" ? "Passage (not fetched)" : "Untitled")}</strong>
                      <small>{s.kind === "passage" ? "Passage" : s.kind === "questions" ? "Questions" : "Custom"}</small>
                    </span>
                  </button>
                  <span className="sc-item-tools">
                    <button className="secondary small" onClick={() => move(s.id, -1)} disabled={i === 0} aria-label="Move up">↑</button>
                    <button className="secondary small" onClick={() => move(s.id, 1)} disabled={i === slides.length - 1} aria-label="Move down">↓</button>
                    <button className="secondary small" onClick={() => duplicateSlide(s.id)}>Copy</button>
                    <button className="secondary small" onClick={() => removeSlide(s.id)}>Remove</button>
                  </span>
                </li>
              ))}
            </ol>
            {!slides.length && <p className="empty">No slides yet. Add a passage, custom or questions slide.</p>}
          </section>

          {/* 3. Look and preview */}
          <section className="sc-col sc-look" aria-label="Preview and look">
            <h2>Preview</h2>
            {preview ? (
              <>
                <div className={`sc-stage${look.aspect === "4:3" ? " ratio-43" : ""}`} style={{ background: look.bg, color: look.fg, fontFamily: `${look.font}, sans-serif` }}>
                  <div className="sc-stage-text" style={fmtCss(preview.fmt)}>
                    {preview.rows.map((row, ri) => (
                      <div key={ri}>
                        {row.split(/\u0001(\d{1,3})/).map((part, k) => {
                          if (!part) return null;
                          if (k % 2) return <span key={k} style={{ color: look.numColor, fontSize: "0.5em", verticalAlign: "0.7em" }}>{part} </span>;
                          return <span key={k}>{k ? part.replace(/^ /, "") : part}</span>;
                        })}
                      </div>
                    ))}
                  </div>
                  {preview.label && <div className="sc-stage-tag" style={{ color: look.labelColor }}>{preview.label}</div>}
                </div>
                <div className="row">
                  <button className="secondary small" onClick={() => setPreviewIndex((i) => Math.max(0, i - 1))} disabled={previewIndex === 0}>← Prev</button>
                  <span>{Math.min(previewIndex, output.slides.length - 1) + 1} / {output.slides.length}</span>
                  <button className="secondary small" onClick={() => setPreviewIndex((i) => Math.min(output.slides.length - 1, i + 1))} disabled={previewIndex >= output.slides.length - 1}>Next →</button>
                </div>
              </>
            ) : <p className="empty">Nothing to preview yet.</p>}

          </section>
        </div>
      </div>
    </>
  );
}
