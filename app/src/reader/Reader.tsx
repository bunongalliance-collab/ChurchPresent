import { useEffect, useMemo, useRef, useState, type TouchEvent } from "react";
import type { ReaderSong } from "../lib/offlineCache";
import { bySongNumber, loadSavedSongs, loadSongs, scoreUrl, type LoadResult } from "./data";
import { fold, toSections } from "./lyrics";
import InstallPrompt from "./InstallPrompt";

// Nau Mpro: the read-only hymn book for the congregation. No sign-in, works offline.
// Wide screens: song list | lyrics | score. Landscape tablets: the list in a drawer, lyrics beside the score.
// Portrait tablets and phones: Lyrics and Score tabs. Play mode gives the score the whole screen.
// Opening a song from the list adds a history step, so the phone's Back button returns to the list.

const SIZE_KEY = "readerTextSize";
const THEME_KEY = "readerTheme";
const MIN_SIZE = 15, MAX_SIZE = 32;
const MIN_ZOOM = 0.6, MAX_ZOOM = 2.5;

const readNum = (k: string, d: number) => { try { const v = parseInt(localStorage.getItem(k) || "", 10); return Number.isNaN(v) ? d : v; } catch { return d; } };
const write = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* storage blocked */ } };
const idFromHash = () => { const m = window.location.hash.match(/^#song-(.+)$/); return m ? decodeURIComponent(m[1]) : null; };
const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
// Layouts where the song list is a drawer (must match reader.css)
const drawerLayout = () => window.matchMedia("(max-width: 1199px)").matches;

type Tab = "lyrics" | "score";

export default function Reader() {
  const [load, setLoad] = useState<LoadResult | null>(null);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [lang, setLang] = useState("");
  const [selId, setSelId] = useState<string | null>(idFromHash);
  const [size, setSize] = useState(() => Math.min(MAX_SIZE, Math.max(MIN_SIZE, readNum(SIZE_KEY, 19))));
  const [dark, setDark] = useState(() => document.documentElement.getAttribute("data-theme") === "dark");
  const [tab, setTab] = useState<Tab>("lyrics");
  const [drawer, setDrawer] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [zoom, setZoom] = useState(1);
  const lyricsRef = useRef<HTMLElement>(null);
  const scoreRef = useRef<HTMLElement>(null);
  const touch = useRef({ x: 0, y: 0, t: 0 });

  // The saved copy first (instant, works offline), then the latest songs from the library
  useEffect(() => {
    let live = true;
    loadSavedSongs().then((r) => { if (live && r.songs.length) setLoad((cur) => cur ?? r); });
    loadSongs().then((r) => { if (live) setLoad((cur) => (r.source === "none" && cur?.songs.length ? { ...cur, error: r.error } : r)); });
    return () => { live = false; };
  }, []);

  // Back and forward buttons open and close songs
  useEffect(() => {
    const onPop = () => { setSelId(idFromHash()); setPlaying(false); setDrawer(false); };
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
  // Imported hymns open with the title and the reference line (TC 19, KM 2…). The heading already shows
  // the title, so hide that line, and show the reference with the key and time instead.
  const { sections, refLine } = useMemo(() => {
    const secs = song ? toSections(song.lyrics) : [];
    let ref = "";
    if (song && secs[0] && !secs[0].label && secs[0].lines.length === 1 && fold(secs[0].lines[0]) === fold(song.title)) {
      secs.shift();
      if (secs[0] && !secs[0].label && secs[0].lines.length === 1 && /\b(TC|KMM?|TVCHH)\s*\d/.test(secs[0].lines[0])) ref = secs.shift()!.lines[0];
    }
    return { sections: secs, refLine: ref };
  }, [song]);
  // Next and previous follow the list as shown (search and filters), or the whole book when the song is filtered out
  const order = song && shown.some((s) => s.id === song.id) ? shown : all;
  const at = song ? order.findIndex((s) => s.id === song.id) : -1;
  const prev = at > 0 ? order[at - 1] : null;
  const next = at >= 0 && at < order.length - 1 ? order[at + 1] : null;
  const images = (song?.scoreImages ?? []).map(scoreUrl).filter(Boolean);
  const pdf = song?.scorePath ? scoreUrl(song.scorePath) : "";
  const music = song?.music;

  function open(s: ReaderSong) {
    const hash = `#song-${encodeURIComponent(s.id)}`;
    // From the list a song adds a history step (so Back returns to the list); song to song replaces it
    if (selId) window.history.replaceState({ reader: true }, "", hash);
    else window.history.pushState({ reader: true }, "", hash);
    setSelId(s.id);
    setDrawer(false);
    setZoom(1);
    lyricsRef.current?.scrollTo({ top: 0 });
    scoreRef.current?.scrollTo({ top: 0 });
  }
  function close() {
    setPlaying(false);
    if (window.history.state?.reader) window.history.back();
    else { window.history.replaceState(null, "", window.location.pathname); setSelId(null); }
  }
  function togglePlay() {
    if (playing) { setPlaying(false); setZoom(1); return; }
    setPlaying(true);
    setTab("score");
    setDrawer(false);
  }
  const changeZoom = (d: number) => setZoom((z) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round((z + d) * 10) / 10)));
  // About four music systems fit on a printed page, so one step is a quarter of a page image
  function step(dir: number) {
    const el = scoreRef.current;
    const img = el?.querySelector("img");
    const h = img ? img.getBoundingClientRect().height / 4 : 300;
    el?.scrollBy({ top: dir * h, behavior: reducedMotion() ? "auto" : "smooth" });
  }

  // Keyboard: arrows change song; in play mode up/down (and space, page keys) move between systems
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Escape closes the drawer and leaves play mode, even while typing in the search box
      if (e.key === "Escape") { if (playing) { setPlaying(false); setZoom(1); } setDrawer(false); return; }
      if ((e.target as HTMLElement).closest("input, textarea")) return;
      if (!song) return;
      if (playing && (e.key === "ArrowDown" || e.key === "PageDown" || e.key === " ")) { e.preventDefault(); step(1); return; }
      if (playing && (e.key === "ArrowUp" || e.key === "PageUp")) { e.preventDefault(); step(-1); return; }
      if (e.key === "ArrowRight" && next) open(next);
      if (e.key === "ArrowLeft" && prev) open(prev);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Swipe sideways on the lyrics or score to change song (not while the score is zoomed in play mode)
  const onTouchStart = (e: TouchEvent) => { const p = e.touches[0]; touch.current = { x: p.clientX, y: p.clientY, t: Date.now() }; };
  const onTouchEnd = (e: TouchEvent) => {
    if (e.changedTouches.length !== 1 || (playing && zoom > 1)) return;
    const p = e.changedTouches[0], dx = p.clientX - touch.current.x, dy = p.clientY - touch.current.y;
    if (Date.now() - touch.current.t < 600 && Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 2) {
      if (dx < 0 && next) open(next);
      if (dx > 0 && prev) open(prev);
    }
  };

  const savedLine = (() => {
    if (!load) return "Loading songs…";
    const n = `${all.length} song${all.length === 1 ? "" : "s"}`;
    const when = load.savedAt ? new Date(load.savedAt).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : "";
    if (load.source === "online") return `Saved for offline · ${n}`;
    if (load.source === "saved") return load.error ? `No connection · showing the copy saved ${when ? "on " + when : "earlier"} · ${n}` : `Saved for offline · ${n}`;
    return load.error ? "Could not load songs. Connect to the internet once to save the hymn book on this device." : "No songs yet.";
  })();

  const cls = ["nm", song ? "reading" : "", playing ? "playing" : "", drawer ? "drawer" : ""].filter(Boolean).join(" ");

  return (
    <div className={cls} data-tab={tab}>
      <header className="nm-bar">
        {song && <button className="nm-songs-btn" onClick={() => setDrawer((d) => !d)} aria-expanded={drawer} aria-controls="nm-side">Songs</button>}
        {song && <button className="nm-back" onClick={close} aria-label="Back to songs">‹</button>}
        <div className="nm-brand">Nau <span>Mpro</span></div>
        <input className="nm-search" type="search" value={q} placeholder="Number, title or words" aria-label="Search songs"
          onChange={(e) => { setQ(e.target.value); if (song && drawerLayout()) setDrawer(true); }}
          onKeyDown={(e) => { if (e.key === "Enter" && shown[0]) open(shown[0]); }} />
        <button className="nm-icon" onClick={() => setDark((d) => !d)} aria-pressed={dark} aria-label="Dark mode" title="Dark mode">◐</button>
      </header>

      {song && (
        <div className="nm-head">
          {song.number && <span className="nm-hnum">{song.number}</span>}
          <h1 className="nm-htitle">{song.title || "Untitled"}</h1>
          <div className="nm-steps">
            <button className="nm-step" onClick={() => prev && open(prev)} disabled={!prev} aria-label={prev ? `Previous song: ${prev.number} ${prev.title}` : "No previous song"} title="Previous song">‹</button>
            <button className="nm-step" onClick={() => next && open(next)} disabled={!next} aria-label={next ? `Next song: ${next.number} ${next.title}` : "No next song"} title="Next song">›</button>
          </div>
          <button className="nm-play" onClick={togglePlay} aria-pressed={playing} aria-label="Play" title={playing ? "Leave play mode" : "Play: score fills the screen"}>
            <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2 1l9 5-9 5z" /></svg><span>{playing ? "Playing" : "Play"}</span>
          </button>
        </div>
      )}

      {song && (
        <div className="nm-tabs" role="tablist" aria-label="View">
          <button role="tab" aria-selected={tab === "lyrics"} aria-controls="nm-lyrics" onClick={() => setTab("lyrics")}>Lyrics</button>
          <button role="tab" aria-selected={tab === "score"} aria-controls="nm-score" onClick={() => setTab("score")}>Score</button>
        </div>
      )}

      <div className="nm-panes">
        <aside className="nm-side" id="nm-side" aria-label="Songs">
          {categories.length > 1 && (
            <div className="nm-chips" role="group" aria-label="Category">
              <button className={`nm-chip${!cat ? " on" : ""}`} aria-pressed={!cat} onClick={() => setCat("")}>All</button>
              {categories.map((c) => <button key={c} className={`nm-chip${cat === c ? " on" : ""}`} aria-pressed={cat === c} onClick={() => setCat(cat === c ? "" : c)}>{c}</button>)}
            </div>
          )}
          {languages.length > 1 && (
            <div className="nm-chips" role="group" aria-label="Language">
              <button className={`nm-chip${!lang ? " on" : ""}`} aria-pressed={!lang} onClick={() => setLang("")}>All languages</button>
              {languages.map((l) => <button key={l} className={`nm-chip${lang === l ? " on" : ""}`} aria-pressed={lang === l} onClick={() => setLang(lang === l ? "" : l)}>{l}</button>)}
            </div>
          )}
          <p className={`nm-saved${load?.error ? " warn" : ""}`} role="status">{savedLine}</p>
          <ul className="nm-list">
            {shown.map((s) => (
              <li key={s.id}>
                <button className={`nm-row${s.id === selId ? " sel" : ""}`} onClick={() => open(s)} aria-current={s.id === selId ? "true" : undefined}>
                  <span className="nm-num">{s.number}</span>
                  <span className="nm-rt">{s.title || "Untitled"}</span>
                </button>
              </li>
            ))}
            {load && all.length > 0 && !shown.length && <li className="nm-empty">No songs match. Try a number, a title or a line of the words.</li>}
          </ul>
        </aside>

        <main className="nm-lyrics" id="nm-lyrics" ref={lyricsRef} aria-label="Lyrics" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
          {song ? (
            <article className="nm-song" style={{ fontSize: `${size}px` }}>
              <div className="nm-facts">
                {refLine && <span>{refLine}</span>}
                {music?.key && <span>Key <b>{music.key}</b></span>}
                {music?.meter && <span>Time <b>{music.meter}</b></span>}
                {(song.category || song.language) && <span>{[song.category, song.language].filter(Boolean).join(" · ")}</span>}
                <span className="nm-size">
                  <button onClick={() => setSize((v) => Math.max(MIN_SIZE, v - 2))} disabled={size <= MIN_SIZE} aria-label="Smaller text" title="Smaller text">A−</button>
                  <button onClick={() => setSize((v) => Math.min(MAX_SIZE, v + 2))} disabled={size >= MAX_SIZE} aria-label="Bigger text" title="Bigger text">A+</button>
                </span>
              </div>
              {!!music?.chords.length && (
                <div className="nm-chords" aria-label="Chords printed in this hymn">{music.chords.map((c, i) => <span key={i}>{c}</span>)}</div>
              )}
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
        </main>

        <section className="nm-score" id="nm-score" ref={scoreRef} aria-label="Piano score" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
          {song && (images.length ? (
            <div className="nm-score-inner" style={{ width: `${zoom * 100}%` }}>
              {images.map((src, i) => (
                <figure key={src}>
                  <img src={src} alt={`Score for hymn ${song.number}, part ${i + 1} of ${images.length}`} loading={i ? "lazy" : "eager"} />
                  {images.length > 1 && <figcaption>Part {i + 1} of {images.length}</figcaption>}
                </figure>
              ))}
            </div>
          ) : pdf ? (
            <p className="nm-empty"><a href={pdf} target="_blank" rel="noopener">Open the music sheet (PDF)</a></p>
          ) : (
            <p className="nm-empty">No score for this song.</p>
          ))}
        </section>
      </div>

      {playing && (
        <div className="nm-controls" role="toolbar" aria-label="Play controls">
          <button onClick={() => step(-1)} aria-label="Previous system" title="Previous system">▲</button>
          <button onClick={() => step(1)} aria-label="Next system" title="Next system">▼</button>
          <span className="nm-sep" />
          <button onClick={() => changeZoom(-0.1)} disabled={zoom <= MIN_ZOOM} aria-label="Zoom out" title="Zoom out">−</button>
          <span className="nm-zoom">{Math.round(zoom * 100)}%</span>
          <button onClick={() => changeZoom(0.1)} disabled={zoom >= MAX_ZOOM} aria-label="Zoom in" title="Zoom in">+</button>
          <button onClick={() => setZoom(1)} title="Fit to width">Fit</button>
          <span className="nm-sep" />
          <button onClick={togglePlay}>Done</button>
        </div>
      )}
      {drawer && <div className="nm-scrim" onClick={() => setDrawer(false)} />}
      <InstallPrompt />
    </div>
  );
}
