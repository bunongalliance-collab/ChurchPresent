import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import NavBar from "../components/NavBar";
import { buildDeck, FONTS, type Slide } from "../lib/slides";
import { PROJECTOR_KEY, type ProjDeck } from "./Projector";
import { buildOutput } from "./Scripture";
import type { SlideFmt } from "./Projector";

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
  slides: { rows: string[]; label: string; verse: boolean; fmt?: SlideFmt; bg?: string; fg?: string; font?: string }[];
  numColor: string;
  labelColor: string;
  size: number;
}
interface RecentStudy { id: string; title: string; updated: string; data: Record<string, unknown> }
export type Item = SongItem | CustomItem | ScriptureItem;

export interface Settings {
  font: string;
  perSlide: number;
  bg: string;
  fg: string;
  showLabels: boolean;
  removeRepeats: boolean;
}
export interface PresentationData extends Settings {
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
    if (it.kind === "scripture") {
      it.slides.forEach((sl) => slides.push({ label: sl.label, rows: sl.rows, verse: sl.verse, fmt: sl.fmt, numColor: it.numColor, size: it.size, bg: sl.bg, fg: sl.fg, font: sl.font }));
    } else if (it.kind === "custom") {
      slides.push({ label: "", rows: it.text.split("\n").filter((l) => l.trim()), size });
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

  const say = (m: string) => setStatus(m);

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
  const recentSongs = useMemo(() => library.slice(0, 8), [library]);

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
  const current = previewSlides[previewIndex];
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
      slides: out.slides.map((x) => ({ rows: [...x.rows], label: x.label, verse: x.verse, fmt: x.fmt, bg: x.bg, fg: x.fg, font: x.font })),
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
          <button onClick={present} disabled={!items.length}>Present</button>
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
                <span className="recent-title">{r.number ? `${r.number}. ` : ""}{r.title || "(untitled)"}</span>
                <button className="secondary small" onClick={() => addSong(r)}>Add</button>
              </li>
            ))}
          </ul>
          <div className="row">
            <button className="secondary" onClick={() => addCustomAt(null)}>+ Custom slide</button>
          </div>

          <h2 className="recent-h">Recent scriptures</h2>
          {!userId && <p className="empty">Sign in on the Lyrics page to see your saved scriptures.</p>}
          {userId && !recent.length && <p className="empty">No saved scripture studies yet.</p>}
          <ul className="recent-list">
            {recent.map((r) => (
              <li key={r.id}>
                <span className="recent-title">{r.title || "(untitled)"}<small> · {new Date(r.updated).toLocaleDateString()}</small></span>
                <button className="secondary small" onClick={() => addScripture(r)}>Add</button>
              </li>
            ))}
          </ul>
        </section>

        {/* B. Presentation sequence */}
        <section className="panel">
          <h2>Presentation order</h2>
          {!itemsWithFlags.length && <p className="empty">Nothing added yet.</p>}
          <ol className="sequence">
            {itemsWithFlags.map((it, i) => (
              <li key={it.id} className={`seq-item ${it.kind}${selectedItem === it.id ? " selected" : ""}`}>
                <div className="seq-head" onClick={() => setSelectedItem(it.id)}>
                  <span className="seq-num" aria-label={`Position ${i + 1}`}>{i + 1}</span>
                  <span className="kind">{it.kind === "song" ? "Song" : it.kind === "scripture" ? "Scripture" : "Custom"}</span>
                  <strong>{it.kind === "song" ? `${it.number ? it.number + ". " : ""}${it.title}` : it.title}</strong>
                  {it.kind === "song" && it.libraryChanged && <span className="badge">Library changed</span>}
                </div>
                <div className="seq-actions">
                  <button className="secondary small" onClick={() => move(it.id, -1)} disabled={i === 0} aria-label="Move up">↑</button>
                  <button className="secondary small" onClick={() => move(it.id, 1)} disabled={i === itemsWithFlags.length - 1} aria-label="Move down">↓</button>
                  <button className="secondary small" onClick={() => addCustomAt(i)} aria-label="Insert custom slide above">+ above</button>
                  {it.kind === "song" && <button className="secondary small" onClick={() => editSongLook(it.songId)}>Edit formatting</button>}
                  {it.kind === "song" && it.libraryChanged && <button className="secondary small" onClick={() => refreshSong(it.id)}>Refresh</button>}
                  <button className="secondary small" onClick={() => removeItem(it.id)}>Remove</button>
                </div>
                {it.kind === "song" && <div className="seq-sub">{it.slides.length} slide{it.slides.length === 1 ? "" : "s"}</div>}
              </li>
            ))}
          </ol>
        </section>

        {/* C. Slide preview and editing */}
        <section className="panel preview">
          <h2>Preview</h2>
          {current ? (
            <>
              <div className="slide big" style={{ background: current?.bg ?? settings.bg, color: current?.fg ?? settings.fg, fontFamily: `${current?.font ?? settings.font}, sans-serif` }}>
                <div className="slide-inner">
                  {(current.rows ?? []).map((row, ri) => (
                    <div key={ri}>
                      {row.split(/\u0001(\d{1,3})/).map((part, k) => {
                        if (!part) return null;
                        if (k % 2) return <span key={k} style={{ color: current.numColor || "#f2c14e", fontSize: "0.5em", verticalAlign: "0.7em" }}>{part} </span>;
                        return <span key={k}>{k ? part.replace(/^ /, "") : part}</span>;
                      })}
                    </div>
                  ))}
                </div>
                {current.label && settings.showLabels && <div className="slide-tag">{current.label}</div>}
              </div>
              <div className="row">
                <button className="secondary small" onClick={() => setPreviewIndex((i) => Math.max(0, i - 1))} disabled={previewIndex === 0}>← Prev</button>
                <span>{previewIndex + 1} / {previewSlides.length}</span>
                <button className="secondary small" onClick={() => setPreviewIndex((i) => Math.min(previewSlides.length - 1, i + 1))} disabled={previewIndex >= previewSlides.length - 1}>Next →</button>
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
