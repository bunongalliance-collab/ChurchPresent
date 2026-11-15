import { useEffect, useMemo, useRef, useState } from "react";
import type { ReaderSong } from "../lib/offlineCache";
import { bySongNumber, loadSavedSongs, loadSongs, type LoadResult } from "./data";
import { fold, toSections } from "./lyrics";

// Nau Mpro: the read-only hymn book for the congregation. No sign-in, works offline.
// Wide screens: song list beside the lyrics. Phones: the list, then the lyrics on their own screen
// (the phone's back button returns to the list, because opening a song adds a history step).

const SIZE_KEY = "readerTextSize";
const THEME_KEY = "readerTheme";
const MIN_SIZE = 16, MAX_SIZE = 34;

const readNum = (k: string, d: number) => { try { const v = parseInt(localStorage.getItem(k) || "", 10); return Number.isNaN(v) ? d : v; } catch { return d; } };
const write = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* storage blocked */ } };
const idFromHash = () => { const m = window.location.hash.match(/^#song-(.+)$/); return m ? decodeURIComponent(m[1]) : null; };

export default function Reader() {
  const [load, setLoad] = useState<LoadResult | null>(null);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [lang, setLang] = useState("");
  const [selId, setSelId] = useState<string | null>(idFromHash);
  const [size, setSize] = useState(() => Math.min(MAX_SIZE, Math.max(MIN_SIZE, readNum(SIZE_KEY, 20))));
  const [dark, setDark] = useState(() => document.documentElement.getAttribute("data-theme") === "dark");
  const readerRef = useRef<HTMLDivElement>(null);

  // The saved copy first (instant, works offline), then the latest songs from the library
  useEffect(() => {
    let live = true;
    loadSavedSongs().then((r) => { if (live && r.songs.length) setLoad((cur) => cur ?? r); });
    loadSongs().then((r) => { if (live) setLoad((cur) => (r.source === "none" && cur?.songs.length ? { ...cur, error: r.error } : r)); });
    return () => { live = false; };
  }, []);

  // Back and forward buttons open and close songs
  useEffect(() => {
    const onPop = () => setSelId(idFromHash());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => { write(SIZE_KEY, String(size)); }, [size]);
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
    write(THEME_KEY, dark ? "dark" : "light");
  }, [dark]);

  // The library can hold copies of one song (a team member saving someone else's song makes a copy).
  // Show each number and title once, keeping the most recently updated copy.
  const all = useMemo(() => {
    const best = new Map<string, ReaderSong>();
    for (const s of load?.songs ?? []) {
      const key = `${s.number.trim()}|${fold(s.title)}`;
      const had = best.get(key);
      if (!had || s.updated > had.updated) best.set(key, s);
    }
    return [...best.values()].sort(bySongNumber);
  }, [load]);
  const categories = useMemo(() => [...new Set(all.map((s) => s.category).filter(Boolean))], [all]);
  const languages = useMemo(() => [...new Set(all.map((s) => s.language).filter(Boolean))], [all]);

  // Search by number, title or words, ignoring accents. A number typed alone puts that song first.
  const shown = useMemo(() => {
    const term = fold(q);
    const list = all.filter((s) => (!cat || s.category === cat) && (!lang || s.language === lang));
    if (!term) return list;
    const exact = list.filter((s) => s.number === term);
    const titled = list.filter((s) => s.number !== term && (fold(s.title).includes(term) || s.number.startsWith(term)));
    const worded = list.filter((s) => !exact.includes(s) && !titled.includes(s) && fold(s.lyrics).includes(term));
    return [...exact, ...titled, ...worded];
  }, [all, q, cat, lang]);

  const song = all.find((s) => s.id === selId) ?? null;
  const sections = useMemo(() => (song ? toSections(song.lyrics) : []), [song]);
  const at = song ? shown.findIndex((s) => s.id === song.id) : -1;
  const prev = at > 0 ? shown[at - 1] : null;
  const next = at >= 0 && at < shown.length - 1 ? shown[at + 1] : null;

  function open(s: ReaderSong) {
    const hash = `#song-${encodeURIComponent(s.id)}`;
    // From the list a song adds a history step (so Back returns to the list); song to song replaces it
    if (selId) window.history.replaceState({ reader: true }, "", hash);
    else window.history.pushState({ reader: true }, "", hash);
    setSelId(s.id);
    readerRef.current?.scrollTo({ top: 0 });
  }
  function close() {
    if (window.history.state?.reader) window.history.back();
    else { window.history.replaceState(null, "", window.location.pathname); setSelId(null); }
  }

  const label = (s: ReaderSong) => (s.number ? `${s.number}. ` : "") + (s.title || "Untitled");
  const savedLine = (() => {
    if (!load) return "Loading songs…";
    const n = `${all.length} song${all.length === 1 ? "" : "s"}`;
    const when = load.savedAt ? new Date(load.savedAt).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : "";
    if (load.source === "online") return `Saved for offline · ${n}`;
    if (load.source === "saved") return load.error ? `No connection · showing the copy saved ${when ? "on " + when : "earlier"} · ${n}` : `Saved for offline · ${n}`;
    return load.error ? "Could not load songs. Connect to the internet once to save the hymn book on this device." : "No songs yet.";
  })();

  return (
    <div className={`nm${song ? " reading" : ""}`}>
      <aside className="nm-side" aria-label="Songs">
        <header className="nm-head">
          <div className="nm-brand"><span className="nm-logo" aria-hidden="true">NM</span>Nau Mpro</div>
          <button className="nm-tool" onClick={() => setDark((d) => !d)} aria-pressed={dark} aria-label="Dark mode" title="Dark mode">◐</button>
        </header>
        <div className="nm-search-row">
          <input className="nm-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Number, title or words" aria-label="Search songs" />
        </div>
        {categories.length > 1 && (
          <div className="nm-chips" role="group" aria-label="Category">
            <button className={`nm-chip${!cat ? " on" : ""}`} aria-pressed={!cat} onClick={() => setCat("")}>All</button>
            {categories.map((c) => <button key={c} className={`nm-chip${cat === c ? " on" : ""}`} aria-pressed={cat === c} onClick={() => setCat(cat === c ? "" : c)}>{c}</button>)}
          </div>
        )}
        {languages.length > 1 && (
          <div className="nm-chips" role="group" aria-label="Language">
            <button className={`nm-chip small${!lang ? " on" : ""}`} aria-pressed={!lang} onClick={() => setLang("")}>All languages</button>
            {languages.map((l) => <button key={l} className={`nm-chip small${lang === l ? " on" : ""}`} aria-pressed={lang === l} onClick={() => setLang(lang === l ? "" : l)}>{l}</button>)}
          </div>
        )}
        <p className={`nm-saved${load?.error ? " warn" : ""}`} role="status">{savedLine}</p>
        <ul className="nm-list">
          {shown.map((s) => (
            <li key={s.id}>
              <button className={`nm-row${s.id === selId ? " sel" : ""}`} onClick={() => open(s)} aria-current={s.id === selId ? "true" : undefined}>
                <span className="nm-num">{s.number}</span>
                <span className="nm-rt">
                  <strong>{s.title || "Untitled"}</strong>
                  <small>{[s.category, s.language].filter(Boolean).join(" · ")}</small>
                </span>
              </button>
            </li>
          ))}
          {load && all.length > 0 && !shown.length && <li className="nm-empty">No songs match. Try a number, a title or a line of the words.</li>}
        </ul>
      </aside>

      <main className="nm-main" aria-label="Lyrics">
        <div className="nm-bar">
          <button className="nm-tool nm-back" onClick={close} aria-label="Back to songs">‹</button>
          <span className="nm-bar-title">{song ? label(song) : "Nau Mpro"}</span>
          <button className="nm-tool" onClick={() => setSize((v) => Math.max(MIN_SIZE, v - 2))} disabled={size <= MIN_SIZE} aria-label="Smaller text" title="Smaller text">A−</button>
          <button className="nm-tool" onClick={() => setSize((v) => Math.min(MAX_SIZE, v + 2))} disabled={size >= MAX_SIZE} aria-label="Bigger text" title="Bigger text">A+</button>
          <button className="nm-tool nm-dark-main" onClick={() => setDark((d) => !d)} aria-pressed={dark} aria-label="Dark mode" title="Dark mode">◐</button>
        </div>
        <div className="nm-reader" ref={readerRef}>
          {song ? (
            <article className="nm-song" style={{ fontSize: `${size}px` }}>
              <h1 className="nm-title">{label(song)}</h1>
              {(song.category || song.language) && <p className="nm-meta">{[song.category, song.language].filter(Boolean).join(" · ")}</p>}
              {sections.length ? sections.map((sec, i) => (
                <section key={i} className={`nm-sec${sec.chorus ? " chorus" : ""}`}>
                  {sec.label && <h2 className="nm-sec-label">{sec.label}</h2>}
                  {sec.lines.map((l, k) => <p key={k} className="nm-line">{l}</p>)}
                </section>
              )) : <p className="nm-empty">This song has no words yet.</p>}
            </article>
          ) : (
            <p className="nm-pick">Choose a song from the list.</p>
          )}
        </div>
        {song && (
          <nav className="nm-nav" aria-label="Next and previous song">
            <button onClick={() => prev && open(prev)} disabled={!prev}>{prev ? `‹ ${label(prev)}` : ""}</button>
            <button onClick={() => next && open(next)} disabled={!next}>{next ? `${label(next)} ›` : ""}</button>
          </nav>
        )}
      </main>
    </div>
  );
}
