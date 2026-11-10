import { useEffect, useMemo, useRef, useState } from "react";
import PptxGenJS from "pptxgenjs";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import NavBar from "../components/NavBar";
import { toast as showToast } from "../lib/toast";
import {
  buildDeck, COLOR_PRESETS, expandShortcuts, FONTS, MARGIN_IN, SLIDE_H_IN, SLIDE_W_IN, SLIDE_W_PT, USABLE_H, USABLE_W, sizeWarning, takeMetaLines, type Slide,
} from "../lib/slides";
import { SONG_CATEGORIES, SONG_LANGUAGES, type SongLook } from "./Lyrics";

// Lyric V2: the Lyrics page in the find | edit | check layout.
// It reads and writes the same songs, drafts and browser storage as the Lyrics page, so the two stay in step.
interface SavedSong {
  look?: Partial<SongLook>;
  id: string;
  title: string;
  number: string;
  lyrics?: string;   // undefined until the song is opened (the list loads without lyrics)
  owner?: string;
  category?: string;
  language?: string;
}

const SONGS_KEY = "lyricsSongs";
const LYRICS_DRAFT = "lyricsDraft";
const PROJECTOR_KEY = "lyricsDeck";

function loadLocal(): SavedSong[] {
  try { return JSON.parse(localStorage.getItem(SONGS_KEY) || "[]"); } catch { return []; }
}
function storeLocal(list: SavedSong[]) {
  try { localStorage.setItem(SONGS_KEY, JSON.stringify(list)); } catch { /* storage blocked */ }
}

// Sort by song number (numeric, so 9 comes before 10). Songs with no number go last, then by name.
function songLabel(s: SavedSong): string {
  const first = (s.lyrics || "").split("\n").find((l) => l.trim()) || "";
  const name = s.title || first.slice(0, 40) || "(untitled)";
  return s.number ? `${s.number}. ${name}` : name;
}
function sortedSongs(songs: SavedSong[]): SavedSong[] {
  const num = (s: SavedSong) => { const n = parseFloat(s.number); return isNaN(n) ? Infinity : n; };
  return songs.slice().sort((a, b) => {
    const d = num(a) - num(b);
    if (d !== 0 && !isNaN(d)) return d;
    return songLabel(a).localeCompare(songLabel(b), undefined, { numeric: true });
  });
}

// Song ids that are in the Presentation Builder's working presentation (kept for this browser tab)
function songIdsInPresentation(): Set<string> {
  try {
    const d = JSON.parse(sessionStorage.getItem("builderDraft") || "null");
    const items: { kind?: string; songId?: string }[] = d?.items ?? [];
    return new Set(items.filter((i) => i.kind === "song" && i.songId).map((i) => i.songId as string));
  } catch {
    return new Set();
  }
}

export default function LyricsV2() {
  // Form
  // The unsaved song and its formatting are kept for this browser tab, so moving to another page keeps them
  const draft = useMemo(() => {
    try { return JSON.parse(sessionStorage.getItem(LYRICS_DRAFT) || "null"); } catch { return null; }
  }, []);
  const [songTitle, setSongTitle] = useState<string>(draft?.songTitle ?? "");
  const [songNumber, setSongNumber] = useState<string>(draft?.songNumber ?? "");
  const [songCategory, setSongCategory] = useState<string>(draft?.songCategory ?? "");
  const [songLanguage, setSongLanguage] = useState<string>(draft?.songLanguage ?? "");
  const [lyrics, setLyrics] = useState<string>(draft?.lyrics ?? "");
  const [font, setFont] = useState<string>(draft?.font ?? "Arial");
  const [perSlide, setPerSlide] = useState<number>(draft?.perSlide ?? 4);
  const [customSize, setCustomSize] = useState<string>(draft?.customSize ?? "");
  const [colorBg, setColorBg] = useState<string>(draft?.colorBg ?? "#213648");
  const [colorText, setColorText] = useState<string>(draft?.colorText ?? "#f5f2ea");
  const [showTitle, setShowTitle] = useState<boolean>(draft?.showTitle ?? true);
  const [showLabels, setShowLabels] = useState<boolean>(draft?.showLabels ?? true);
  const [removeRepeats, setRemoveRepeats] = useState<boolean>(draft?.removeRepeats ?? false);
  useEffect(() => {
    try {
      sessionStorage.setItem(LYRICS_DRAFT, JSON.stringify({
        songTitle, songNumber, songCategory, songLanguage, lyrics, font, perSlide, customSize, colorBg, colorText, showTitle, showLabels, removeRepeats,
      }));
    } catch { /* storage blocked */ }
  }, [songTitle, songNumber, songCategory, songLanguage, lyrics, font, perSlide, customSize, colorBg, colorText, showTitle, showLabels, removeRepeats]);
  // How many preview slides sit side by side (a smaller preview shows more slides at once)

  // Saved songs and account
  const [songs, setSongs] = useState<SavedSong[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [loaded, setLoaded] = useState(false); // the song list has arrived (or failed)
  const [confirmDel, setConfirmDel] = useState(false); // Delete asks first, in the page
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState("Paste lyrics to start.");
  const [statusIsError, setStatusIsError] = useState(false);

  const lyricsRef = useRef<HTMLTextAreaElement>(null);

  // Opened from the Presentation Builder: #lyrics:<songId> opens that song, and a link goes back
  const [openId] = useState(() => window.location.hash.match(/^#lyrics(?:-v2)?:(.+)$/)?.[1] ?? "");
  const openedRef = useRef(false);
  const [returnToBuilder] = useState(() => {
    try { return sessionStorage.getItem("returnToBuilder") === "builder"; } catch { return false; }
  });
  useEffect(() => {
    if (!openId || openedRef.current || !songs.length) return;
    const song = songs.find((x) => x.id === openId);
    openedRef.current = true;
    if (!song) return;
    ensureLyrics(song).then((full) => {
      if (!full) return;
      fillForm(full);
      say(`Editing "${song.title || "(untitled)"}". Change the formatting, save, then go back.`);
    });
    // Runs when the song list arrives
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [songs]);

  const say = (msg: string, error = false) => { setStatus(msg); setStatusIsError(error); showToast(msg, error); };

  // The slides, rebuilt whenever a setting changes
  const deck = useMemo(
    () => buildDeck({
      lyrics, font, perSlide, removeRepeats, showTitle, songTitle, songNumber,
      customSize: parseInt(customSize, 10) || 0,
    }),
    [lyrics, font, perSlide, removeRepeats, showTitle, songTitle, songNumber, customSize],
  );
  const slides = deck.slides;
  const warning = sizeWarning(slides, font, deck.size);

  // ---------- Saved songs ----------
  // The list loads without the lyrics text (it can be large). A song's lyrics are fetched when it is opened,
  // and kept in this cache so the list does not fetch them again.
  const lyricsCache = useRef(new Map<string, string>());
  const withCached = (s: SavedSong): SavedSong => {
    const l = lyricsCache.current.get(s.id);
    return l === undefined ? s : { ...s, lyrics: l };
  };
  // Returns the song with its lyrics, fetching them if needed (null if the fetch failed)
  async function ensureLyrics(s: SavedSong): Promise<SavedSong | null> {
    if (s.lyrics !== undefined || !supabase) return s.lyrics === undefined ? { ...s, lyrics: "" } : s;
    const cached = lyricsCache.current.get(s.id);
    if (cached !== undefined) return { ...s, lyrics: cached };
    const { data, error } = await supabase.from("lyric_songs").select("lyrics").eq("id", s.id).single();
    if (error) { say("Could not open the song: " + error.message, true); return null; }
    lyricsCache.current.set(s.id, data.lyrics ?? "");
    setSongs((cur) => cur.map((x) => (x.id === s.id ? { ...x, lyrics: data.lyrics ?? "" } : x)));
    return { ...s, lyrics: data.lyrics ?? "" };
  }
  async function pickSong(s: SavedSong) {
    const full = await ensureLyrics(s);
    if (full) fillForm(full);
  }

  const refreshSongs = async (user: Session["user"] | null) => {
    if (supabase) {
      // Reading is public: everyone sees the shared songs, signed in or not. Lyrics are not loaded here.
      const { data, error } = await supabase
        .from("lyric_songs")
        .select("id, title, song_number, owner_id, look, category, language")
        .order("updated_at", { ascending: false });
      if (error) { say("Could not load songs: " + error.message, true); setSongs([]); setLoaded(true); return; }
      setSongs(data.map((r) => withCached({ id: r.id, title: r.title, number: r.song_number, owner: r.owner_id, look: r.look ?? {}, category: r.category ?? "", language: r.language ?? "" })));
    } else {
      setSongs(loadLocal());
    }
    void user;
    setLoaded(true);
  };

  useEffect(() => {
    if (!supabase) { refreshSongs(null); return; }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      refreshSongs(data.session?.user ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      refreshSongs(s?.user ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);
    const user = session?.user ?? null;

  // Favourites and recently used songs (this browser)
  const FAV_KEY = "lyricsFavorites";
  const RECENT_KEY = "lyricsRecent";
  const [favorites, setFavorites] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(FAV_KEY) || "[]"); } catch { return []; }
  });
  const [recent, setRecent] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]"); } catch { return []; }
  });
  const [query, setQuery] = useState("");
  useEffect(() => { try { localStorage.setItem(FAV_KEY, JSON.stringify(favorites)); } catch { /* blocked */ } }, [favorites]);
  useEffect(() => { try { localStorage.setItem(RECENT_KEY, JSON.stringify(recent)); } catch { /* blocked */ } }, [recent]);

  function toggleFavorite() {
    if (!selectedId) return;
    setFavorites((cur) => (cur.includes(selectedId) ? cur.filter((x) => x !== selectedId) : [...cur, selectedId]));
  }

  function fillForm(song: SavedSong | null) {
    if (song) setRecent((cur) => [song.id, ...cur.filter((x) => x !== song.id)].slice(0, 8));
    setSelectedId(song?.id ?? "");
    setConfirmDel(false);
    setSongTitle(song?.title ?? "");
    setSongNumber(song?.number ?? "");
    setSongCategory(song?.category ?? "");
    setSongLanguage(song?.language ?? "");
    setLyrics(song?.lyrics ?? "");
    // A song brings back its own formatting; a new song keeps the current settings
    if (song?.look && Object.keys(song.look).length) {
      const l = song.look;
      if (l.font) setFont(l.font);
      if (l.perSlide) setPerSlide(l.perSlide);
      if (l.customSize !== undefined) setCustomSize(l.customSize ? String(l.customSize) : "");
      if (l.bg) setColorBg(l.bg);
      if (l.fg) setColorText(l.fg);
      if (l.showTitle !== undefined) setShowTitle(l.showTitle);
      if (l.showLabels !== undefined) setShowLabels(l.showLabels);
      if (l.removeRepeats !== undefined) setRemoveRepeats(l.removeRepeats);
    }
  }

  // The current formatting, saved with the song
  function currentLook(): SongLook {
    return {
      font, perSlide, customSize: parseInt(customSize, 10) || 0, bg: colorBg, fg: colorText,
      showTitle, showLabels, removeRepeats,
    };
  }

  // Picking a category or language saves it straight away for a song you own
  async function setSongMeta(field: "category" | "language", value: string) {
    if (field === "category") setSongCategory(value); else setSongLanguage(value);
    const song = songs.find((x) => x.id === selectedId);
    if (!song || (supabase && song.owner !== user?.id)) return; // not saved yet, or someone else's: saved with the next Save
    if (supabase && user) {
      const { error } = await supabase.from("lyric_songs").update({ [field]: value }).eq("id", song.id);
      if (error) { say("Could not save " + field + ": " + error.message, true); return; }
    } else {
      storeLocal(loadLocal().map((x) => (x.id === song.id ? { ...x, [field]: value } : x)));
    }
    setSongs((cur) => cur.map((x) => (x.id === song.id ? { ...x, [field]: value } : x)));
    say(`${field === "category" ? "Category" : "Language"} saved.`);
  }

  async function saveCurrent(): Promise<SavedSong | null> {
    if (!lyrics.trim()) return null;
    if (supabase && !user) { say("Sign in to save songs. Everyone can view them without signing in.", true); return null; }
    let existing = songs.find((s) => s.id === selectedId) ?? null;
    // A song someone else saved can't be changed: saving makes your own copy
    if (supabase && existing && existing.owner !== user?.id) existing = null;
    const look = currentLook();
    const row = { title: songTitle.trim(), song_number: songNumber.trim(), lyrics, look, category: songCategory, language: songLanguage };
    if (supabase && user) {
      const q = existing
        ? supabase.from("lyric_songs").update(row).eq("id", existing.id).select("id").single()
        : supabase.from("lyric_songs").insert(row).select("id").single();
      const { data, error } = await q;
      if (error) { say("Could not save: " + error.message, true); return null; }
      const saved: SavedSong = { id: data.id, title: row.title, number: row.song_number, lyrics, look, category: row.category, language: row.language, owner: user.id };
      // Update just this song in the list (no reload of the whole list)
      lyricsCache.current.set(saved.id, lyrics);
      setSongs((cur) => (cur.some((x) => x.id === saved.id) ? cur.map((x) => (x.id === saved.id ? saved : x)) : [saved, ...cur]));
      setSelectedId(saved.id);
      return saved;
    }
    const list = loadLocal();
    const id = existing?.id ?? String(Date.now());
    const song: SavedSong = { id, title: row.title, number: row.song_number, lyrics, look, category: row.category, language: row.language };
    const idx = list.findIndex((s) => s.id === id);
    if (idx >= 0) list[idx] = song; else list.unshift(song);
    storeLocal(list);
    await refreshSongs(null);
    setSelectedId(id);
    return song;
  }

  // A saved song that has been edited (and that you may change): offer to approve the update or not
  const pendingUpdate = (() => {
    const saved = songs.find((s) => s.id === selectedId);
    if (!saved || saved.lyrics === undefined || (supabase && saved.owner !== user?.id)) return null;
    const changed = saved.lyrics !== lyrics || saved.title !== songTitle.trim() || saved.number !== songNumber.trim();
    return changed ? saved : null;
  })();
  async function onApproveUpdate() {
    if (await saveCurrent()) say(supabase ? "Update approved and saved." : "Update approved and saved in this browser.");
  }
  // Not approved: the editor goes back to the saved version
  function onDeclineUpdate() {
    if (!pendingUpdate) return;
    fillForm(pendingUpdate);
    say("Update not saved. The song is back to its saved version.");
  }

  async function onSave() {
    if (await saveCurrent()) say(supabase ? "Song saved." : "Song saved in this browser.");
    else if (!lyrics.trim()) say("Paste lyrics before saving.", true);
  }

  // Save the song, then open the Presentation Builder, where it is at the top of Recent songs
  // Stays on this page: confirms the song was saved and listed for the Presentation Builder
  async function onAddToPresentation() {
    const saved = await saveCurrent();
    if (!saved) { say("Not added. Paste lyrics and sign in first, so the song can be saved.", true); return; }
    setAddedNow((cur) => [...cur.filter((x) => x.id !== saved.id), { id: saved.id, title: saved.title || "(untitled)", number: saved.number }]);
    // Remember this addition for the builder's Recent songs list (newest first)
    try {
      const log: { id: string; at: number }[] = JSON.parse(localStorage.getItem("addedSongsLog") || "[]");
      localStorage.setItem("addedSongsLog", JSON.stringify([{ id: saved.id, at: Date.now() }, ...log.filter((x) => x.id !== saved.id)].slice(0, 30)));
      // Adding a song again brings it back into the builder's Recent songs, even if it was removed there
      const hidden: string[] = JSON.parse(localStorage.getItem("builderHiddenRecentSongs") || "[]");
      localStorage.setItem("builderHiddenRecentSongs", JSON.stringify(hidden.filter((x) => x !== saved.id)));
    } catch { /* storage blocked */ }
    // Visible confirmation: a toast and a short "Added" label on the button
    setJustAdded(true);
    window.setTimeout(() => setJustAdded(false), 2000);
    say(`Added "${saved.title || "(untitled)"}" to the presentation. Open the Presentation Builder to arrange it.`);
  }

  async function onNext() {
    await saveCurrent();
    fillForm(null);
    say("Ready for the next song.");
  }

  async function onDelete() {
    if (!selectedId) return;
    if (supabase && !user) { say("Sign in to delete songs.", true); return; }
    if (!confirmDel) { setConfirmDel(true); return; }
    setConfirmDel(false);
    if (supabase && user) {
      const mine = songs.find((s) => s.id === selectedId);
      if (mine && mine.owner !== user.id) { say("You can only delete songs you saved.", true); return; }
      const { error } = await supabase.from("lyric_songs").delete().eq("id", selectedId);
      if (error) { say("Could not delete: " + error.message, true); return; }
    } else {
      storeLocal(loadLocal().filter((s) => s.id !== selectedId));
    }
    lyricsCache.current.delete(selectedId);
    await refreshSongs(user);
    fillForm(null);
  }


  // Search: signed in, the server searches every song's title, number and lyrics (200 results at most).
  // Signed out, the lyrics are already in this browser, so the search runs here.
  const [serverHits, setServerHits] = useState<SavedSong[] | null>(null);
  useEffect(() => {
    const term = query.trim();
    if (!supabase || !term) { setServerHits(null); return; }
    const timer = window.setTimeout(async () => {
      const safe = term.replace(/[,()*%]/g, " ");
      if (!supabase) return;
      const { data, error } = await supabase
        .from("lyric_songs")
        .select("id, title, song_number, owner_id, look, category, language")
        .or(`title.ilike.%${safe}%,song_number.ilike.%${safe}%,lyrics.ilike.%${safe}%`)
        .order("updated_at", { ascending: false })
        .limit(200);
      if (error) { say("Search failed: " + error.message, true); return; }
      setServerHits((data ?? []).map((r) => withCached({ id: r.id, title: r.title, number: r.song_number, owner: r.owner_id, look: r.look ?? {}, category: r.category ?? "", language: r.language ?? "" })));
    }, 300);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  // ---------- Editor helpers ----------
  // Shortcuts ("v1" → "Verse 1") and Title/Number lines move as you type
  function onLyricsChange(text: string, caret: number) {
    const expanded = expandShortcuts(text, caret);
    const taken = takeMetaLines(expanded.text, expanded.caret);
    if (taken.title) setSongTitle(taken.title);
    if (taken.number) setSongNumber(taken.number);
    setLyrics(taken.text);
    requestAnimationFrame(() => {
      const ta = lyricsRef.current;
      if (ta) ta.selectionStart = ta.selectionEnd = taken.caret;
    });
  }

  // ---------- Output ----------
  function downloadPptx() {
    if (!slides.length) return;
    const pptx = new PptxGenJS();
    pptx.layout = "LAYOUT_WIDE";
    pptx.title = deck.title || "Lyrics";
    const bg = colorBg.replace("#", "");
    const fg = colorText.replace("#", "");
    for (const lines of slides) {
      const sl = pptx.addSlide();
      sl.background = { color: bg };
      if (lines.label && showLabels) {
        sl.addText(lines.label, {
          x: SLIDE_W_IN - MARGIN_IN - 3, y: SLIDE_H_IN - MARGIN_IN - 0.5, w: 3, h: 0.5,
          fontFace: font, fontSize: 28, bold: true, color: fg,
          transparency: lines.label.startsWith("V") ? 35 : 0,
          align: "right", valign: "bottom", margin: 0,
        });
      }
      sl.addText(lines.join("\n"), {
        x: MARGIN_IN, y: MARGIN_IN, w: USABLE_W, h: USABLE_H,
        fontFace: font, fontSize: deck.size, bold: true, color: fg,
        align: "center", valign: "middle", margin: 0,
        lineSpacingMultiple: 1.1, fit: "none",
      });
    }
    const safe = (deck.title || "lyrics").replace(/[^\w]+/g, "-").replace(/^-|-$/g, "").slice(0, 50) || "lyrics";
    pptx.writeFile({ fileName: `${safe}.pptx` });
  }

  function openProjector() {
    const payload = {
      font,
      size: deck.size,
      bg: colorBg,
      fg: colorText,
      showLabels,
      slides: slides.map((s: Slide) => ({ label: s.label || "", rows: [...s] })),
    };
    try { localStorage.setItem(PROJECTOR_KEY, JSON.stringify(payload)); } catch { /* storage blocked */ }
    window.open(`${import.meta.env.BASE_URL}#projector`, "_blank");
  }

  const sorted = sortedSongs(songs);
  // Category and language filters for the picker ("" = all, "none" = not set)
  const [filterCat, setFilterCat] = useState("");
  const [filterLang, setFilterLang] = useState("");
  const matchesFilter = (s: SavedSong) =>
    (!filterCat || (filterCat === "none" ? !s.category : s.category === filterCat)) &&
    (!filterLang || (filterLang === "none" ? !s.language : s.language === filterLang));
  const shown = sorted.filter(matchesFilter);

  // Songs added from this page in this browser tab, so each add can be confirmed and listed
  const [addedNow, setAddedNow] = useState<{ id: string; title: string; number: string }[]>(() => {
    try { return JSON.parse(sessionStorage.getItem("lyricsAddedNow") || "[]"); } catch { return []; }
  });
  useEffect(() => {
    try { sessionStorage.setItem("lyricsAddedNow", JSON.stringify(addedNow)); } catch { /* storage blocked */ }
  }, [addedNow]);

  // Search over title, number and lyrics; favourites and recent songs are shown when not searching
  const q = query.trim().toLowerCase();
  const searchResults = q
    ? (supabase ? (serverHits ?? []).filter(matchesFilter) : shown.filter((s) => `${s.number} ${s.title} ${s.lyrics ?? ""}`.toLowerCase().includes(q)))
    : [];
  // The default list shows each song once: the selected copy, else your own, else the first one
  const songKey = (s: SavedSong) => `${s.number.trim()}|${s.title.trim()}`.toLowerCase();
  const bestOf = new Map<string, SavedSong>();
  for (const s of shown) {
    const cur = bestOf.get(songKey(s));
    if (!cur || s.id === selectedId || (cur.id !== selectedId && user && s.owner === user.id && cur.owner !== user.id)) bestOf.set(songKey(s), s);
  }
  const allDefault = shown.filter((s) => bestOf.get(songKey(s))?.id === s.id);
  const favSongs = shown.filter((s) => favorites.includes(s.id));
  const recentSongs = recent.map((id) => songs.find((s) => s.id === id)).filter((s): s is SavedSong => !!s && matchesFilter(s));
  const inPresentation = new Set<string>([...songIdsInPresentation(), ...addedNow.map((x) => x.id)]);
  const selectedInPresentation = !!selectedId && inPresentation.has(selectedId);

  const [justAdded, setJustAdded] = useState(false);

  // Slide shown in the main preview (the thumbnails below pick it)
  const [previewIdx, setPreviewIdx] = useState(0);
  const shownIdx = Math.min(previewIdx, Math.max(0, slides.length - 1));
  const current = slides[shownIdx];
  const sizeMode: "auto" | "manual" = customSize ? "manual" : "auto";
  const appearanceSummary = `${font} · ${perSlide} lines · ${customSize ? `${customSize} pt` : "Automatic font size"}`;

  // One row of the song list
  const songRow = (s: SavedSong, group: string) => (
    <li key={`${group}-${s.id}`}>
      <button
        type="button"
        className="lv2-song"
        aria-current={s.id === selectedId ? "true" : undefined}
        onClick={() => { if (s.id !== selectedId) pickSong(s); }}
      >
        <span className="lv2-song-name">
          {inPresentation.has(s.id) && <span className="lv2-tick" title="In presentation" aria-label="In presentation">✓ </span>}
          {songLabel(s)}
        </span>
        <span className="lv2-song-meta">{[s.category || "No category", s.language || "No language"].join(" · ")}</span>
      </button>
    </li>
  );
  const listIsEmpty = q ? !searchResults.length : !allDefault.length;
  const filtering = !!(q || filterCat || filterLang);
  const isFavourite = !!selectedId && favorites.includes(selectedId);

  return (
    <>
      <NavBar />
      <div className="lv2">
        <header className="lv2-top">
          <h1>Lyrics</h1>
          <div className="lv2-top-actions lv2-top-actions-desk">
            <button className="secondary" onClick={downloadPptx} disabled={!slides.length}>Download PowerPoint</button>
            <button className="primary" onClick={openProjector} disabled={!slides.length}>Present</button>
          </div>
        </header>

        {returnToBuilder && (
          <div className="return-bar">
            <span>Editing a song for a presentation.</span>
            <button onClick={() => {
              try { sessionStorage.removeItem("returnToBuilder"); } catch { /* storage blocked */ }
              window.location.hash = "#builder";
            }}>Back to Presentation Builder</button>
          </div>
        )}

        <div className="lv2-grid">
          {/* Find a song */}
          <aside className="lv2-card lv2-lib" aria-label="Song library">
            <div className="lv2-lib-head">
              <input className="lv2-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search title, number or lyrics" aria-label="Search songs" />
              <div className="lv2-filters">
                <select value={filterCat} onChange={(e) => setFilterCat(e.target.value)} aria-label="Filter songs by category">
                  <option value="">All categories</option>
                  {SONG_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  <option value="none">No category</option>
                </select>
                <select value={filterLang} onChange={(e) => setFilterLang(e.target.value)} aria-label="Filter songs by language">
                  <option value="">All languages</option>
                  {SONG_LANGUAGES.map((l) => <option key={l} value={l}>{l}</option>)}
                  <option value="none">No language</option>
                </select>
              </div>
              <button type="button" className="secondary lv2-new" onClick={() => fillForm(null)}>+ New song</button>
            </div>
            <ul className="lv2-songs">
              {!loaded && <li className="lv2-list-note">Loading songs…</li>}
              {loaded && !songs.length && <li className="lv2-list-note">No saved songs yet. Paste lyrics and save to start the list.</li>}
              {loaded && songs.length > 0 && listIsEmpty && (
                <li className="lv2-list-note">
                  No songs match.
                  {filtering && <button type="button" className="quiet small" onClick={() => { setQuery(""); setFilterCat(""); setFilterLang(""); }}>Clear search and filters</button>}
                </li>
              )}
              {q ? (
                <>
                  {searchResults.length > 0 && <li className="lv2-group">Results ({searchResults.length})</li>}
                  {searchResults.map((s) => songRow(s, "res"))}
                </>
              ) : (
                <>
                  {favSongs.length > 0 && <li className="lv2-group">Favourites</li>}
                  {favSongs.map((s) => songRow(s, "fav"))}
                  {recentSongs.length > 0 && <li className="lv2-group">Recently used</li>}
                  {recentSongs.map((s) => songRow(s, "rec"))}
                  {allDefault.length > 0 && <li className="lv2-group">All songs</li>}
                  {allDefault.map((s) => songRow(s, "all"))}
                </>
              )}
            </ul>
          </aside>

          {/* Edit the song */}
          <section className="lv2-card lv2-editor" aria-label="Song editor">
            <p className="lv2-note">
              If the lyric is incorrect, you can make changes and then save the song.
              <span lang="vi">Nếu lời bài hát chưa đúng, bạn có thể chỉnh sửa rồi lưu bài hát.</span>
            </p>

            <div className="lv2-title-row">
              <input id="songTitle" className="lv2-title" aria-label="Song title" value={songTitle} placeholder="Song title" onChange={(e) => setSongTitle(e.target.value)} />
              <input id="songNumber" className="lv2-number" aria-label="Number" value={songNumber} placeholder="No." onChange={(e) => setSongNumber(e.target.value)} />
              <button type="button" className={`lv2-star${isFavourite ? " on" : ""}`} onClick={toggleFavorite} disabled={!selectedId} aria-label="Favourite this song" aria-pressed={isFavourite} title={selectedId ? "Favourite" : "Save or choose a song to favourite it"}>★</button>
            </div>
            <div className="lv2-meta-row">
              <select id="songCategory" aria-label="Category" value={songCategory} onChange={(e) => setSongMeta("category", e.target.value)}>
                <option value="">No category</option>
                {SONG_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <select id="songLanguage" aria-label="Language" value={songLanguage} onChange={(e) => setSongMeta("language", e.target.value)}>
                <option value="">No language</option>
                {SONG_LANGUAGES.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
              {selectedInPresentation && <span className="lv2-chip">In presentation</span>}
            </div>

            {pendingUpdate && (
              <div className="lv2-approve" role="alert">
                <span><strong>Update this song?</strong> You changed the lyrics of “{pendingUpdate.title || "this song"}”.</span>
                <span className="lv2-approve-actions">
                  <button className="primary small" onClick={onApproveUpdate}>Approve update</button>
                  <button className="secondary small" onClick={onDeclineUpdate}>Don’t update</button>
                </span>
              </div>
            )}

            <div className="lv2-lyrics-field">
              <textarea
                id="lyrics" aria-label="Lyrics"
                ref={lyricsRef}
                className="lv2-lyrics"
                value={lyrics}
                placeholder=""
                onChange={(e) => onLyricsChange(e.target.value, e.target.selectionStart)}
              />
              {!lyrics && <span className="lv2-empty-hint" aria-hidden="true">Choose a song or paste your lyric here</span>}
            </div>

            <p className={statusIsError ? "lv2-status error" : "lv2-status"} role="status">{status}</p>
            {warning && <p className="lv2-status">{warning}</p>}

            <div className="lv2-actions">
              <button className="secondary" onClick={onNext}>Next Song</button>
              <span className="lv2-actions-end">
                <details className="lv2-more">
                  <summary>More</summary>
                  <div className="lv2-menu">
                    <button className="secondary danger" onClick={(e) => { (e.currentTarget.closest("details") as HTMLDetailsElement).open = false; onDelete(); }} disabled={!selectedId}>Delete song</button>
                  </div>
                </details>
                <button className="secondary" onClick={onSave}>Save Song</button>
                <button className={`primary lv2-add${justAdded ? " flash" : ""}`} onClick={onAddToPresentation}>{justAdded ? "✓ Added" : selectedInPresentation ? "✓ In presentation" : "+ Add to Presentation"}</button>
              </span>
            </div>
            {confirmDel && (
              <div className="lv2-confirm" role="alertdialog" aria-label="Delete song">
                <span>Delete “{songTitle || "this song"}”? This cannot be undone.</span>
                <span className="lv2-approve-actions">
                  <button className="secondary danger small" onClick={onDelete}>Delete</button>
                  <button className="secondary small" onClick={() => setConfirmDel(false)}>Cancel</button>
                </span>
              </div>
            )}

            {addedNow.length > 0 && (
              <div className="lv2-added">
                <span className="lv2-added-label">Added this session ({addedNow.length})</span>
                <ul>
                  {addedNow.map((a) => <li key={a.id}>{a.number ? `${a.number}. ` : ""}{a.title}</li>)}
                </ul>
                <button className="secondary small" onClick={() => { window.location.hash = "#builder"; }}>Open Presentation Builder</button>
              </div>
            )}

            <details className="lv2-appearance" open>
              <summary>Slide Appearance <span className="lv2-summary">{appearanceSummary}</span></summary>
              <div className="lv2-appearance-grid">
                <div className="lv2-group">
                  <h3>Typography</h3>
                  <div className="lv2-pair">
                    <label>Font
                      <select id="font" value={font} onChange={(e) => setFont(e.target.value)}>
                        {FONTS.map((f) => <option key={f} value={f}>{f}</option>)}
                      </select>
                    </label>
                    <label>Lines per slide
                      <select id="perSlide" aria-label="Maximum lines per slide" value={perSlide} onChange={(e) => setPerSlide(parseInt(e.target.value, 10))}>
                        {[2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}</option>)}
                      </select>
                    </label>
                  </div>
                  <div className="lv2-size-mode" role="radiogroup" aria-label="Font size mode">
                    <label><input type="radio" name="sizeModeV2" checked={sizeMode === "auto"} onChange={() => setCustomSize("")} /> Automatic size</label>
                    <label><input type="radio" name="sizeModeV2" checked={sizeMode === "manual"} onChange={() => setCustomSize(customSize || "60")} /> Manual</label>
                  </div>
                  <div className="lv2-slider">
                    <input
                      id="fontSize" type="range" min={20} max={200} step={1}
                      disabled={sizeMode === "auto"}
                      value={customSize ? parseInt(customSize, 10) : 60}
                      onChange={(e) => setCustomSize(e.target.value)}
                      aria-label="Font size in points"
                    />
                    <output>{customSize ? `${customSize} pt` : "Auto"}</output>
                  </div>
                </div>
                <div className="lv2-group">
                  <h3>Colours</h3>
                  <div className="lv2-presets" role="group" aria-label="Recommended colours">
                    {COLOR_PRESETS.map((p) => (
                      <button key={p.name} type="button" className={`lv2-preset${colorBg === p.bg && colorText === p.fg ? " on" : ""}`} title={p.name} aria-label={p.name} aria-pressed={colorBg === p.bg && colorText === p.fg}
                        style={{ background: p.bg, color: p.fg }} onClick={() => { setColorBg(p.bg); setColorText(p.fg); }}>Aa</button>
                    ))}
                  </div>
                  <div className="lv2-colors">
                    <label>Background <input type="color" value={colorBg} onChange={(e) => setColorBg(e.target.value)} /></label>
                    <label>Text <input type="color" value={colorText} onChange={(e) => setColorText(e.target.value)} /></label>
                  </div>
                </div>
                <div className="lv2-group">
                  <h3>Display</h3>
                  <label className="lv2-check"><input type="checkbox" checked={showTitle} onChange={(e) => setShowTitle(e.target.checked)} /> Add title slide</label>
                  <label className="lv2-check"><input type="checkbox" checked={showLabels} onChange={(e) => setShowLabels(e.target.checked)} /> Show section labels</label>
                  <label className="lv2-check"><input type="checkbox" checked={removeRepeats} onChange={(e) => setRemoveRepeats(e.target.checked)} /> Remove repeated text</label>
                </div>
              </div>
            </details>
          </section>

          {/* Check the slides */}
          <aside className={`lv2-card lv2-preview${current ? "" : " empty"}`} aria-label="Slide preview">
            <div className="lv2-preview-head">
              <h2>Slide Preview</h2>
              <span className="lv2-sub">Generated from the current lyrics</span>
            </div>

            {current ? (
              <div className="lv2-stage" style={{ background: colorBg, color: colorText, fontFamily: `${font}, sans-serif` }}>
                <div className="lv2-stage-text" style={{ fontSize: `${(deck.size / SLIDE_W_PT) * 100}cqw` }}>{current.join("\n")}</div>
                {current.label && showLabels && <div className="lv2-stage-tag">{current.label}</div>}
              </div>
            ) : (
              <div className="lv2-stage lv2-guide" aria-label="How to start">
                <ol>
                  <li>Choose a song from the list, or paste the lyrics.</li>
                  <li>Check that every verse and chorus is correct.</li>
                  <li>Make any changes you like, the way you want them.</li>
                  <li>Save the song.</li>
                  <li>Click <strong>Add to Presentation</strong> to put your saved song in the slideshow.</li>
                </ol>
              </div>
            )}

            {slides.length > 0 && (
              <>
              <div className="lv2-preview-actions">
                <button className="secondary small" onClick={downloadPptx} disabled={!slides.length}>Download PowerPoint</button>
                <button className="primary small" onClick={openProjector} disabled={!slides.length}>Present</button>
              </div>
              <div className="lv2-nav">
                <button className="secondary small" onClick={() => setPreviewIdx((i) => Math.max(0, i - 1))} disabled={shownIdx === 0}>← Previous</button>
                <span className="lv2-counter">Slide {shownIdx + 1} of {slides.length}</span>
                <button className="secondary small" onClick={() => setPreviewIdx((i) => Math.min(slides.length - 1, i + 1))} disabled={shownIdx >= slides.length - 1}>Next →</button>
              </div>
              </>
            )}

            {slides.length > 0 && (
              <div className="lv2-thumbs" role="list">
                {slides.map((sl, i) => (
                  <button key={i} role="listitem" className={`lv2-thumb${i === shownIdx ? " current" : ""}`} onClick={() => setPreviewIdx(i)} style={{ background: colorBg, color: colorText, fontFamily: `${font}, sans-serif` }} aria-label={`Slide ${i + 1}`} aria-current={i === shownIdx ? "true" : undefined}>
                    <span className="lv2-thumb-num">{i + 1}</span>
                    <span className="lv2-thumb-text">{sl.join(" ")}</span>
                    {sl.label && showLabels && <span className="lv2-thumb-tag">{sl.label}</span>}
                  </button>
                ))}
              </div>
            )}
          </aside>
        </div>
      </div>
    </>
  );
}
