import { useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { onAuthChange, supabase } from "../lib/supabase";
import { cacheReadingCategories, cacheReadings, loadCachedReadingCategories, loadCachedReadings } from "../lib/offlineCache";
import { parseRows, readingCategoryRowSchema, readingRowSchema } from "../lib/schemas";
import { QUEUED_NOTE, newId, saveRow } from "../lib/outbox";
import SlideshowStrip from "../components/SlideshowStrip";
import { queueReading, recordAdded } from "../lib/slideshowQueue";
import NavBar from "../components/NavBar";
import { toast } from "../lib/toast";
import { COLOR_PRESETS, FONTS, RECOMMENDED_PT, SCRIPTURE_BOX_H, SCRIPTURE_BOX_W, SLIDE_PAD, browserMeasure, layoutPassage, passageAutoSize } from "../lib/slides";
import { carryLines, contrastText, HIGHLIGHT_OPTIONS, parseRich, setColors, stripMarkers, TEXT_COLOR_OPTIONS, toggleMarker, type RichSeg } from "../lib/richtext";
import { fmtAt, tokenLenAt } from "../lib/richeditor";
import { setTextSelection, VerseTextBox } from "../components/RichTextBox";
import { downloadDeckPptx } from "../lib/pptx";
import type { ProjDeck, ProjSlide } from "./Projector";

// Readings V2: the Readings page in the Lyric V2 layout (find | edit | check). Same data and storage as Readings.
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

const load = <T,>(key: string, fallback: T): T => { try { return JSON.parse(localStorage.getItem(key) || "null") ?? fallback; } catch { return fallback; } };
const store = (key: string, v: unknown) => { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* storage blocked */ } };
const uid = () => Math.random().toString(36).slice(2, 10);

// Paragraphs are separated by blank lines. Each paragraph starts a new slide (never mixed with the next one).
export function readingSlides(content: string, look: ReadingLook): { rows: string[]; size: number; tooWide: string[] }[] {
  const paragraphs = content.split(/\n\s*\n/).map((p) => p.split("\n").map((l) => l.trim()).filter(Boolean)).filter((p) => p.length);
  const all = paragraphs.flat();
  if (!all.length) return [];
  // One font size for the whole reading, measured in the browser; words wrap and each paragraph fills the slides it needs
  const measure = browserMeasure(look.font);
  const size = look.customSize > 0 ? look.customSize : passageAutoSize(all.join(" ").split(/\s+/).filter(Boolean), look.font, RECOMMENDED_PT, measure);
  return paragraphs.flatMap((p) => {
    const words = p.join(" ").split(/\s+/).filter(Boolean);
    const { slides: laid, tooWide } = layoutPassage(words, look.font, size, SCRIPTURE_BOX_W, SCRIPTURE_BOX_H, measure);
    return laid.map((rows, k) => ({ rows, size, tooWide: k === 0 ? tooWide : [] }));
  });
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

export default function ReadingsV2() {
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
  const [, setStatus] = useState("");
  const [, setStatusIsError] = useState(false);
  const [, setAddedNow] = useState<string[]>([]);
  const [newCat, setNewCat] = useState("");
  const [sel, setSel] = useState({ start: 0, end: 0 });
  const seedingFor = useRef<string | null>(null);
  const user = session?.user ?? null;

  const say = (msg: string, error = false) => { setStatus(msg); setStatusIsError(error); toast(msg, error); };

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
      if (r.error) {
        // Offline: show the readings saved on this device
        const savedReadings = await loadCachedReadings();
        const savedCats = await loadCachedReadingCategories();
        if (savedReadings.length) {
          setReadings(savedReadings.map((x) => ({ id: x.id, number: x.number, title: x.title, subtitle: x.subtitle, categoryId: x.categoryId, content: x.content, look: (x.look ?? {}) as Reading["look"], owner: x.owner ?? "" })));
          setCategories(savedCats.map((x) => ({ id: x.id, name: x.name, sort: x.sort })));
          say("Offline: showing the readings saved on this device.");
        } else {
          say("Could not load readings: " + r.error.message, true);
        }
        return;
      }
      const parsedReadings = parseRows(readingRowSchema, r.data ?? []);
      const rows = parsedReadings.rows.map((x) => ({ id: x.id, number: x.number, title: x.title, subtitle: x.subtitle, categoryId: x.category_id, content: x.content, look: x.look as Reading["look"], owner: x.owner_id }));
      setReadings(rows);
      void cacheReadings(rows);
      if (parsedReadings.dropped) say(`${parsedReadings.dropped} reading${parsedReadings.dropped === 1 ? "" : "s"} could not be read and ${parsedReadings.dropped === 1 ? "was" : "were"} skipped.`, true);
      const parsedCats = parseRows(readingCategoryRowSchema, c.data ?? []);
      let cats: Category[] = parsedCats.rows.map((x) => ({ id: x.id, name: x.name, sort: x.sort_order }));
      if (u && !cats.length) {
        // Seed once per user: two loads can run at the same time (session check and auth event)
        if (seedingFor.current === u.id) return;
        seedingFor.current = u.id;
        const rows = SEED_CATEGORIES.map((name, i) => ({ owner_id: u.id, name, sort_order: i }));
        const { data: seeded } = await supabase.from("reading_categories").insert(rows).select("id, name, sort_order");
        cats = (seeded ?? []).map((x) => ({ id: x.id, name: x.name, sort: x.sort_order }));
      }
      setCategories(cats);
      if (u && cats.length) void cacheReadingCategories(cats.map((x) => ({ id: x.id, name: x.name, sort: x.sort })));
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
    const unsubAuth = onAuthChange((s) => { setSession(s); refresh(s?.user ?? null); });
    return unsubAuth;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => store(FAV_KEY, favorites), [favorites]);
  useEffect(() => store(RECENT_KEY, recent), [recent]);

  const catName = (id: string | null) => categories.find((c) => c.id === id)?.name ?? "Other";

  // Library: search, category filter, favourites, recent
  const q = query.trim().toLowerCase();
  // "Other" is the seeded category; readings with no category also count as Other
  const otherId = categories.find((c) => c.name === "Other")?.id ?? "";
  // Ascending by number (numeric, so 2 comes before 10); readings without a number go last, then by title
  const byNumber = (x: Reading, y: Reading) => {
    const nx = parseFloat(x.number), ny = parseFloat(y.number);
    const hx = !isNaN(nx), hy = !isNaN(ny);
    if (hx !== hy) return hx ? -1 : 1;
    if (hx && hy && nx !== ny) return nx - ny;
    return (x.title || "").localeCompare(y.title || "", undefined, { numeric: true });
  };
  const visible = readings.filter((r) => {
    if (filterCat && filterCat === otherId ? !(r.categoryId === null || r.categoryId === otherId) : filterCat && r.categoryId !== filterCat) return false;
    return !q || `${r.title} ${r.content}`.toLowerCase().includes(q);
  }).sort(byNumber);
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
      const id = existing ? existing.id : newId();
      const r = existing
        ? await saveRow({ table: "readings", op: "update", id, data: row })
        : await saveRow({ table: "readings", op: "insert", id, data: { ...row, owner_id: user.id } });
      if (r.status === "error") { say("Could not save: " + r.message, true); return null; }
      const saved: Reading = { id, number: row.number, title: row.title, subtitle: row.subtitle, categoryId: row.category_id, content, look, owner: user.id };
      if (r.status === "queued") {
        // No connection: show the reading now; it uploads when the device is back online
        setReadings((cur) => (cur.some((x) => x.id === saved.id) ? cur.map((x) => (x.id === saved.id ? saved : x)) : [saved, ...cur]));
        say(QUEUED_NOTE);
      } else {
        await refresh(user);
      }
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
      const id = newId();
      const r = await saveRow({ table: "reading_categories", op: "insert", id, data: { owner_id: user.id, name, sort_order: categories.length } });
      if (r.status === "error") { say("Could not add category: " + r.message, true); return; }
      setCategories((cur) => [...cur, { id, name, sort: categories.length }]);
      if (r.status === "queued") say(QUEUED_NOTE);
    } else {
      writeCategories([...categories, { id: uid(), name, sort: categories.length }]);
    }
    setNewCat("");
  }
  async function renameCategory(c: Category) {
    const name = window.prompt("Rename category", c.name)?.trim();
    if (!name || name === c.name) return;
    if (supabase && user) {
      const r = await saveRow({ table: "reading_categories", op: "update", id: c.id, data: { name } });
      if (r.status === "error") { say("Could not rename: " + r.message, true); return; }
      if (r.status === "queued") say(QUEUED_NOTE);
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
    if (supabase && user) {
      const results = await Promise.all([withSort[i], withSort[j]].map((x) => saveRow({ table: "reading_categories", op: "update", id: x.id, data: { sort_order: x.sort } })));
      const failed = results.find((r) => r.status === "error");
      if (failed && failed.status === "error") { say("Could not move: " + failed.message, true); return; }
      if (results.some((r) => r.status === "queued")) say(QUEUED_NOTE);
    }
    writeCategories(withSort);
  }
  async function deleteCategory(c: Category) {
    if (!window.confirm(`Delete the category "${c.name}"? Its readings move to Other.`)) return;
    if (supabase && user) {
      const r = await saveRow({ table: "reading_categories", op: "delete", id: c.id });
      if (r.status === "error") { say("Could not delete: " + r.message, true); return; }
      if (r.status === "queued") say(QUEUED_NOTE);
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
    requestAnimationFrame(() => { const el = document.getElementById("rv2-content"); if (el) setTextSelection(el, text, start, end); });
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
      slides: slides.map((s) => ({ rows: s.rows, pad: SLIDE_PAD, segs: segsOf(s.rows).map((line) => line.map((seg) => ({ text: seg.text, f: seg.bold || seg.italic || seg.underline || seg.color || seg.highlight ? { bold: seg.bold, italic: seg.italic, underline: seg.underline, color: seg.color, highlight: seg.highlight } : null }))), size } as ProjSlide)),
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
  // "✓ Added" on the button for a moment after each add
  const [justAdded, setJustAdded] = useState(false);
  function addToPresentation() {
    if (!slides.length) { say("Type or paste the reading first.", true); return; }
    const item = { kind: "reading", id: uid(), title: title.trim() || "Reading", categoryName: categoryId ? catName(categoryId) : "Other", font: look.font, bg: look.bg, fg: look.fg, size, slides: slides.map((s) => ({ rows: s.rows, size: s.size })) };
    // Every added reading waits for the Builder (before, a second reading replaced the first)
    queueReading(item);
    recordAdded({ id: item.id, kind: "reading", label: item.title });
    // Keep the newest 8 additions for the Builder's Recent readings list
    try {
      const log = JSON.parse(localStorage.getItem("addedReadingsLog") || "[]") as unknown[];
      localStorage.setItem("addedReadingsLog", JSON.stringify([item, ...log.filter((x) => (x as { id?: string }).id !== item.id)].slice(0, 8)));
    } catch { /* storage blocked */ }
    setAddedList((cur) => [{ id: item.id, title: item.title }, ...cur].slice(0, 20));
    setAddedNow((cur) => [...cur, item.id]);
    setJustAdded(true);
    window.setTimeout(() => setJustAdded(false), 2500);
    say(`✓ Added "${item.title}" to the presentation. Open the Presentation Builder to arrange it.`);
  }

  const isFav = !!selected && favorites.includes(selected.id);
  const [libOpen, setLibOpen] = useState(false); // phone only: the list is folded until a reading is chosen
  const toggleFav = () => selected && setFavorites((cur) => (cur.includes(selected.id) ? cur.filter((x) => x !== selected.id) : [...cur, selected.id]));
  const rowName = (r: Reading) => `${r.number ? r.number + ". " : ""}${r.title || (r.content.split("\n").find((l) => l.trim()) || "(untitled)").slice(0, 40)}`;
  const row = (r: Reading, group: string) => (
    <li key={`${group}-${r.id}`}>
      <button type="button" className="lv2-song" aria-current={r.id === selectedId ? "true" : undefined} onClick={() => { if (r.id !== selectedId) fillForm(r); setLibOpen(false); }}>
        <span className="lv2-song-name">{rowName(r)}</span>
        <span className="lv2-song-meta">{r.categoryId ? catName(r.categoryId) : "Other"}</span>
      </button>
    </li>
  );
  const pickerEmpty = !readings.length ? "No saved readings yet. Type a reading and save it to start the list." : !visible.length ? "No readings in this category." : "";

  return (
    <>
      <NavBar />
    <div className="lv2 rl">
      <header className="lv2-top">
        <div>
          <h1>Readings</h1>
        </div>
        <SlideshowStrip inline extra={addedList.slice().reverse().map((a) => ({ id: a.id, label: a.title, kind: "reading" as const }))} />
        <div className="lv2-top-actions lv2-top-actions-desk">
          <button className="secondary" onClick={download} disabled={!slides.length}>Download PowerPoint</button>
          <button className="primary" onClick={present} disabled={!slides.length}>Present</button>
        </div>
      </header>


      <div className="lv2-grid">
        {/* Find a reading */}
        <aside className={`lv2-card lv2-lib${libOpen ? " open" : ""}`} aria-label="Reading library">
          <div className="lv2-step-head"><span className="lv2-step-n">1</span><h2>Choose a reading</h2></div>
          {/* Phone: one row showing the current reading; the list opens from it */}
          <button type="button" className="lv2-lib-toggle" aria-expanded={libOpen} onClick={() => setLibOpen((v) => !v)}>
            <span className="lv2-lib-current">{selected ? rowName(selected) : "Choose a reading"}</span>
            <span className="lv2-lib-chev" aria-hidden="true">{libOpen ? "▴" : "▾"}</span>
          </button>
          <div className="lv2-lib-head">
            <select className="rd-filter" value={filterCat} onChange={(e) => setFilterCat(e.target.value)} aria-label="Filter by category">
              <option value="">All categories</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <button type="button" className="secondary lv2-new" onClick={newReading}>+ New reading</button>
          </div>
          <ul className="lv2-songs">
            {pickerEmpty && <li className="lv2-list-note">{pickerEmpty}</li>}
            {filterCat ? (
              <>
                {visible.length > 0 && <li className="lv2-group">Results ({visible.length})</li>}
                {visible.map((r) => row(r, "res"))}
              </>
            ) : (
              <>
                {favs.length > 0 && <li className="lv2-group">Favourites</li>}
                {favs.map((r) => row(r, "fav"))}
                {recents.length > 0 && <li className="lv2-group">Recently used</li>}
                {recents.map((r) => row(r, "rec"))}
                {visible.length > 0 && <li className="lv2-group">All readings</li>}
                {visible.map((r) => row(r, "all"))}
              </>
            )}
          </ul>
        </aside>

        {/* Edit the reading */}
        <section className="lv2-card lv2-editor" aria-label="Reading editor">
          <div className="lv2-step-head"><span className="lv2-step-n">2</span><h2>Check the words</h2><span className="lv2-sub">Edit, then save</span></div>
          <div className="lv2-title-row">
            <input className="lv2-title" aria-label="Reading title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Reading title" />
            <input className="lv2-number" aria-label="Number" value={number} onChange={(e) => setNumber(e.target.value)} placeholder="No." />
            <button type="button" className={`lv2-star${isFav ? " on" : ""}`} onClick={toggleFav} disabled={!selected} aria-label="Favourite this reading" aria-pressed={isFav} title={selected ? "Favourite" : "Save or choose a reading to favourite it"}>★</button>
          </div>
          <div className="lv2-meta-row">
            <input aria-label="Subtitle" value={subtitle} onChange={(e) => setSubtitle(e.target.value)} placeholder="Subtitle / reference" className="lv2-subtitle" />
            <select aria-label="Category" value={categoryId || otherId} onChange={(e) => setCategoryId(e.target.value)}>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          {pendingUpdate && (
            <div className="lv2-approve" role="alert">
              <span><strong>Update this reading?</strong> You changed “{pendingUpdate.title || "this reading"}”.</span>
              <span className="lv2-approve-actions">
                <button className="primary small" onClick={onApprove}>Approve update</button>
                <button className="secondary small" onClick={onDecline}>Don’t update</button>
              </span>
            </div>
          )}
          {selected && !owned && <p className="lv2-status">This reading belongs to someone else. Saving makes your own copy.</p>}

          <div className="lv2-lyrics-field">
            <label className="lv2-field-label" htmlFor="rv2-content">Reading content <span className="lv2-sub">(blank line = new paragraph and new slide)</span></label>
            <VerseTextBox id="rv2-content" value={content} onChange={setContent} onSelect={(start, end) => setSel({ start, end })} numbers={false} />
          </div>


          {addedList.length > 0 && (
            <div className="lv2-added">
              <span className="lv2-added-label">Added this session ({addedList.length})</span>
              <ul>{addedList.map((a) => <li key={a.id}>{a.title}</li>)}</ul>
            </div>
          )}

          <div className="rv2-dock">
          <div className="lv2-actions rv2-actions-dock">
            <span className="lv2-actions-end">
              <button className="secondary" onClick={onSave}>Save Reading</button>
            </span>
          </div>
          <details className="lv2-appearance" open>
            <summary>Slide Appearance <span className="lv2-summary">{look.font} · {look.customSize ? `${look.customSize} pt` : "Automatic size"}</span></summary>
            {slides.some((x) => x.tooWide.length > 0) && <p className="sc-warn" role="alert">A word is too wide for the slide at this size. Reduce the font size.</p>}
            <div className="lv2-appearance-grid">
              <div className="lv2-group rv2-line">
                <span className="lv2-field-label" title="Select text in the box first, then pick a style">Format</span>
                <div className="rv2-row">
                <div className="fmt-toolbar" role="toolbar" aria-label="Formatting">
                  <button className={`tool${active().b ? " on" : ""}`} onClick={() => applyMarker("**")} aria-pressed={!!active().b} aria-label="Bold selected text" title="Bold selected text"><b>B</b></button>
                  <button className={`tool${active().i ? " on" : ""}`} onClick={() => applyMarker("~~")} aria-pressed={!!active().i} aria-label="Italic selected text" title="Italic selected text"><i>I</i></button>
                  <button className={`tool${active().u ? " on" : ""}`} onClick={() => applyMarker("__")} aria-pressed={!!active().u} aria-label="Underline selected text" title="Underline selected text"><u>U</u></button>
                  <button className="tool" onClick={clearFormat} aria-label="Clear formatting of selected text">Clear</button>
                </div>
                <div className="fmt-swatches" aria-label="Ready-made text colours">
                  {TEXT_COLOR_OPTIONS.map((c) => <button key={c} type="button" className="swatch" title={`Text ${c}`} aria-label={`Text colour ${c}`} style={{ color: c }} onClick={() => applyColor(c, "text")}>A</button>)}
                </div>
                </div>
              </div>
              <div className="lv2-group rv2-line">
                <span className="lv2-field-label">Highlight</span>
                <div className="rv2-row">
                <div className="fmt-swatches" aria-label="Ready-made highlight colours">
                  {HIGHLIGHT_OPTIONS.map((c) => <button key={c} type="button" className="swatch swatch-bg" title={`Highlight ${c}`} aria-label={`Highlight colour ${c}`} style={{ background: c }} onClick={() => applyColor(c, "highlight")}>A</button>)}
                </div>
                </div>
              </div>
              <div className="lv2-group rv2-line">
                <span className="lv2-field-label">Type</span>
                <div className="rv2-row">
                  <select id="rv2-font" aria-label="Font" value={look.font} onChange={(e) => setLook({ ...look, font: e.target.value })}>
                    {FONTS.map((f) => <option key={f} value={f}>{f}</option>)}
                  </select>
                  <div className="lv2-size-mode" role="radiogroup" aria-label="Font size mode">
                    <label><input type="radio" name="rv2Size" checked={!look.customSize} onChange={() => setLook({ ...look, customSize: 0 })} /> Auto</label>
                    <label><input type="radio" name="rv2Size" checked={!!look.customSize} onChange={() => setLook({ ...look, customSize: look.customSize || 60 })} /> Manual</label>
                  </div>
                  <div className="lv2-slider rl-qsize">
                    <button type="button" className="rl-qb" aria-label="Smaller text" onClick={() => setLook({ ...look, customSize: Math.max(20, (look.customSize || 60) - 2) })}>A−</button>
                    <input type="range" min={20} max={200} step={1} disabled={!look.customSize} value={look.customSize || 60} onChange={(e) => setLook({ ...look, customSize: parseInt(e.target.value, 10) })} aria-label="Font size in points" />
                    <button type="button" className="rl-qb" aria-label="Larger text" onClick={() => setLook({ ...look, customSize: Math.min(200, (look.customSize || 60) + 2) })}>A+</button>
                    {look.customSize ? <output>{look.customSize} pt</output> : null}
                  </div>
                  <button type="button" className="lv2-quick" onClick={() => setLook({ ...look, customSize: RECOMMENDED_PT })}>Recommended {RECOMMENDED_PT} pt</button>
                </div>
              </div>
              <div className="lv2-group rv2-line">
                <span className="lv2-field-label">Theme</span>
                <div className="rv2-row">
                <div className="lv2-presets" role="group" aria-label="Recommended colours">
                  {COLOR_PRESETS.map((p) => <button key={p.name} type="button" className={`lv2-preset${look.bg === p.bg && look.fg === p.fg ? " on" : ""}`} title={p.name} aria-label={p.name} aria-pressed={look.bg === p.bg && look.fg === p.fg} style={{ background: p.bg, color: p.fg }} onClick={() => setLook({ ...look, bg: p.bg, fg: p.fg })}>Aa</button>)}
                </div>
                <div className="lv2-colors">
                  <label>Bg <input type="color" value={look.bg} onChange={(e) => setLook({ ...look, bg: e.target.value })} /></label>
                  <label>Text <input type="color" value={look.fg} onChange={(e) => setLook({ ...look, fg: e.target.value })} /></label>
                </div>
                </div>
              </div>
            </div>
          </details>
          </div>

          <details className="lv2-appearance lv2-cats">
            <summary>Manage categories</summary>
            <div className="lv2-cat-list">
              {categories.map((c, i) => (
                <div key={c.id} className="lv2-cat-row">
                  <span>{c.name}</span>
                  <button className="secondary small" onClick={() => moveCategory(c, -1)} disabled={i === 0} aria-label={`Move ${c.name} up`}>↑</button>
                  <button className="secondary small" onClick={() => moveCategory(c, 1)} disabled={i === categories.length - 1} aria-label={`Move ${c.name} down`}>↓</button>
                  <button className="secondary small" onClick={() => renameCategory(c)}>Rename</button>
                  <button className="secondary small danger" onClick={() => deleteCategory(c)}>Delete</button>
                </div>
              ))}
              <div className="lv2-cat-row">
                <input value={newCat} onChange={(e) => setNewCat(e.target.value)} placeholder="New category" aria-label="New category name" />
                <button className="secondary small" onClick={addCategory} disabled={!newCat.trim()}>Add</button>
              </div>
            </div>
          </details>
        </section>

        {/* Check the slides */}
        <aside className={`lv2-card lv2-preview${slides.length ? "" : " empty"}`} aria-label="Slide preview">
          <div className="lv2-preview-head"><div className="lv2-step-head lv2-preview-row"><span className="lv2-step-n">3</span><h2>Preview the slides</h2>
            {/* Wider screens: Add to Presentation on the heading's row (phones keep it at the bottom of the preview) */}
            <button className={`primary lv2-add lv2-add-head${justAdded ? " flash" : ""}`} onClick={addToPresentation} disabled={!slides.length}>{justAdded ? "✓ Added" : "+ Add to Presentation"}</button>
          </div><span className="lv2-sub">Generated from the current text</span></div>
          {slides.length ? (
            <>
              <div className="lv2-stage" style={{ background: look.bg, color: look.fg, fontFamily: `${look.font}, sans-serif` }}>
                <span className="lv2-stage-num">{cur + 1}</span>
                <div className="lv2-stage-text" style={{ fontSize: `${(size / 960) * 100}cqw` }}><RowText rows={slides[cur].rows} /></div>
              </div>
              <div className="lv2-preview-actions">
                <button className="primary small" onClick={present} disabled={!slides.length}>Present</button>
                <button className="secondary small lv2-dl" onClick={download} disabled={!slides.length}>Download PowerPoint</button>
              </div>
              <div className="lv2-nav">
                <button className="secondary small" onClick={() => setIndex(Math.max(0, cur - 1))} disabled={cur === 0}>← Previous</button>
                <span className="lv2-counter">Slide {cur + 1} of {slides.length}</span>
                <button className="secondary small" onClick={() => setIndex(Math.min(slides.length - 1, cur + 1))} disabled={cur >= slides.length - 1}>Next →</button>
              </div>
              <div className="lv2-thumbs" role="list">
                {slides.map((s, i) => (
                  <button key={i} type="button" role="listitem" className={`lv2-thumb${cur === i ? " current" : ""}`} style={{ background: look.bg, color: look.fg, fontFamily: `${look.font}, sans-serif` }} onClick={() => setIndex(i)} aria-label={`Slide ${i + 1}`} aria-current={cur === i ? "true" : undefined}>
                    <span className="lv2-thumb-num">{i + 1}</span>
                    <span className="lv2-thumb-text" style={{ fontSize: `${(s.size / 960) * 100}cqw` }}><RowText rows={s.rows} /></span>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div className="lv2-stage lv2-guide" aria-label="How to start">
              <ol>
                <li>Type or paste the reading, or import several readings.</li>
                <li>Use a blank line to start a new slide.</li>
                <li>Choose the look in Slide Appearance.</li>
                <li>Save the reading.</li>
                <li>Click <strong>Add to Presentation</strong>.</li>
              </ol>
            </div>
          )}

          <button className={`primary lv2-add lv2-add-bottom${justAdded ? " flash" : ""}`} onClick={addToPresentation} disabled={!slides.length}>{justAdded ? "✓ Added" : "+ Add to Presentation"}</button>
        </aside>
      </div>
    </div>
    </>
  );
}
