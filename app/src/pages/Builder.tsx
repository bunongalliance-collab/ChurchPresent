import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import NavBar from "../components/NavBar";
import { buildDeck, deckSize, flowLines, FONTS, type Slide } from "../lib/slides";
import { PROJECTOR_KEY, type ProjDeck } from "./Projector";
import { buildOutput } from "./Scripture";
import type { SlideFmt, Seg } from "./Projector";
import { carryFormattingSlides, markVerses, parseRich, VERSE_SPLIT } from "../lib/richtext";
import { toast } from "../lib/toast";

// Formatted segments for the projector and preview, from the slide text
const toSegs = (rows: string[]): Seg[][] => rows.map((r) => parseRich(r).map((seg) => ({
  text: seg.text,
  f: seg.bold || seg.italic || seg.underline || seg.color || seg.highlight ? { bold: seg.bold, italic: seg.italic, underline: seg.underline, color: seg.color, highlight: seg.highlight } : null,
})));

// ---------- Data model ----------
// A presentation is one ordered list of items. A song item keeps its own copy of the lyrics and the
// slides generated from them, so editing a slide never changes the library song.
interface SongItem {
  libraryLook?: string;  // the library song's look when this was added or refreshed (to spot changes)
  kind: "song";
  id: string;
  songId: string;
  title: string;
  number: string;
  lyrics: string;      // snapshot taken when added
  slides: string[][];  // generated from the snapshot, with labels in slideLabels
  slideLabels: string[];
  look: { bg: string; fg: string; font: string };  // this song's own colours and font
  size: number;        // font size (pt) worked out for this song's slides
  libraryChanged?: boolean;
}
interface CustomItem {
  kind: "custom";
  id: string;
  title: string;
  text: string;        // one line per row
}
// A saved scripture study, added as one block with its slides in order
interface ScriptureItem {
  kind: "scripture";
  id: string;
  studyId: string;
  title: string;
  slides: { rows: string[]; label: string; ref?: string; verse: boolean; fmt?: SlideFmt; bg?: string; fg?: string; font?: string; size?: number; numColor?: string }[];
  numColor: string;
  labelColor: string;
  size: number;
}
interface RecentStudy { id: string; title: string; updated: string; data: Record<string, unknown> }
// A reading (non-song passage) added from the Readings page
interface ReadingItem {
  kind: "reading";
  id: string;
  title: string;
  categoryName: string;
  font: string;
  bg: string;
  fg: string;
  size: number;
  slides: { rows: string[]; size: number }[];
}
export type Item = SongItem | CustomItem | ScriptureItem | ReadingItem;

export interface Settings {
  font: string;
  perSlide: number;
  bg: string;
  fg: string;
  showLabels: boolean;
  removeRepeats: boolean;
}
export interface PresentationData extends Settings {
  serviceDate?: string;  // the service date, set on the Presentations page
  items: Item[];
}
export interface Presentation {
  id: string;
  title: string;
  data: PresentationData;
}
interface LibrarySong { id: string; title: string; number: string; lyrics: string; look?: Partial<Settings> & { bg?: string; fg?: string; customSize?: number } }

const DEFAULT_SETTINGS: Settings = {
  font: "Arial", perSlide: 4, bg: "#213648", fg: "#f5f2ea", showLabels: true, removeRepeats: false,
};
const uid = () => Math.random().toString(36).slice(2, 10);
const DRAFT_KEY = "builderDraft";
const RETURN_KEY = "returnToBuilder";
function loadDraft(): { settings?: Settings; items?: Item[]; title?: string; currentId?: string } | null {
  try { return JSON.parse(sessionStorage.getItem(DRAFT_KEY) || "null"); } catch { return null; }
}
const LOCAL_KEY = "presentationsLocal";

// Make slides for one song with the shared engine (same as the Lyrics page)
function slidesForSong(lyrics: string, title: string, number: string, s: Settings & { customSize?: number }) {
  const deck = buildDeck({
    lyrics, font: s.font, perSlide: s.perSlide, removeRepeats: s.removeRepeats,
    showTitle: false, songTitle: title, songNumber: number, customSize: s.customSize ?? 0,
  });
  return {
    slides: deck.slides.map((sl) => [...sl]),
    slideLabels: deck.slides.map((sl) => sl.label ?? ""),
    size: deck.size,
  };
}

// Flatten the sequence into projector slides, in order. Each song keeps its own size.
export function flatten(items: Item[], s: Settings, size: number): ProjDeck {
  const slides: ProjDeck["slides"] = [];
  for (const it of items) {
    if (it.kind === "reading") {
      it.slides.forEach((sl) => slides.push({ label: "", rows: sl.rows, segs: toSegs(sl.rows), verse: false, size: sl.size || it.size, bg: it.bg, fg: it.fg, font: it.font }));
    } else if (it.kind === "scripture") {
      it.slides.forEach((sl) => slides.push({ label: sl.label, ref: sl.ref, rows: sl.rows, segs: toSegs(sl.rows ?? []), verse: sl.verse, fmt: sl.fmt, numColor: sl.numColor ?? it.numColor, size: sl.size ?? it.size, bg: sl.bg, fg: sl.fg, font: sl.font }));
    } else if (it.kind === "custom") {
      // Custom slides get the same verse-number marks as scripture
      // Text that is too long for one slide flows onto the next slides (same engine as Scripture and Lyrics)
      const lines = it.text.split("\n").filter((l) => l.trim()).map((l) => markVerses(l, true));
      // With no size given, use the automatic size for this text (same as the rest of the deck)
      const fsize = size > 0 ? size : deckSize([lines], s.font, s.perSlide);
      for (const rows of carryFormattingSlides(flowLines(lines, s.font, fsize))) {
        slides.push({ label: "", rows, segs: toSegs(rows), verse: true, numColor: "#f2c14e", size: fsize });
      }
    } else {
      it.slides.forEach((rows, i) => slides.push({ label: it.slideLabels[i] ?? "", rows, size: it.size, bg: it.look?.bg, fg: it.look?.fg, font: it.look?.font }));
    }
  }
  return { font: s.font, size, bg: s.bg, fg: s.fg, showLabels: s.showLabels, slides };
}

export default function Builder() {
  // The working presentation is kept for this browser session, so going to the Lyrics page and back keeps it
  const draft = useMemo(() => loadDraft(), []);
  const [settings, setSettings] = useState<Settings>(draft?.settings ?? DEFAULT_SETTINGS);
  const [items, setItems] = useState<Item[]>(draft?.items ?? []);
  // A reading added from the Readings page waits in sessionStorage until the Builder opens
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("pendingBuilderItem");
      if (!raw) return;
      sessionStorage.removeItem("pendingBuilderItem");
      const item = JSON.parse(raw) as ReadingItem;
      setItems((cur) => [...cur, item]);
    } catch { /* storage blocked or bad data */ }
  }, []);
  const [selectedItem, setSelectedItem] = useState<string>("");
  const [title, setTitle] = useState(draft?.title ?? "Sunday Worship");
  const [savedList, setSavedList] = useState<Presentation[]>([]);
  const [currentId, setCurrentId] = useState<string>(draft?.currentId ?? "");
  useEffect(() => {
    try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ settings, items, title, currentId })); } catch { /* storage blocked */ }
  }, [settings, items, title, currentId]);
  const [library, setLibrary] = useState<LibrarySong[]>([]);
  const [recent, setRecent] = useState<RecentStudy[]>([]);
  const [status, setStatus] = useState("Pick songs from the library to start a presentation.");
  const [userId, setUserId] = useState<string | null>(null);

  const say = (m: string) => { setStatus(m); toast(m); };

  // Opened from the Presentations list: the address carries the id (#builder:<id>)
  useEffect(() => {
    const m = window.location.hash.match(/^#builder:(.+)$/);
    if (!m || !supabase) return;
    supabase.from("presentations").select("id, title, data").eq("id", m[1]).single().then(({ data }) => {
      if (data) openPresentation(data as Presentation);
      else say("That presentation could not be found.");
    });
    // Runs once when the page opens with an id
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- Library ----------
  useEffect(() => {
    (async () => {
      if (supabase) {
        const { data: sess } = await supabase.auth.getSession();
        setUserId(sess.session?.user.id ?? null);
        const { data } = await supabase.from("lyric_songs").select("id, title, song_number, lyrics, look").order("updated_at", { ascending: false });
        setLibrary((data || []).map((r) => ({ id: r.id, title: r.title, number: r.song_number, lyrics: r.lyrics, look: (r.look ?? {}) as LibrarySong["look"] })));
        if (sess.session) { await loadPresentations(); await loadRecent(); }
      } else {
        try { setLibrary(JSON.parse(localStorage.getItem("lyricsSongs") || "[]")); } catch { setLibrary([]); }
        loadLocalPresentations();
      }
    })();
    // loaders below are stable
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Recent songs: the library is already newest first, so the top 8 are the latest saved songs
  // Removing an entry from Recent only hides it from this list; the saved song or study is not deleted
  const HIDDEN_SONGS_KEY = "builderHiddenRecentSongs";
  const HIDDEN_SCRIPTURES_KEY = "builderHiddenRecentScriptures";
  const [hiddenSongs, setHiddenSongs] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(HIDDEN_SONGS_KEY) || "[]"); } catch { return []; }
  });
  const [hiddenScriptures, setHiddenScriptures] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(HIDDEN_SCRIPTURES_KEY) || "[]"); } catch { return []; }
  });
  useEffect(() => { try { localStorage.setItem(HIDDEN_SONGS_KEY, JSON.stringify(hiddenSongs)); } catch { /* blocked */ } }, [hiddenSongs]);
  useEffect(() => { try { localStorage.setItem(HIDDEN_SCRIPTURES_KEY, JSON.stringify(hiddenScriptures)); } catch { /* blocked */ } }, [hiddenScriptures]);
  // Recent songs are the songs added with Add to Presentation on the Lyrics page, newest first
  const addedLog = useMemo<string[]>(() => {
    try { return (JSON.parse(localStorage.getItem("addedSongsLog") || "[]") as { id: string }[]).map((x) => x.id); } catch { return []; }
  }, []);
  const recentSongs = useMemo(
    () => addedLog.map((id) => library.find((x) => x.id === id)).filter((x): x is LibrarySong => !!x && !hiddenSongs.includes(x.id)).slice(0, 8),
    [addedLog, library, hiddenSongs],
  );
  const recentScriptures = useMemo(() => recent.filter((x) => !hiddenScriptures.includes(x.id)), [recent, hiddenScriptures]);

  // Add a saved song as a snapshot with its own slides, the same way scripture studies are added
  function addSong(song: LibrarySong) {
    // The song's own saved look wins; anything it doesn't have comes from the builder's settings
    const eff = { ...settings, ...(song.look ?? {}) } as Settings & { customSize?: number };
    const gen = slidesForSong(song.lyrics, song.title, song.number, eff);
    const look = { bg: eff.bg, fg: eff.fg, font: eff.font };
    const item: Item = { kind: "song", id: uid(), songId: song.id, title: song.title, number: song.number, lyrics: song.lyrics, look, libraryLook: JSON.stringify(song.look ?? {}), ...gen };
    setItems((cur) => [...cur, item]);
    setSelectedItem(item.id);
    say(`Added song ${song.number ? song.number + ". " : ""}${song.title || ""}.`);
  }

  // ---------- Sequence editing ----------
  function addCustomAt(index: number | null) {
    const item: CustomItem = { kind: "custom", id: uid(), title: "Custom slide", text: "" };
    setItems((cur) => {
      const at = index === null ? cur.length : index;
      return [...cur.slice(0, at), item, ...cur.slice(at)];
    });
    setSelectedItem(item.id);
  }
  function move(id: string, dir: -1 | 1) {
    setItems((cur) => {
      const i = cur.findIndex((x) => x.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= cur.length) return cur;
      const next = cur.slice();
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }
  // Drag and drop: moves one whole item (a song or scripture keeps all its slides together)
  function moveTo(id: string, toIndex: number) {
    setItems((cur) => {
      const from = cur.findIndex((x) => x.id === id);
      if (from < 0) return cur;
      const next = cur.slice();
      const [moved] = next.splice(from, 1);
      const at = Math.max(0, Math.min(toIndex > from ? toIndex - 1 : toIndex, next.length));
      next.splice(at, 0, moved);
      return next;
    });
  }
  const [dragId, setDragId] = useState<string>("");
  const [dropAt, setDropAt] = useState<number | null>(null);

  // Duplicate an item: an independent copy with a new id (its slides are copied, not shared)
  function duplicateItem(id: string) {
    setItems((cur) => {
      const i = cur.findIndex((x) => x.id === id);
      if (i < 0) return cur;
      const copy = { ...JSON.parse(JSON.stringify(cur[i])), id: uid() } as Item;
      if (copy.kind === "custom") copy.title = `${copy.title} (copy)`;
      return [...cur.slice(0, i + 1), copy, ...cur.slice(i + 1)];
    });
  }
  function removeItem(id: string) {
    setItems((cur) => cur.filter((x) => x.id !== id));
    if (selectedItem === id) setSelectedItem("");
  }
  function updateCustom(id: string, patch: Partial<CustomItem>) {
    setItems((cur) => cur.map((x) => (x.id === id && x.kind === "custom" ? { ...x, ...patch } : x)));
  }

  // Regenerate a song's slides from the current library copy (only when the user asks)
  // Go to the Lyrics page with this song open. The builder remembers the way back.
  function editSongLook(songId: string) {
    try { sessionStorage.setItem(RETURN_KEY, "builder"); } catch { /* storage blocked */ }
    window.location.hash = `#lyrics:${songId}`;
  }

  function refreshSong(id: string) {
    setItems((cur) => cur.map((x) => {
      if (x.id !== id || x.kind !== "song") return x;
      const lib = library.find((s) => s.id === x.songId);
      if (!lib) return x;
      const eff = { ...settings, ...(lib.look ?? {}) } as Settings & { customSize?: number };
      const gen = slidesForSong(lib.lyrics, lib.title, lib.number, eff);
      const look = { bg: eff.bg, fg: eff.fg, font: eff.font };
      return { ...x, title: lib.title, number: lib.number, lyrics: lib.lyrics, look, libraryLook: JSON.stringify(lib.look ?? {}), libraryChanged: false, ...gen };
    }));
    say("Song refreshed from the library.");
  }

  // Mark songs whose library copy has changed since they were added
  const itemsWithFlags = useMemo(
    () => items.map((x) => {
      if (x.kind !== "song") return x;
      const lib = library.find((s) => s.id === x.songId);
      const lookChanged = !!lib && x.libraryLook !== undefined && x.libraryLook !== JSON.stringify(lib.look ?? {});
      return lib ? { ...x, libraryChanged: lib.lyrics !== x.lyrics || lib.title !== x.title || lib.number !== x.number || lookChanged } : x;
    }),
    [items, library],
  );

  // ---------- Preview ----------
  const deck = useMemo(() => flatten(items, settings, 0), [items, settings]);
  const previewSlides = deck.slides;
  const [previewIndex, setPreviewIndex] = useState(0);
  useEffect(() => { setPreviewIndex((i) => Math.min(i, Math.max(0, previewSlides.length - 1))); }, [previewSlides.length]);
  // The preview follows the selected item; with nothing selected it shows the whole presentation
  const selectedEntry = items.find((x) => x.id === selectedItem) ?? null;
  const shownSlides = selectedEntry ? flatten([selectedEntry], settings, 0).slides : previewSlides;
  // Which item and slide the preview is on, for the editor
  const currentItem = itemsWithFlags.find((x) => x.id === selectedItem) ?? null;

  // ---------- Saving ----------
  // Most recent saved scripture studies (signed in only; the table is owner-only)
  async function loadRecent() {
    if (!supabase) return;
    const { data } = await supabase
      .from("scripture_studies")
      .select("id, study_title, updated_at, data")
      .order("updated_at", { ascending: false })
      .limit(8);
    setRecent((data || []).map((r) => ({ id: r.id, title: r.study_title, updated: r.updated_at, data: r.data as Record<string, unknown> })));
  }

  // Add a saved scripture study to the sequence, with its slides built the same way as on the scripture page
  function addScripture(study: RecentStudy) {
    const d = study.data as { slides?: { kind: "passage" | "custom" | "questions"; title: string; text: string }[] } & Record<string, unknown>;
    const look = { font: "Arial", perSlide: 4, aspect: "16:9", bg: "#213648", fg: "#f5f2ea", verseNumbers: true, showLabels: false, numColor: "#f2c14e", labelColor: "#f2c14e", ...d };
    const out = buildOutput((d.slides ?? []) as never, look as never);
    if (!out.slides.length) { say("That study has no text yet."); return; }
    const item: ScriptureItem = {
      kind: "scripture", id: uid(), studyId: study.id, title: study.title,
      slides: out.slides.map((x) => ({ rows: [...x.rows], label: x.label, ref: x.ref, verse: x.verse, fmt: x.fmt, bg: x.bg, fg: x.fg, font: x.font, size: x.size, numColor: x.numColor })),
      numColor: String(look.numColor),
      labelColor: String(look.labelColor),
      size: out.size,
    };
    setItems((cur) => [...cur, item]);
    setSelectedItem(item.id);
    say(`Added scripture "${study.title}" (${out.slides.length} slide${out.slides.length === 1 ? "" : "s"}).`);
  }

  async function loadPresentations() {
    if (!supabase) return;
    const { data, error } = await supabase.from("presentations").select("id, title, data").order("updated_at", { ascending: false });
    if (error) { say("Could not load presentations: " + error.message); return; }
    setSavedList((data || []) as Presentation[]);
  }
  function loadLocalPresentations() {
    try { setSavedList(JSON.parse(localStorage.getItem(LOCAL_KEY) || "[]")); } catch { setSavedList([]); }
  }

  async function savePresentation() {
    const data: PresentationData = { ...settings, items };
    if (!title.trim()) { say("Give the presentation a title."); return; }
    if (supabase) {
      if (!userId) { say("Sign in on the Lyrics page to save presentations."); return; }
      const q = currentId
        ? supabase.from("presentations").update({ title, data }).eq("id", currentId).select("id").single()
        : supabase.from("presentations").insert({ title, data, owner_id: userId }).select("id").single();
      const { data: row, error } = await q;
      if (error) { say("Could not save: " + error.message); return; }
      setCurrentId(row.id);
      await loadPresentations();
    } else {
      const list = savedList.filter((p) => p.id !== currentId);
      const id = currentId || uid();
      const next = [{ id, title, data }, ...list];
      try { localStorage.setItem(LOCAL_KEY, JSON.stringify(next)); } catch { /* storage blocked */ }
      setCurrentId(id);
      setSavedList(next);
    }
    say("Presentation saved.");
  }

  function openPresentation(p: Presentation) {
    const { items: its, ...s } = p.data;
    setSettings({ ...DEFAULT_SETTINGS, ...s });
    setItems(its || []);
    setTitle(p.title);
    setCurrentId(p.id);
    setSelectedItem("");
    say(`Opened "${p.title}".`);
  }

  function newPresentation() {
    setItems([]); setCurrentId(""); setTitle("New presentation"); setSelectedItem(""); say("New presentation.");
  }

  async function duplicatePresentation() {
    if (!currentId) { say("Save the presentation before duplicating it."); return; }
    setCurrentId("");
    setTitle(`${title} (copy)`);
    say("Copy ready: press Save to store it as a new presentation.");
  }

  async function deletePresentation() {
    if (!currentId) { newPresentation(); return; }
    if (!window.confirm("Delete this presentation?")) return;
    if (supabase) {
      const { error } = await supabase.from("presentations").delete().eq("id", currentId);
      if (error) { say("Could not delete: " + error.message); return; }
      await loadPresentations();
    } else {
      const next = savedList.filter((p) => p.id !== currentId);
      try { localStorage.setItem(LOCAL_KEY, JSON.stringify(next)); } catch { /* storage blocked */ }
      setSavedList(next);
    }
    newPresentation();
  }

  function present() {
    if (!deck.slides.length) { say("Add songs or slides first."); return; }
    const payload = flatten(items, settings, 84);
    try { localStorage.setItem(PROJECTOR_KEY, JSON.stringify(payload)); } catch { /* storage blocked */ }
    window.open(`${import.meta.env.BASE_URL}#projector`, "_blank");
  }

  // ---------- UI ----------
  // The contents of one preview slide (number, text, label), shared by the big slide and the small cards
  const pvInner = (sl: typeof shownSlides[number], i: number) => (
    <>
      <span className="pv-num">{i + 1}</span>
      {sl.ref && <span className="pv-ref">{sl.ref}</span>}
      <span className="pv-text" style={sl.size ? { fontSize: `${(sl.size / 960) * 100}cqw` } : undefined}>
        {(sl.segs ?? toSegs(sl.rows ?? [])).map((line, ri) => (
          <span key={ri} className="pv-row">
            {line.map((seg, k) =>
              seg.text.split(VERSE_SPLIT).map((part, j) => {
                if (!part) return null;
                if (j % 2) return <span key={`${k}-${j}`} className="pv-vnum" style={{ color: sl.numColor || "#f2c14e" }}>{part} </span>;
                return <span key={`${k}-${j}`} style={{ fontWeight: seg.f?.bold ? 700 : undefined, fontStyle: seg.f?.italic ? "italic" : undefined, textDecoration: seg.f?.underline ? "underline" : undefined, color: seg.f?.color, backgroundColor: seg.f?.highlight }}>{j ? part.replace(/^ /, "") : part}</span>;
              })
            )}
          </span>
        ))}
      </span>
      {sl.label && settings.showLabels && <span className="pv-tag">{sl.label}</span>}
    </>
  );

  return (
    <>
    <NavBar />
    <div className="builder-page">
      <header>
        <h1>Presentation Builder</h1>
        <p className="sub">Choose songs, add your own slides, arrange them, then present in one order.</p>
      </header>

      <div className="builder-top">
        <input className="title-in" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Presentation title" />
        <select value={currentId} onChange={(e) => { const p = savedList.find((x) => x.id === e.target.value); if (p) openPresentation(p); else newPresentation(); }} aria-label="Saved presentations">
          <option value="">{savedList.length ? "Open a saved presentation" : "No saved presentations"}</option>
          {savedList.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
        </select>
        <div className="row">
          <button onClick={savePresentation}>Save</button>
          <button className="secondary" onClick={newPresentation}>New</button>
          <button className="secondary" onClick={duplicatePresentation}>Duplicate</button>
          <button className="secondary" onClick={deletePresentation}>Delete</button>
          <button className="primary" onClick={present} disabled={!items.length}>Present</button>
        </div>
      </div>
      <p className="status">{status}</p>

      <div className="builder-grid">
        {/* A. Content selection */}
        <section className="panel">
          <h2>Recent songs</h2>
          <p className="empty">Save songs on the Lyrics page, then add them here.</p>
          {!recentSongs.length && <p className="empty">No saved songs yet.</p>}
          <ul className="recent-list">
            {recentSongs.map((r) => (
              <li key={r.id}>
                <span className="recent-title"><strong>{r.number ? `${r.number}. ` : ""}{r.title || "(untitled)"}</strong><small>Song</small></span>
                <button className="primary small" onClick={() => addSong(r)} aria-label={`Add ${r.title || "song"}`}>Add</button>
                <button className="secondary small recent-x" onClick={() => setHiddenSongs((cur) => [...cur, r.id])} aria-label={`Remove ${r.title || "song"} from recent`} title="Remove from this list">×</button>
              </li>
            ))}
          </ul>
          {hiddenSongs.length > 0 && <button className="link small" onClick={() => setHiddenSongs([])}>Show {hiddenSongs.length} removed song{hiddenSongs.length === 1 ? "" : "s"}</button>}
          <div className="row">
            <button className="secondary" onClick={() => addCustomAt(0)}>+ At start</button>
            <button className="secondary" onClick={() => addCustomAt(null)}>+ At end</button>
          </div>

          <h2 className="recent-h">Recent scriptures</h2>
          {!userId && <p className="empty">Sign in on the Lyrics page to see your saved scriptures.</p>}
          {userId && !recentScriptures.length && <p className="empty">No saved scripture studies yet.</p>}
          <ul className="recent-list">
            {recentScriptures.map((r) => (
              <li key={r.id}>
                <span className="recent-title"><strong>{r.title || "(untitled)"}</strong><small>Scripture · {new Date(r.updated).toLocaleDateString()}</small></span>
                <button className="primary small" onClick={() => addScripture(r)} aria-label={`Add ${r.title || "study"}`}>Add</button>
                <button className="secondary small recent-x" onClick={() => setHiddenScriptures((cur) => [...cur, r.id])} aria-label={`Remove ${r.title || "study"} from recent`} title="Remove from this list">×</button>
              </li>
            ))}
          </ul>
          {hiddenScriptures.length > 0 && <button className="link small" onClick={() => setHiddenScriptures([])}>Show {hiddenScriptures.length} removed stud{hiddenScriptures.length === 1 ? "y" : "ies"}</button>}
        </section>

        {/* B. Presentation sequence */}
        <section className="panel">
          <h2>Presentation order</h2>
          {!itemsWithFlags.length && <p className="empty">Nothing added yet.</p>}
          <ol className="sequence" onDragLeave={() => setDropAt(null)}>
            {itemsWithFlags.map((it, i) => (
              <li
                key={it.id}
                draggable
                onDragStart={(e) => { setDragId(it.id); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", it.id); }}
                onDragEnd={() => { setDragId(""); setDropAt(null); }}
                onDragOver={(e) => { if (!dragId) return; e.preventDefault(); setDropAt(i); }}
                onDrop={(e) => { e.preventDefault(); if (dragId) moveTo(dragId, i); setDragId(""); setDropAt(null); }}
                className={`seq-item ${it.kind}${selectedItem === it.id ? " selected" : ""}${dragId === it.id ? " dragging" : ""}${dropAt === i && dragId && dragId !== it.id ? " drop-before" : ""}`}
              >
                <div className="seq-head" onClick={() => setSelectedItem(it.id)}>
                  <span className="seq-grip" aria-hidden="true">⠿</span>
                  <span className="seq-num" aria-label={`Position ${i + 1}`}>{i + 1}</span>
                  <span className={`kind-badge ${it.kind}`}>{it.kind === "song" ? "Song" : it.kind === "scripture" ? "Scripture" : it.kind === "reading" ? "Reading" : "Custom"}</span>
                  <strong>{it.kind === "song" ? `${it.number ? it.number + ". " : ""}${it.title}` : it.title}</strong>
                  {it.kind === "song" && it.libraryChanged && <span className="badge">Library changed</span>}
                </div>
                <div className="seq-actions">
                  <button className="secondary small" onClick={() => move(it.id, -1)} disabled={i === 0} aria-label="Move up">↑</button>
                  <button className="secondary small" onClick={() => move(it.id, 1)} disabled={i === itemsWithFlags.length - 1} aria-label="Move down">↓</button>
                  <button className="secondary small" onClick={() => addCustomAt(i)} aria-label="Insert custom slide above">+ above</button>
                  <button className="secondary small" onClick={() => duplicateItem(it.id)}>Duplicate</button>
                  {it.kind === "song" && <button className="secondary small" onClick={() => editSongLook(it.songId)}>Edit formatting</button>}
                  {it.kind === "song" && it.libraryChanged && <button className="secondary small" onClick={() => refreshSong(it.id)}>Refresh</button>}
                  <button className="secondary small" onClick={() => removeItem(it.id)}>Remove</button>
                </div>
                {it.kind === "song" && <div className="seq-sub">{it.slides.length} slide{it.slides.length === 1 ? "" : "s"}</div>}
              </li>
            ))}
            {dragId && (
              <li
                className={`seq-drop-end${dropAt === itemsWithFlags.length ? " active" : ""}`}
                onDragOver={(e) => { e.preventDefault(); setDropAt(itemsWithFlags.length); }}
                onDrop={(e) => { e.preventDefault(); moveTo(dragId, itemsWithFlags.length); setDragId(""); setDropAt(null); }}
              >
                Drop here to move to the end
              </li>
            )}
          </ol>
        </section>

        {/* C. Slide preview and editing */}
        <section className="panel preview">
          <h2>Preview</h2>
          <p className="empty pv-from">
            {selectedEntry ? `Showing: ${selectedEntry.kind === "song" ? (selectedEntry.number ? selectedEntry.number + ". " : "") + selectedEntry.title : selectedEntry.title}` : "Showing: whole presentation"}
          </p>
          {shownSlides.length ? (
            <>
              {(() => { const cur = shownSlides[Math.min(previewIndex, shownSlides.length - 1)]; return (
                <div className="pv-big" style={{ background: cur.bg ?? settings.bg, color: cur.fg ?? settings.fg, fontFamily: `${cur.font ?? settings.font}, sans-serif` }}>
                  {pvInner(cur, Math.min(previewIndex, shownSlides.length - 1))}
                </div>
              ); })()}
              <div className="pv-cards">
                {shownSlides.map((sl, i) => (
                  <button
                    key={i}
                    type="button"
                    className={`pv-card${Math.min(previewIndex, shownSlides.length - 1) === i ? " current" : ""}`}
                    style={{ background: sl.bg ?? settings.bg, color: sl.fg ?? settings.fg, fontFamily: `${sl.font ?? settings.font}, sans-serif` }}
                    onClick={() => setPreviewIndex(i)}
                    aria-label={`Slide ${i + 1}`}
                  >
                    {pvInner(sl, i)}
                  </button>
                ))}
              </div>
              <div className="row">
                <button className="secondary small" onClick={() => setPreviewIndex((i) => Math.max(0, i - 1))} disabled={previewIndex === 0}>← Prev</button>
                <span>{Math.min(previewIndex, shownSlides.length - 1) + 1} / {shownSlides.length}</span>
                <button className="secondary small" onClick={() => setPreviewIndex((i) => Math.min(shownSlides.length - 1, i + 1))} disabled={previewIndex >= shownSlides.length - 1}>Next →</button>
              </div>
            </>
          ) : <p className="empty">No slides yet.</p>}

          {currentItem?.kind === "custom" && (
            <div className="editor">
              <h3>Edit custom slide</h3>
              <input value={currentItem.title} onChange={(e) => updateCustom(currentItem.id, { title: e.target.value })} aria-label="Custom slide title" />
              <textarea value={currentItem.text} onChange={(e) => updateCustom(currentItem.id, { text: e.target.value })} aria-label="Custom slide text" />
              <p className="empty">Each line is one row on the slide. Changes here do not affect any song.</p>
            </div>
          )}

          <div className="editor">
            <h3>Look</h3>
            <div className="grid2">
              <div>
                <label htmlFor="b-font">Font</label>
                <select id="b-font" value={settings.font} onChange={(e) => setSettings({ ...settings, font: e.target.value })}>
                  {FONTS.map((f) => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="b-per">Lines per slide</label>
                <select id="b-per" value={settings.perSlide} onChange={(e) => setSettings({ ...settings, perSlide: parseInt(e.target.value, 10) })}>
                  {[2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
            </div>
            <label className="check"><input type="checkbox" checked={settings.showLabels} onChange={(e) => setSettings({ ...settings, showLabels: e.target.checked })} /> Show section labels</label>
            <p className="empty">Song slides are regenerated when you add a song. Changing the look here applies to songs added after this.</p>
          </div>
        </section>
      </div>
    </div>
    </>
  );
}

// Slide type is re-exported for the editor's type checks
export type { Slide };
