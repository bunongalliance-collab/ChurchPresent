import { useEffect, useMemo, useRef, useState, type CSSProperties, type TouchEvent } from "react";
import type { ReaderSong } from "../lib/offlineCache";
import { bySongNumber, loadSavedSongs, loadSongs, scoreUrl, type LoadResult } from "./data";
import { fold, isUnavailable, onePerSong, songKey, toSections } from "./lyrics";
import InstallPrompt, { OPEN_INSTALL_EVENT } from "./InstallPrompt";
import { PULL_THRESHOLD, usePullToRefresh } from "./usePullToRefresh";
import { inAppBrowser, isStandalone } from "./install";
import OpenInBrowser from "./OpenInBrowser";
import PrayerSheet from "./PrayerSheet";
import { countSaved, keepStorage, prefetch, saveAll } from "./scores";
import { followAlong, loadChurchList, loadTodayService, readerChurch, setReaderChurch, type PublishedService, type PubSub, type ReaderChurch } from "../lib/publishedService";

// Nau Mpro: the read-only hymn book for the congregation. No sign-in, works offline.
// Wide screens: song list | lyrics | score. Landscape tablets: the list in a drawer, lyrics beside the score.
// Portrait tablets and phones: Lyrics and Score tabs. Play mode gives the score the whole screen.
// Opening a song from the list adds a history step, so the phone's Back button returns to the list.
// "Prayer request" (or the #prayer address, from the QR code in the program) opens a form to ask the church to pray.

const SIZE_KEY = "readerTextSize";
const THEME_KEY = "readerTheme";
const MIN_SIZE = 15, MAX_SIZE = 32;
const MIN_ZOOM = 0.6, MAX_ZOOM = 2.5;
const CHIP_LIMIT = 6;   // categories shown before "More"
// A song's scan images (none for a missing page: the scan filed under it belongs to another song)
const sheetUrls = (s: ReaderSong) => isUnavailable(s) ? [] : (s.scoreImages ?? []).map(scoreUrl).filter(Boolean);

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
  const [allCats, setAllCats] = useState(false);
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

  // The prayer request form, open while the address ends in #prayer
  const [praying, setPraying] = useState(() => window.location.hash === "#prayer");
  // Back and forward buttons open and close songs and the prayer form
  useEffect(() => {
    const onPop = () => { setSelId(idFromHash()); setPraying(window.location.hash === "#prayer"); setPlaying(false); setDrawer(false); };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => { write(SIZE_KEY, String(size)); }, [size]);
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
    write(THEME_KEY, dark ? "dark" : "light");
  }, [dark]);

  // The library can hold copies of one song (a team member saving someone else's song makes a copy).
  // Show each number and title once: the copy with the music sheet, else the most recently updated.
  const all = useMemo(() => onePerSong(load?.songs ?? []).sort(bySongNumber), [load]);
  // A link or an open song can point at a copy that is not the one shown: move to the shown one
  useEffect(() => {
    if (!selId || all.some((s) => s.id === selId)) return;
    const copy = load?.songs.find((s) => s.id === selId);
    const kept = copy && all.find((s) => songKey(s) === songKey(copy));
    if (kept) setSelId(kept.id);
  }, [all, load, selId]);
  // Today's service: the order of worship the team published from the Program, with its songs
  const [service, setService] = useState<PublishedService | null>(null);
  // Whose service: the church chosen once on this phone (no sign-in). With only one church it is chosen for them.
  const [church, setChurch] = useState(() => readerChurch());
  const churchId = church && church !== "none" ? church.id : null;
  const [asking, setAsking] = useState(false);       // "Change church" pressed
  const [churchList, setChurchList] = useState<ReaderChurch[] | null>(null);
  useEffect(() => {
    if (church !== null && !asking) return;
    let live = true;
    loadChurchList().then((list) => {
      if (!live || !list) return;              // offline: ask next time
      if (church === null && list.length === 1) { pickChurch(list[0]); return; }
      setChurchList(list);
    });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [church, asking]);
  const pickChurch = (c: ReaderChurch | "none") => { setReaderChurch(c); setChurch(c); setAsking(false); setService(null); };
  const showAsk = (church === null || asking) && !!churchList?.length;
  // A QR code in the church's program opens /nau-mpro/?church=<id>#prayer: the request goes to that church.
  // A phone with no church chosen yet takes it as its church too.
  const [qrChurch, setQrChurch] = useState<ReaderChurch | null>(null);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("church");
    if (!id) return;
    params.delete("church");
    const rest = params.toString();
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${rest ? `?${rest}` : ""}${window.location.hash}`);
    loadChurchList().then((list) => {
      const c = list?.find((x) => x.id === id);
      if (!c) return;
      setQrChurch(c);
      if (readerChurch() === null || readerChurch() === "none") pickChurch(c);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const prayerChurch = qrChurch ?? (church && church !== "none" ? church : null);
  function openPrayer() {
    window.history.pushState({ reader: true, prayer: true }, "", "#prayer");
    setPraying(true);
    setDrawer(false);
  }
  function closePrayer() {
    if (window.history.state?.prayer) window.history.back();
    else { window.history.replaceState(null, "", window.location.pathname + window.location.search); setPraying(false); }
  }
  const churchIdRef = useRef(churchId);
  churchIdRef.current = churchId;
  useEffect(() => { loadTodayService(churchId).then(setService); }, [churchId]);
  // Phones keep the app open in the background for days, so the page would keep last week's service.
  // Coming back to the app (or back online) quietly reloads Today's service and the songs, at most every 30 s.
  const lastLoad = useRef(Date.now());
  // Reload Today's service and the songs; true when the library answered (false when offline)
  const reload = async (): Promise<boolean> => {
    lastLoad.current = Date.now();
    const [svc, r] = await Promise.all([loadTodayService(churchIdRef.current), loadSongs()]);
    setService(svc);
    setLoad((cur) => (r.source === "none" && cur?.songs.length ? { ...cur, error: r.error } : r));
    return r.source !== "none" && !r.error;
  };
  const reloadRef = useRef(reload);
  reloadRef.current = reload;
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState !== "visible" || Date.now() - lastLoad.current < 30_000) return;
      void reloadRef.current();
    };
    const onShow = (e: PageTransitionEvent) => { if (e.persisted) refresh(); };
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("online", refresh);
    window.addEventListener("pageshow", onShow);
    return () => {
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("online", refresh);
      window.removeEventListener("pageshow", onShow);
    };
  }, []);
  // Pull down on the song list (touch screens) to reload; a short note says how it went
  const sideRef = useRef<HTMLElement>(null);
  const [note, setNote] = useState("");
  const noteTimer = useRef(0);
  const { pull, state: pullState } = usePullToRefresh(sideRef, async () => {
    const ok = await reload();
    setNoteBriefly(ok ? "Updated" : "Offline. Showing the saved copy.");
  });
  function setNoteBriefly(text: string) {
    window.clearTimeout(noteTimer.current);
    setNote(text);
    noteTimer.current = window.setTimeout(() => setNote(""), 1800);
  }
  // The church question starts at the top of the list, even if it was scrolled down to "Change church"
  useEffect(() => { if (showAsk) sideRef.current?.scrollTo({ top: 0 }); }, [showAsk]);
  // Only what the congregation follows along with: songs, choirs, readings and scripture that are filled in
  const todayItems = useMemo(() => followAlong(service?.items ?? []), [service]);
  // Passages and readings open in the lyrics view like a song (they have no number or music sheet)
  const todayTexts = useMemo(() => todayItems.flatMap((it, i) => it.subs.flatMap((sub, k): ReaderSong[] => sub.body
    ? [{ id: `today-${i}-${k}`, number: "", title: sub.text, lyrics: sub.body, category: it.name, language: "", updated: "" }] : [])), [todayItems]);
  const textFor = (i: number, k: number) => todayTexts.find((x) => x.id === `today-${i}-${k}`) ?? null;
  // A song in the order: by its saved id, else by "number. title" as typed
  const songFor = (sub: PubSub): ReaderSong | null => {
    if (sub.kind !== "song") return null;
    if (sub.songId) {
      const byId = (load?.songs ?? []).find((x) => x.id === sub.songId);
      if (byId) return all.find((x) => songKey(x) === songKey(byId)) ?? byId;
    }
    const m = sub.text.match(/^\s*(\d+)\s*[.)-]?\s*(.*)$/);
    if (m) return all.find((x) => x.number.trim() === m[1] && (!m[2] || fold(x.title) === fold(m[2]))) ?? all.find((x) => x.number.trim() === m[1]) ?? null;
    return all.find((x) => fold(x.title) === fold(sub.text)) ?? null;
  };

  // The first song of Today's service that can be opened, for the welcome view
  const firstToday = todayItems.flatMap((it) => it.subs.map(songFor)).find((x) => x && !isUnavailable(x)) ?? null;

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

  const song = all.find((s) => s.id === selId) ?? todayTexts.find((s) => s.id === selId) ?? null;
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
  const missing = !!song && isUnavailable(song);
  const passage = !!song && song.id.startsWith("today-");   // a reading or scripture from Today's service
  const images = song ? sheetUrls(song) : [];
  const pdf = song?.scorePath && !missing ? scoreUrl(song.scorePath) : "";
  const hasSheet = images.length > 0 || !!pdf;
  // Without a sheet the lyrics take the whole space. Play mode keeps its screen, so swiping on stays in it.
  const noSheet = !!song && !hasSheet && !playing;
  const music = song?.music;

  // Every score link in the hymn book, for "Save all music sheets"
  const allScores = useMemo(() => [...new Set(all.flatMap(sheetUrls))], [all]);
  const sheetSongs = useMemo(() => all.filter((s) => sheetUrls(s).length).length, [all]);
  const [scoresSaved, setScoresSaved] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveNote, setSaveNote] = useState("");
  const saveStop = useRef<AbortController | null>(null);
  useEffect(() => { countSaved(allScores).then(setScoresSaved); }, [allScores]);
  useEffect(() => () => saveStop.current?.abort(), []);
  async function saveScores() {
    if (saving) { saveStop.current?.abort(); return; }
    const ctl = new AbortController();
    saveStop.current = ctl;
    setSaving(true);
    setSaveNote("");
    await keepStorage();
    const failed = await saveAll(allScores, setScoresSaved, ctl.signal);
    setSaving(false);
    if (ctl.signal.aborted) setSaveNote("Paused. Tap again to continue.");
    else setSaveNote(failed ? `${failed} could not be saved. Check the connection and tap again.` : "All music sheets are saved on this device.");
  }

  // Is the open song's sheet on this device? Checked again after saving, and after its images load.
  const [sheetSaved, setSheetSaved] = useState<{ key: string; all: boolean } | null>(null);
  const [checks, setChecks] = useState(0);
  const [brokenSheet, setBrokenSheet] = useState("");   // the song whose sheet failed to load
  const sheetKey = images.join("|");
  useEffect(() => {
    if (!sheetKey) return;
    let live = true;
    const urls = sheetKey.split("|");
    const check = () => countSaved(urls).then((n) => { if (live) setSheetSaved({ key: sheetKey, all: n === urls.length }); });
    check();
    const t = window.setTimeout(check, 1500);   // the app's offline cache stores an image just after it shows
    return () => { live = false; window.clearTimeout(t); };
  }, [sheetKey, scoresSaved, checks]);
  const thisSaved = sheetSaved?.key === sheetKey ? sheetSaved.all : null;
  const [savingOne, setSavingOne] = useState("");
  async function saveThis() {
    setSavingOne(sheetKey);
    await keepStorage();
    const failed = await saveAll(images, () => {}, new AbortController().signal);
    setSavingOne("");
    setChecks((n) => n + 1);
    countSaved(allScores).then(setScoresSaved);
    setNoteBriefly(failed ? "Could not save. Check the connection." : "Music sheet saved");
  }
  const lyricsStored = passage || load?.source === "saved" || load?.stored !== false;
  const canSave = typeof caches !== "undefined";
  const saveThisButton = canSave && thisSaved === false && (
    <button className="nm-save-one" onClick={saveThis} disabled={!!savingOne}>{savingOne === sheetKey ? "Saving…" : "Save this sheet"}</button>
  );

  // The next and previous songs' scores load in the background, so swiping shows them at once
  useEffect(() => {
    const urls = [next, prev].flatMap((s) => s ? sheetUrls(s) : []);
    if (!urls.length) return;
    const t = window.setTimeout(() => prefetch(urls), 600);
    return () => window.clearTimeout(t);
  }, [next?.id, prev?.id]);

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
    if (!hasSheet) return;
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
    if (load.source === "online") return load.stored === false ? `Lyrics could not be saved on this device · ${n}` : `Lyrics saved for offline · ${n}`;
    if (load.source === "saved") return load.error ? `No connection · showing the lyrics saved ${when ? "on " + when : "earlier"} · ${n}` : `Lyrics saved for offline · ${n}`;
    return load.error ? "Could not load songs. Connect to the internet once to save the hymn book on this device." : "No songs yet.";
  })();

  const cls = ["nm", song ? "reading" : "", noSheet ? "nosheet" : "", playing ? "playing" : "", drawer ? "drawer" : ""].filter(Boolean).join(" ");

  return (
    <div className={cls} data-tab={noSheet ? "lyrics" : tab}>
      <header className="nm-bar">
        {song && <button className="nm-songs-btn" onClick={() => setDrawer((d) => !d)} aria-expanded={drawer} aria-controls="nm-side">Songs</button>}
        {song && <button className="nm-back" onClick={close} aria-label="Back to songs">‹</button>}
        <div className="nm-brand">Nau <span>Mpro</span></div>
        <input className="nm-search" type="search" value={q} placeholder="Number, title or words" aria-label="Search songs"
          onChange={(e) => { setQ(e.target.value); if (song && drawerLayout()) setDrawer(true); }}
          onKeyDown={(e) => { if (e.key === "Enter" && shown[0]) open(shown[0]); }} />
        {!isStandalone() && !inAppBrowser() && (
          <button className="nm-install-btn" onClick={() => window.dispatchEvent(new Event(OPEN_INSTALL_EVENT))} title="Install the Nau Mpro app" aria-label="Install the Nau Mpro app">
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2v8M4.5 6.5 8 10l3.5-3.5M2.5 13.5h11" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
            <span>Install</span>
          </button>
        )}
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
          {!noSheet && (
            <button className="nm-play" onClick={togglePlay} aria-pressed={playing} aria-label="Play" title={playing ? "Leave play mode" : "Play: music sheet fills the screen"}>
              <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2 1l9 5-9 5z" /></svg><span>{playing ? "Playing" : "Play"}</span>
            </button>
          )}
        </div>
      )}

      {song && !noSheet && (
        <div className="nm-tabs" role="tablist" aria-label="View">
          <button role="tab" aria-selected={tab === "lyrics"} aria-controls="nm-lyrics" onClick={() => setTab("lyrics")}>Lyrics</button>
          <button role="tab" aria-selected={tab === "score"} aria-controls="nm-score" onClick={() => setTab("score")}>Music Sheet</button>
        </div>
      )}

      <div className="nm-panes">
        <aside ref={sideRef} className={`nm-side${pull ? " pulled" : ""}${pullState === "idle" ? "" : " pulling"}${showAsk ? " asking" : ""}`} id="nm-side" aria-label="Songs"
          style={pull ? ({ "--nm-pull": `${pull}px` } as CSSProperties) : undefined}>
          {pullState !== "idle" && (
            <div className={`nm-ptr${pullState === "refreshing" ? " spin" : ""}`} aria-hidden="true">
              <svg viewBox="0 0 24 24" style={pullState === "pulling" ? { transform: `rotate(${Math.min(pull / PULL_THRESHOLD, 1) * 300 - 300}deg)` } : undefined}>
                <path className="nm-ptr-arc" d="M12 4 a8 8 0 1 1 -7.4 5" />
                {pullState === "ready" && <path className="nm-ptr-tip" d="M2.2 6.2 l5.4 1.2 -3.6 4.2z" />}
              </svg>
            </div>
          )}
          {pullState === "ready" && <div className="nm-ptr-label" aria-hidden="true">Release to refresh</div>}
          {showAsk && (
            <section className="nm-ask" aria-labelledby="nm-ask-h">
              <h2 id="nm-ask-h">Which church do you go to?</h2>
              <p>We'll show your church's service each Sunday.</p>
              {churchList!.map((c) => (
                <button key={c.id} className={`nm-church${churchId === c.id ? " on" : ""}`} onClick={() => pickChurch(c)}>
                  <span>{c.name}</span>
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg>
                </button>
              ))}
              <button className="nm-later" onClick={() => (asking && church !== null ? setAsking(false) : pickChurch("none"))}>{asking && church !== null ? "Cancel" : "Not now"}</button>
            </section>
          )}
          {categories.length > 1 && (
            <div className="nm-chips" role="group" aria-label="Category">
              <button className={`nm-chip${!cat ? " on" : ""}`} aria-pressed={!cat} onClick={() => setCat("")}>All</button>
              {categories.filter((c, i) => allCats || i < CHIP_LIMIT || c === cat).map((c) => <button key={c} className={`nm-chip${cat === c ? " on" : ""}`} aria-pressed={cat === c} onClick={() => setCat(cat === c ? "" : c)}>{c}</button>)}
              {categories.length > CHIP_LIMIT && (
                <button className="nm-chip-more" aria-expanded={allCats} onClick={() => setAllCats((v) => !v)}>
                  {allCats ? "Fewer categories" : `More categories (${categories.filter((c, i) => i >= CHIP_LIMIT && c !== cat).length})`}
                </button>
              )}
            </div>
          )}
          {languages.length > 1 && (
            <div className="nm-chips" role="group" aria-label="Language">
              <button className={`nm-chip${!lang ? " on" : ""}`} aria-pressed={!lang} onClick={() => setLang("")}>All languages</button>
              {languages.map((l) => <button key={l} className={`nm-chip${lang === l ? " on" : ""}`} aria-pressed={lang === l} onClick={() => setLang(lang === l ? "" : l)}>{l}</button>)}
            </div>
          )}
          {!q && !cat && !lang && (
            <button className="nm-pray-btn" onClick={openPrayer}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" /></svg>
              <span><b>Prayer request</b><small>Ask your church to pray for you</small></span>
              <svg className="nm-pray-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg>
            </button>
          )}
          {churchId && !(service && todayItems.length > 0) && !q && !cat && !lang && (
            <div className="nm-today nm-today-none">
              <span className="nm-today-h">Today’s service</span>
              <p>Not ready yet. Check again on Sunday.</p>
            </div>
          )}
          {service && todayItems.length > 0 && !q && !cat && !lang && (
            <details className="nm-today" open>
              <summary>
                <span className="nm-today-h">Today’s service</span>
                <span className="nm-today-d">{[service.title, service.dateLabel].filter(Boolean).join(" · ")}</span>
              </summary>
              <ol className="nm-today-list">
                {todayItems.map((it, i) => (
                  <li key={i} className="nm-today-item">
                    <span className="nm-today-name">{it.name}</span>
                    {it.subs.map((sub, k) => {
                      const tx = textFor(i, k);
                      if (tx) return (
                        <button key={k} className={`nm-row nm-today-song nm-today-text${tx.id === selId ? " sel" : ""}`} onClick={() => open(tx)} aria-current={tx.id === selId ? "true" : undefined}>
                          <span className="nm-num" aria-hidden="true">¶</span>
                          <span className="nm-rt">{sub.text}</span>
                        </button>
                      );
                      const sg = songFor(sub);
                      return sg ? (
                        <button key={k} className={`nm-row nm-today-song${sg.id === selId ? " sel" : ""}`} onClick={() => open(sg)} aria-current={sg.id === selId ? "true" : undefined}>
                          <span className="nm-num">{sg.number}</span>
                          <span className="nm-rt">{sg.title || "Untitled"}{isUnavailable(sg) && <span className="nm-na">Not available</span>}</span>
                        </button>
                      ) : <span key={k} className="nm-today-sub">{sub.text}</span>;
                    })}
                  </li>
                ))}
              </ol>
            </details>
          )}
          <p className={`nm-saved${load?.error ? " warn" : ""}`} role="status">{savedLine}</p>
          {allScores.length > 0 && typeof caches !== "undefined" && (
            <div className="nm-offline">
              <span className="nm-offline-text" role="status">
                {scoresSaved >= allScores.length ? `All ${allScores.length} music sheet pages saved for offline` : `Music sheet pages saved for offline: ${scoresSaved} of ${allScores.length}`}
                {scoresSaved < allScores.length && <small>{`Saving downloads the sheet pictures for the ${sheetSongs} song${sheetSongs === 1 ? " that has" : "s that have"} one, about ${Math.max(1, Math.round((allScores.length - scoresSaved) * 0.15))} MB. Other songs have lyrics only.`}</small>}
                {saveNote && <small>{saveNote}</small>}
              </span>
              {scoresSaved < allScores.length && (
                <button className="nm-offline-btn" onClick={saveScores} aria-pressed={saving}>
                  {saving ? "Pause" : scoresSaved ? "Save the rest" : "Save all music sheets"}
                </button>
              )}
              {saving && <progress max={allScores.length} value={scoresSaved} aria-label="Music sheets saved" />}
            </div>
          )}
          <ul className="nm-list">
            {shown.map((s) => (
              <li key={s.id}>
                <button className={`nm-row${s.id === selId ? " sel" : ""}`} onClick={() => open(s)} aria-current={s.id === selId ? "true" : undefined}>
                  <span className="nm-num">{s.number}</span>
                  <span className="nm-rt">{s.title || "Untitled"}{isUnavailable(s) && <span className="nm-na">Not available</span>}</span>
                </button>
              </li>
            ))}
            {load && all.length > 0 && !shown.length && <li className="nm-empty">No songs match. Try a number, a title or a line of the words.</li>}
          </ul>
          {churchList !== null || church !== null ? (
            <div className="nm-church-foot">
              <span>{churchId && church !== "none" && church ? `Your church: ${church.name}` : "No church chosen"}</span>
              <button onClick={() => setAsking(true)}>{churchId ? "Change church" : "Choose church"}</button>
            </div>
          ) : null}
        </aside>

        <main className="nm-lyrics" id="nm-lyrics" ref={lyricsRef} aria-label="Lyrics" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
          {song && missing ? (
            <section className="nm-missing" aria-labelledby="nm-missing-h">
              <h2 id="nm-missing-h">Song {song.number} is not available</h2>
              <p>Its page is missing from the scanned hymn book, so the words and music sheet are not here.</p>
              <p>Look up number {song.number} in a printed Nau Mpro book, or ask the person leading the singing.</p>
              <div className="nm-actions">
                <button className="nm-go" onClick={close}>Back to the song list</button>
                {next && <button className="nm-alt" onClick={() => open(next)}>Next song</button>}
              </div>
            </section>
          ) : song ? (
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
              <p className="nm-avail">
                <span>{lyricsStored ? "Lyrics saved for offline" : "Lyrics need a connection next time"}</span>
                {!passage && <span>{!hasSheet ? "No music sheet for this song"
                  : !images.length ? "Music sheet (PDF) may need a connection"
                  : !canSave ? "This browser can’t save the music sheet"
                  : thisSaved === null ? "Checking the music sheet…"
                  : thisSaved ? "Music sheet saved for offline" : "Music sheet not saved for offline"}</span>}
                {saveThisButton}
              </p>
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
            <section className="nm-welcome" aria-labelledby="nm-welcome-h">
              <h1 id="nm-welcome-h">Choose a song</h1>
              <ul>
                <li><b>Find it</b> by typing a number, a title or a line of the words in the search box.</li>
                <li><b>Browse</b> the list, or narrow it with the category and language buttons.</li>
                <li><b>Before church</b>, lyrics are saved for offline after they load. To have music sheets without a connection too, use “Save all music sheets” above the list.</li>
              </ul>
              <div className="nm-actions">
                {firstToday && <button className="nm-go" onClick={() => open(firstToday)}>Start Today’s service: {firstToday.number} {firstToday.title}</button>}
                <button className="nm-alt" onClick={openPrayer}>Send a prayer request</button>
              </div>
            </section>
          )}
        </main>

        <section className="nm-score" id="nm-score" ref={scoreRef} aria-label="Music sheet" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
          {song && (images.length ? (
            <div className="nm-score-inner" style={{ width: `${zoom * 100}%` }}>
              {!playing && thisSaved === false && <p className="nm-avail"><span>Music sheet not saved for offline</span>{saveThisButton}</p>}
              {brokenSheet === sheetKey && <p className="nm-empty" role="alert">The music sheet could not load. It is not saved on this device yet: connect to the internet and open this song again.</p>}
              {images.map((src, i) => (
                <figure key={src}>
                  <img src={src} alt={`Music sheet for hymn ${song.number}, part ${i + 1} of ${images.length}`} loading={i ? "lazy" : "eager"}
                    onLoad={() => { setBrokenSheet(""); setChecks((n) => n + 1); }} onError={() => setBrokenSheet(sheetKey)} />
                  {images.length > 1 && <figcaption>Part {i + 1} of {images.length}</figcaption>}
                </figure>
              ))}
            </div>
          ) : pdf ? (
            <p className="nm-empty"><a href={pdf} target="_blank" rel="noopener">Open the music sheet (PDF)</a></p>
          ) : (
            <p className="nm-empty">{missing ? "This song is not available." : "No music sheet for this song."}</p>
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
      {note && <div className="nm-note" role="status">{note}</div>}
      {praying && <PrayerSheet church={prayerChurch} onClose={closePrayer}
        onChooseChurch={() => { closePrayer(); setAsking(true); if (song && drawerLayout()) setDrawer(true); }} />}
      <InstallPrompt />
      <OpenInBrowser />
    </div>
  );
}
