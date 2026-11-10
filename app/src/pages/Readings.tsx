import { useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import NavBar from "../components/NavBar";
import { COLOR_PRESETS, deckSize, flowLines, FONTS } from "../lib/slides";
import { carryFormattingSlides, carryLines, contrastText, HIGHLIGHT_OPTIONS, parseRich, setColors, stripMarkers, TEXT_COLOR_OPTIONS, toggleMarker, type RichSeg } from "../lib/richtext";
import { fmtAt, tokenLenAt } from "../lib/richeditor";
import { setTextSelection, VerseTextBox } from "../components/RichTextBox";
import { parseReadings } from "../lib/readingImport";
import { downloadDeckPptx } from "../lib/pptx";
import type { ProjDeck, ProjSlide } from "./Projector";

// Readings: non-song passages (Scripture readings, responsive readings, prayers, declarations...).
// Signed in: stored in Supabase (readings, reading_categories). Otherwise: this browser only.

export interface ReadingLook { font: string; perSlide: number; customSize: number; bg: string; fg: string }
export interface Reading { id: string; number: string; title: string; subtitle: string; categoryId: string | null; content: string; look: Partial<ReadingLook>; owner?: string }
export interface Category { id: string; name: string; sort: number }

const SEED_CATEGORIES = ["Scripture", "Responsive Reading", "Prayer", "Declaration", "Church Orders", "Special Occasions", "Other"];
const DEFAULT_LOOK: ReadingLook = { font: "Arial", perSlide: 4, customSize: 0, bg: "#213648", fg: "#f5f2ea" };
const PROJECTOR_KEY = "lyricsDeck";
const LOCAL_READINGS = "readingsLocal";
const LOCAL_CATEGORIES = "readingCategoriesLocal";
const FAV_KEY = "readingFavourites";
const RECENT_KEY = "readingRecent";
const DRAFT_KEY = "readingDraft";
const PENDING_BUILDER_KEY = "pendingBuilderItem";

const load = <T,>(key: string, fallback: T): T => { try { return JSON.parse(localStorage.getItem(key) || "null") ?? fallback; } catch { return fallback; } };
const store = (key: string, v: unknown) => { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* storage blocked */ } };
const uid = () => Math.random().toString(36).slice(2, 10);

// Paragraphs are separated by blank lines. Each paragraph starts a new slide (never mixed with the next one).
export function readingSlides(content: string, look: ReadingLook): { rows: string[]; size: number }[] {
  const paragraphs = content.split(/\n\s*\n/).map((p) => p.split("\n").map((l) => l.trim()).filter(Boolean)).filter((p) => p.length);
  const all = paragraphs.flat();
  if (!all.length) return [];
  const size = look.customSize > 0 ? look.customSize : deckSize([all], look.font, look.perSlide);
  const flat = paragraphs.flatMap((p) => flowLines(p, look.font, size, look.perSlide));
  return carryFormattingSlides(flat).map((rows) => ({ rows, size }));
}

// Formatted segments of a row, for the preview and the projector
const segsOf = (rows: string[]): RichSeg[][] => rows.map((r) => parseRich(r));

function RowText({ rows }: { rows: string[] }) {
  return (
    <>
      {segsOf(rows).map((line, ri) => (
        <span key={ri} className="pv-row">
          {line.map((seg, k) => (
            <span key={k} style={{ fontWeight: seg.bold ? 700 : undefined, fontStyle: seg.italic ? "italic" : undefined, textDecoration: seg.underline ? "underline" : undefined, color: seg.color, backgroundColor: seg.highlight }}>{seg.text}</span>
          ))}
        </span>
      ))}
    </>
  );
}

export default function Readings() {
  const draft = useMemo(() => { try { return JSON.parse(sessionStorage.getItem(DRAFT_KEY) || "null"); } catch { return null; } }, []);
  const [title, setTitle] = useState<string>(draft?.title ?? "");
  const [number, setNumber] = useState<string>(draft?.number ?? "");
  const [subtitle, setSubtitle] = useState<string>(draft?.subtitle ?? "");
  const [categoryId, setCategoryId] = useState<string>(draft?.categoryId ?? "");
  const [content, setContent] = useState<string>(draft?.content ?? "");
  const [look, setLook] = useState<ReadingLook>({ ...DEFAULT_LOOK, ...(draft?.look ?? {}) });

  const [readings, setReadings] = useState<Reading[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [query] = useState("");
  const [filterCat, setFilterCat] = useState(""); // "" all, "none" = Other (no category), else a category id
  const [favorites, setFavorites] = useState<string[]>(() => load(FAV_KEY, []));
  const [recent, setRecent] = useState<string[]>(() => load(RECENT_KEY, []));
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState("Type or paste a reading to start.");
  const [statusIsError, setStatusIsError] = useState(false);
  const [addedNow, setAddedNow] = useState<string[]>([]);
  const [newCat, setNewCat] = useState("");
  const [sel, setSel] = useState({ start: 0, end: 0 });
  const seedingFor = useRef<string | null>(null);
  const user = session?.user ?? null;

  const say = (msg: string, error = false) => { setStatus(msg); setStatusIsError(error); };

  useEffect(() => {
    try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ title, number, subtitle, categoryId, content, look })); } catch { /* blocked */ }
  }, [title, number, subtitle, categoryId, content, look]);

  // ----- Loading (Supabase when configured, otherwise this browser) -----
  const refresh = async (u: Session["user"] | null) => {
    if (supabase) {
      const [r, c] = await Promise.all([
        supabase.from("readings").select("id, number, title, subtitle, category_id, content, look, owner_id").order("updated_at", { ascending: false }),
        u ? supabase.from("reading_categories").select("id, name, sort_order").order("sort_order") : Promise.resolve({ data: [], error: null }),
      ]);
      if (r.error) { say("Could not load readings: " + r.error.message, true); return; }
      setReadings((r.data ?? []).map((x) => ({ id: x.id, number: x.number ?? "", title: x.title, subtitle: x.subtitle ?? "", categoryId: x.category_id, content: x.content, look: x.look ?? {}, owner: x.owner_id })));
      let cats: Category[] = (c.data ?? []).map((x) => ({ id: x.id, name: x.name, sort: x.sort_order }));
      if (u && !cats.length) {
        // Seed once per user: two loads can run at the same time (session check and auth event)
        if (seedingFor.current === u.id) return;
        seedingFor.current = u.id;
        const rows = SEED_CATEGORIES.map((name, i) => ({ owner_id: u.id, name, sort_order: i }));
        const { data: seeded } = await supabase.from("reading_categories").insert(rows).select("id, name, sort_order");
        cats = (seeded ?? []).map((x) => ({ id: x.id, name: x.name, sort: x.sort_order }));
      }
      setCategories(cats);
    } else {
      setReadings(load(LOCAL_READINGS, []));
      let cats = load<Category[]>(LOCAL_CATEGORIES, []);
      if (!cats.length) { cats = SEED_CATEGORIES.map((name, i) => ({ id: uid(), name, sort: i })); store(LOCAL_CATEGORIES, cats); }
      setCategories(cats);
    }
  };

  useEffect(() => {
    if (!supabase) { refresh(null); return; }
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); refresh(data.session?.user ?? null); });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => { setSession(s); refresh(s?.user ?? null); });
    return () => sub.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => store(FAV_KEY, favorites), [favorites]);
  useEffect(() => store(RECENT_KEY, recent), [recent]);

  const catName = (id: string | null) => categories.find((c) => c.id === id)?.name ?? "Other";
  const label = (r: Reading) => `${r.number ? r.number + ". " : ""}${r.title || (r.content.split("\n").find((l) => l.trim()) || "(untitled)").slice(0, 40)}${r.categoryId ? "  ·  " + catName(r.categoryId) : ""}`;

  // Library: search, category filter, favourites, recent
  const q = query.trim().toLowerCase();
  // "Other" is the seeded category; readings with no category also count as Other
  const otherId = categories.find((c) => c.name === "Other")?.id ?? "";
  const visible = readings.filter((r) => {
    if (filterCat && filterCat === otherId ? !(r.categoryId === null || r.categoryId === otherId) : filterCat && r.categoryId !== filterCat) return false;
    return !q || `${r.title} ${r.content}`.toLowerCase().includes(q);
  });
  const favs = visible.filter((r) => favorites.includes(r.id));
  const recents = recent.map((id) => visible.find((r) => r.id === id)).filter((r): r is Reading => !!r);

  // The form and the selected reading
  function fillForm(r: Reading | null) {
    if (r) setRecent((cur) => [r.id, ...cur.filter((x) => x !== r.id)].slice(0, 8));
    setSelectedId(r?.id ?? "");
    setTitle(r?.title ?? "");
    setNumber(r?.number ?? "");
    setSubtitle(r?.subtitle ?? "");
    setCategoryId(r?.categoryId ?? "");
    setContent(r?.content ?? "");
    if (r?.look && Object.keys(r.look).length) setLook({ ...DEFAULT_LOOK, ...r.look });
    say(r ? `Opened "${r.title || "(untitled)"}".` : "New reading. Type or paste the text.");
  }
  function newReading() { fillForm(null); setTitle(""); setNumber(""); setSubtitle(""); setContent(""); }

  const selected = readings.find((r) => r.id === selectedId) ?? null;
  const owned = !supabase || !selected || selected.owner === user?.id;
  // An edited saved reading: offer to approve the update or not
  const pendingUpdate = selected && owned && (selected.content !== content || selected.title !== title.trim() || (selected.categoryId ?? "") !== categoryId || selected.number !== number.trim() || selected.subtitle !== subtitle.trim()) ? selected : null;

  // ----- Save (own readings update in place; someone else's is saved as a copy) -----
  async function save(): Promise<Reading | null> {
    if (!content.trim()) { say("Type or paste the reading before saving.", true); return null; }
    if (supabase && !user) { say("Sign in to save readings.", true); return null; }
    const existing = selected && owned ? selected : null;
    const row = { title: title.trim(), number: number.trim(), subtitle: subtitle.trim(), category_id: categoryId || null, content, look };
    if (supabase && user) {
      const q2 = existing
        ? supabase.from("readings").update(row).eq("id", existing.id).select("id").single()
        : supabase.from("readings").insert({ ...row, owner_id: user.id }).select("id").single();
      const { data, error } = await q2;
      if (error) { say("Could not save: " + error.message, true); return null; }
      const saved: Reading = { id: data.id, number: row.number, title: row.title, subtitle: row.subtitle, categoryId: row.category_id, content, look, owner: user.id };
      await refresh(user);
      setSelectedId(saved.id);
      return saved;
    }
    const list = load<Reading[]>(LOCAL_READINGS, []);
    const id = existing?.id ?? uid();
    const item: Reading = { id, number: row.number, title: row.title, subtitle: row.subtitle, categoryId: row.category_id, content, look };
    const idx = list.findIndex((r) => r.id === id);
    if (idx >= 0) list[idx] = item; else list.unshift(item);
    store(LOCAL_READINGS, list);
    await refresh(null);
    setSelectedId(id);
    return item;
  }
  // Import: each "Number:" block is saved as its own reading, in the selected category
  const [importText, setImportText] = useState("");
  const importPreview = useMemo(() => { const n = parseReadings(importText).length; return n ? `${n} reading${n === 1 ? "" : "s"} found` : ""; }, [importText]);
  async function importReadings() {
    const found = parseReadings(importText);
    if (!found.length) { say("No readings found. Each reading must start with “Number:”.", true); return; }
    if (supabase && !user) { say("Sign in to save readings.", true); return; }
    let saved = 0;
    for (const f of found) {
      const row = { number: f.number, title: f.title, subtitle: f.subtitle, category_id: categoryId || null, content: f.content, look };
      if (supabase && user) {
        const { error } = await supabase.from("readings").insert({ ...row, owner_id: user.id });
        if (error) { say(`Could not save reading ${f.number}: ${error.message}`, true); break; }
      } else {
        const list = load<Reading[]>(LOCAL_READINGS, []);
        list.unshift({ id: uid(), number: f.number, title: f.title, subtitle: f.subtitle, categoryId: row.category_id, content: f.content, look });
        store(LOCAL_READINGS, list);
      }
      saved++;
    }
    await refresh(user);
    if (saved === found.length) { setImportText(""); say(`${saved} reading${saved === 1 ? "" : "s"} saved.`); }
  }

  async function onSave() {
    if (await save()) say(supabase ? "Reading saved." : "Reading saved in this browser.");
  }
  async function onApprove() {
    if (await save()) say("Update approved and saved.");
  }
  function onDecline() {
    if (selected) fillForm(selected);
    say("Update not saved. The reading is back to its saved version.");
  }


  // ----- Categories: add, rename, reorder, delete (readings in a deleted category move to Other) -----
  function writeCategories(next: Category[]) {
    setCategories(next);
    if (!(supabase && user)) store(LOCAL_CATEGORIES, next); // signed in: rows are written by the caller
  }
  async function addCategory() {
    const name = newCat.trim();
    if (!name) return;
    if (supabase && user) {
      const { data, error } = await supabase.from("reading_categories").insert({ owner_id: user.id, name, sort_order: categories.length }).select("id, name, sort_order").single();
      if (error) { say("Could not add category: " + error.message, true); return; }
      setCategories((cur) => [...cur, { id: data.id, name: data.name, sort: data.sort_order }]);
    } else {
      writeCategories([...categories, { id: uid(), name, sort: categories.length }]);
    }
    setNewCat("");
  }
  async function renameCategory(c: Category) {
    const name = window.prompt("Rename category", c.name)?.trim();
    if (!name || name === c.name) return;
    if (supabase && user) {
      const { error } = await supabase.from("reading_categories").update({ name }).eq("id", c.id);
      if (error) { say("Could not rename: " + error.message, true); return; }
    }
    writeCategories(categories.map((x) => (x.id === c.id ? { ...x, name } : x)));
  }
  async function moveCategory(c: Category, dir: -1 | 1) {
    const i = categories.findIndex((x) => x.id === c.id);
    const j = i + dir;
    if (j < 0 || j >= categories.length) return;
    const next = categories.slice();
    [next[i], next[j]] = [next[j], next[i]];
    const withSort = next.map((x, k) => ({ ...x, sort: k }));
    const db = supabase;
    if (db && user) {
      await Promise.all([withSort[i], withSort[j]].map((x) => db.from("reading_categories").update({ sort_order: x.sort }).eq("id", x.id)));
    }
    writeCategories(withSort);
  }
  async function deleteCategory(c: Category) {
    if (!window.confirm(`Delete the category "${c.name}"? Its readings move to Other.`)) return;
    if (supabase && user) {
      const { error } = await supabase.from("reading_categories").delete().eq("id", c.id);
      if (error) { say("Could not delete: " + error.message, true); return; }
    } else {
      store(LOCAL_READINGS, load<Reading[]>(LOCAL_READINGS, []).map((r) => (r.categoryId === c.id ? { ...r, categoryId: null } : r)));
    }
    if (categoryId === c.id) setCategoryId("");
    if (filterCat === c.id) setFilterCat("");
    writeCategories(categories.filter((x) => x.id !== c.id));
    await refresh(user);
  }

  // ----- Formatting on the selected text (same behaviour as the Scripture text box) -----
  const active = () => {
    let at = sel.start;
    if (sel.end > sel.start) while (at < sel.end && tokenLenAt(content, at)) at += tokenLenAt(content, at);
    return fmtAt(content, at);
  };
  function put(text: string, start: number, end: number) {
    setContent(text);
    requestAnimationFrame(() => { const el = document.getElementById("rd-content"); if (el) setTextSelection(el, text, start, end); });
  }
  function needSelection() {
    if (sel.start === sel.end) { say("Select the text in the box first, then choose the formatting.", true); return true; }
    return false;
  }
  function applyMarker(token: string) {
    if (needSelection()) return;
    const r = toggleMarker(content, sel.start, sel.end, token);
    if (!r) return;
    const text = carryLines(r.text);
    put(text, r.start, r.end);
  }
  // Colours the selection, replacing an earlier colour; pressing the same colour again removes it
  function applyColor(hex: string, kind: "text" | "highlight") {
    if (needSelection()) return;
    const key = kind === "text" ? "c" : "h";
    let at = sel.start;
    while (at < sel.end && tokenLenAt(content, at)) at += tokenLenAt(content, at);
    const off = fmtAt(content, at)[key] === hex;
    const r = kind === "text"
      ? setColors(content, sel.start, sel.end, { c: off ? null : hex })
      : setColors(content, sel.start, sel.end, off ? { h: null, c: null } : { h: hex, c: contrastText(hex) });
    if (r) put(r.text, r.start, r.end);
  }
  function clearFormat() {
    if (needSelection()) return;
    const from = sel.start, to = sel.end;
    put(content.slice(0, from) + stripMarkers(content.slice(from, to)) + content.slice(to), from, from + stripMarkers(content.slice(from, to)).length);
  }

  // ----- Slides -----
  const slides = useMemo(() => readingSlides(content, look), [content, look]);
  const size = slides[0]?.size ?? 0;
  const [index, setIndex] = useState(0);
  const cur = Math.min(index, Math.max(0, slides.length - 1));
  useEffect(() => { setIndex(0); }, [selectedId]);

  function buildDeck(): ProjDeck {
    return {
      font: look.font, size, bg: look.bg, fg: look.fg, showLabels: false,
      slides: slides.map((s) => ({ rows: s.rows, segs: segsOf(s.rows).map((line) => line.map((seg) => ({ text: seg.text, f: seg.bold || seg.italic || seg.underline || seg.color || seg.highlight ? { bold: seg.bold, italic: seg.italic, underline: seg.underline, color: seg.color, highlight: seg.highlight } : null }))), size } as ProjSlide)),
    };
  }
  function present() {
    if (!slides.length) return;
    try { localStorage.setItem(PROJECTOR_KEY, JSON.stringify(buildDeck())); } catch { /* blocked */ }
    window.open(`${import.meta.env.BASE_URL}#projector`, "_blank");
  }
  function download() {
    if (!slides.length) return;
    downloadDeckPptx(buildDeck(), title || "Reading");
  }

  // ----- Presentation Builder -----
  const [addedList, setAddedList] = useState<{ id: string; title: string }[]>([]);
  function addToPresentation() {
    if (!slides.length) { say("Type or paste the reading first.", true); return; }
    const item = { kind: "reading", id: uid(), title: title.trim() || "Reading", categoryName: categoryId ? catName(categoryId) : "Other", font: look.font, bg: look.bg, fg: look.fg, size, slides: slides.map((s) => ({ rows: s.rows, size: s.size })) };
    try { sessionStorage.setItem(PENDING_BUILDER_KEY, JSON.stringify(item)); } catch { /* blocked */ }
    setAddedList((cur) => [{ id: item.id, title: item.title }, ...cur].slice(0, 20));
    setAddedNow((cur) => [...cur, item.id]);
    say(`Added "${item.title}" to the presentation. Open the Presentation Builder to arrange it.`);
  }

  return (
    <div className="rd">
      <NavBar />
      <div className="ly">
        <header className="ly-top">
          <div>
            <h1>Readings</h1>
            <p className="ly-sub">Church readings, responsive readings, prayers and other prepared passages.</p>
          </div>
          <div className="ly-top-actions">
            <button className="primary" onClick={present} disabled={!slides.length}>Present</button>
            <button className="secondary" onClick={download} disabled={!slides.length}>Download PowerPoint</button>
          </div>
        </header>

        <p className={statusIsError ? "status error" : "status"} role="status">{status}</p>

        <div className="ly-body">
          {/* Left: the library, the reading, its appearance */}
          <section className="ly-col ly-editor" aria-label="Reading editor">
            <div className="rd-picker-row">
              <select className="ly-saved" value={selectedId} onChange={(e) => fillForm(readings.find((r) => r.id === e.target.value) ?? null)} aria-label="Saved readings">
                <option value="">{readings.length ? "Choose a saved reading…" : "No saved readings yet"}</option>
                {q || filterCat ? (
                  <optgroup label={`Results (${visible.length})`}>
                    {visible.map((r) => <option key={r.id} value={r.id}>{label(r)}</option>)}
                  </optgroup>
                ) : (
                  <>
                    {favs.length > 0 && <optgroup label="Favourites">{favs.map((r) => <option key={r.id} value={r.id}>{label(r)}</option>)}</optgroup>}
                    {recents.length > 0 && <optgroup label="Recently used">{recents.map((r) => <option key={r.id} value={r.id}>{label(r)}</option>)}</optgroup>}
                    <optgroup label="All readings">{visible.map((r) => <option key={r.id} value={r.id}>{label(r)}</option>)}</optgroup>
                  </>
                )}
              </select>
                <select className="rd-filter" value={filterCat} onChange={(e) => setFilterCat(e.target.value)} aria-label="Filter by category">
    <option value="">All categories</option>
    {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
  </select>
              <button className="primary small" onClick={newReading}>+ New reading</button>
              <button className={`ly-star${selected && favorites.includes(selected.id) ? " on" : ""}`} onClick={() => selected && setFavorites((cur) => (cur.includes(selected.id) ? cur.filter((x) => x !== selected.id) : [...cur, selected.id]))} disabled={!selected} aria-label="Favourite this reading" aria-pressed={!!selected && favorites.includes(selected.id)}>★</button>
            </div>

            {pendingUpdate && (
              <div className="ly-approve" role="alert">
                <span><strong>Update this reading?</strong> You changed “{pendingUpdate.title || "this reading"}”.</span>
                <span className="ly-approve-actions">
                  <button className="primary small" onClick={onApprove}>Approve update</button>
                  <button className="secondary small" onClick={onDecline}>Don’t update</button>
                </span>
              </div>
            )}
            {selected && !owned && <p className="status">This reading belongs to someone else. Saving makes your own copy.</p>}

            <div className="ly-actions">
              <button className="secondary" onClick={onSave}>Save Reading</button>
              <button className="primary ly-add" onClick={addToPresentation} disabled={!slides.length}>{addedNow.length && selected && addedNow.includes(selected.id) ? "✓ Added" : "+ Add to Presentation"}</button>
            </div>
            <div className="rd-meta">
              <input value={number} onChange={(e) => setNumber(e.target.value)} placeholder="No." aria-label="Number" className="rd-num" />
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" aria-label="Reading title" className="rd-title" />
              <input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} placeholder="Subtitle / reference" aria-label="Subtitle" className="rd-sub" />
              <select value={categoryId || otherId} onChange={(e) => setCategoryId(e.target.value)} aria-label="Category" className="rd-cat">
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>

            <details className="ly-more">
              <summary>Import readings from text</summary>
              <div className="rd-import">
                <p className="status">Paste readings. Each one starts at a line “Number:”. The title, subtitle and “Verse N:” lines are detected. Several readings in one paste are saved as separate readings.</p>
                <textarea value={importText} onChange={(e) => setImportText(e.target.value)} rows={6} placeholder={"Number: 01\nTitle: …\nSubtitle: …\nVerse 1: …"} aria-label="Readings to import" />
                <div className="ly-actions">
                  <button className="primary small" onClick={importReadings} disabled={!importText.trim()}>Save readings</button>
                  <span className="status">{importPreview}</span>
                </div>
                      </div>
            </details>


            <div className="ly-lyrics-field">
              <label htmlFor="rd-content">Reading content <small className="rd-hint">(blank line = new paragraph and new slide)</small></label>
              <VerseTextBox id="rd-content" value={content} onChange={setContent} onSelect={(start, end) => setSel({ start, end })} numbers={false} />
            </div>


            {addedList.length > 0 && (
              <div className="ly-added">
                <strong>Added this session</strong>
                <ul>{addedList.map((a) => <li key={a.id}>{a.title}</li>)}</ul>
              </div>
            )}

            <details className="ly-appearance" open>
              <summary>Slide Appearance <span className="ly-summary">{look.font} · {look.perSlide} lines · {look.customSize ? `${look.customSize} pt` : "Automatic size"}</span></summary>
              <div className="ly-appearance-grid">
                <div className="ly-group rd-fmt">
                  <span className="ly-label">Formatting (select text in the box first)</span>
                  <div className="fmt-toolbar rd-tools" role="toolbar" aria-label="Formatting">
                    <button className={`tool${active().b ? " on" : ""}`} onClick={() => applyMarker("**")} aria-pressed={!!active().b} aria-label="Bold selected text" title="Bold selected text"><b>B</b></button>
                    <button className={`tool${active().i ? " on" : ""}`} onClick={() => applyMarker("~~")} aria-pressed={!!active().i} aria-label="Italic selected text" title="Italic selected text"><i>I</i></button>
                    <button className={`tool${active().u ? " on" : ""}`} onClick={() => applyMarker("__")} aria-pressed={!!active().u} aria-label="Underline selected text" title="Underline selected text"><u>U</u></button>
                    <button className="tool" onClick={clearFormat} aria-label="Clear formatting of selected text">Clear</button>
                  </div>
                  <div className="fmt-swatches" aria-label="Ready-made text colours">
                    {TEXT_COLOR_OPTIONS.map((c) => <button key={c} type="button" className="swatch" title={`Text ${c}`} aria-label={`Text colour ${c}`} style={{ color: c }} onClick={() => applyColor(c, "text")}>A</button>)}
                  </div>
                  <div className="fmt-swatches" aria-label="Ready-made highlight colours">
                    {HIGHLIGHT_OPTIONS.map((c) => <button key={c} type="button" className="swatch swatch-bg" title={`Highlight ${c}`} aria-label={`Highlight colour ${c}`} style={{ background: c }} onClick={() => applyColor(c, "highlight")}>A</button>)}
                  </div>
                </div>
                <div className="ly-group">
                  <label htmlFor="rd-font">Font</label>
                  <select id="rd-font" value={look.font} onChange={(e) => setLook({ ...look, font: e.target.value })}>
                    {FONTS.map((f) => <option key={f} value={f}>{f}</option>)}
                  </select>
                  <label htmlFor="rd-per">Maximum lines per slide</label>
                  <select id="rd-per" value={look.perSlide} onChange={(e) => setLook({ ...look, perSlide: parseInt(e.target.value, 10) })}>
                    {Array.from({ length: 14 }, (_, k) => k + 2).map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                  <span className="ly-label">Font size</span>
                  <div className="ly-size-mode">
                    <label><input type="radio" name="rdSize" checked={!look.customSize} onChange={() => setLook({ ...look, customSize: 0 })} /> Automatic</label>
                    <label><input type="radio" name="rdSize" checked={!!look.customSize} onChange={() => setLook({ ...look, customSize: look.customSize || 60 })} /> Manual</label>
                  </div>
                  <div className="ly-slider">
                    <input type="range" min={20} max={200} step={1} disabled={!look.customSize} value={look.customSize || 60} onChange={(e) => setLook({ ...look, customSize: parseInt(e.target.value, 10) })} aria-label="Font size in points" />
                    <output>{look.customSize ? `${look.customSize} pt` : "Auto"}</output>
                  </div>
                </div>
                <div className="ly-group">
                  <div className="ly-presets" role="group" aria-label="Recommended colours">
                    {COLOR_PRESETS.map((p) => <button key={p.name} type="button" className={`ly-preset${look.bg === p.bg && look.fg === p.fg ? " on" : ""}`} title={p.name} aria-label={p.name} style={{ background: p.bg, color: p.fg }} onClick={() => setLook({ ...look, bg: p.bg, fg: p.fg })}>Aa</button>)}
                  </div>
                  <div className="ly-colors">
                    <label>Background <input type="color" value={look.bg} onChange={(e) => setLook({ ...look, bg: e.target.value })} /></label>
                    <label>Text <input type="color" value={look.fg} onChange={(e) => setLook({ ...look, fg: e.target.value })} /></label>
                  </div>
                </div>
              </div>
            </details>

            <details className="ly-more">
              <summary>Manage categories</summary>
              <div className="rd-cats">
                {categories.map((c, i) => (
                  <div key={c.id} className="rd-cat-row">
                    <span>{c.name}</span>
                    <button className="secondary small" onClick={() => moveCategory(c, -1)} disabled={i === 0} aria-label={`Move ${c.name} up`}>↑</button>
                    <button className="secondary small" onClick={() => moveCategory(c, 1)} disabled={i === categories.length - 1} aria-label={`Move ${c.name} down`}>↓</button>
                    <button className="secondary small" onClick={() => renameCategory(c)}>Rename</button>
                    <button className="secondary small danger" onClick={() => deleteCategory(c)}>Delete</button>
                  </div>
                ))}
                <div className="rd-cat-row">
                  <input value={newCat} onChange={(e) => setNewCat(e.target.value)} placeholder="New category" aria-label="New category name" />
                  <button className="secondary small" onClick={addCategory} disabled={!newCat.trim()}>Add</button>
                </div>
              </div>
            </details>
          </section>

          {/* Right: the preview */}
          <section className="ly-col ly-preview" aria-label="Slide preview">
            <div className="ly-preview-head"><h2>Slide Preview</h2><span className="ly-sub">Generated from the current text</span></div>
            {slides.length ? (
              <>
                <div className="pv-big" style={{ background: look.bg, color: look.fg, fontFamily: `${look.font}, sans-serif` }}>
                  <span className="pv-num">{cur + 1}</span>
                  <span className="pv-text" style={{ fontSize: `${(size / 960) * 100}cqw` }}><RowText rows={slides[cur].rows} /></span>
                </div>
                <div className="row">
                  <button className="secondary small" onClick={() => setIndex(Math.max(0, cur - 1))} disabled={cur === 0}>← Previous</button>
                  <span>{cur + 1} / {slides.length}</span>
                  <button className="secondary small" onClick={() => setIndex(Math.min(slides.length - 1, cur + 1))} disabled={cur >= slides.length - 1}>Next →</button>
                </div>
                <div className="pv-cards">
                  {slides.map((s, i) => (
                    <button key={i} type="button" className={`pv-card${cur === i ? " current" : ""}`} style={{ background: look.bg, color: look.fg, fontFamily: `${look.font}, sans-serif` }} onClick={() => setIndex(i)} aria-label={`Slide ${i + 1}`}>
                      <span className="pv-num">{i + 1}</span>
                      <span className="pv-text" style={{ fontSize: `${(s.size / 960) * 100}cqw` }}><RowText rows={s.rows} /></span>
                    </button>
                  ))}
                </div>
              </>
            ) : <p className="empty">Nothing to preview yet.</p>}
          </section>
        </div>
      </div>
    </div>
  );
}
