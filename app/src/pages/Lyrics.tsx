import { useEffect, useMemo, useRef, useState } from "react";
import PptxGenJS from "pptxgenjs";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import NavBar from "../components/NavBar";
import {
  buildDeck, expandShortcuts, FONTS, MAX_PT, MARGIN_IN, SLIDE_H_IN, SLIDE_W_IN, SLIDE_W_PT, USABLE_H, USABLE_W,
  parseBulk, sizeWarning, takeMetaLines, type Slide,
} from "../lib/slides";

// A saved song. Signed in: stored in Supabase (lyric_songs). Otherwise: this browser only (localStorage).
// The formatting a song is saved with, so it comes back the same wherever the song is used
export interface SongLook {
  font: string;
  perSlide: number;
  customSize: number;   // 0 = automatic
  bg: string;
  fg: string;
  showTitle: boolean;
  showLabels: boolean;
  removeRepeats: boolean;
}
interface SavedSong {
  look?: Partial<SongLook>;
  id: string;
  title: string;
  number: string;
  lyrics: string;
  owner?: string;
}

const SONGS_KEY = "lyricsSongs";
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

export default function Lyrics() {
  // Form
  const [songTitle, setSongTitle] = useState("");
  const [songNumber, setSongNumber] = useState("");
  const [lyrics, setLyrics] = useState("");
  const [font, setFont] = useState("Arial");
  const [perSlide, setPerSlide] = useState(4);
  const [customSize, setCustomSize] = useState("");
  const [colorBg, setColorBg] = useState("#213648");
  const [colorText, setColorText] = useState("#f5f2ea");
  const [showTitle, setShowTitle] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  const [removeRepeats, setRemoveRepeats] = useState(false);
  // How many preview slides sit side by side (a smaller preview shows more slides at once)
  const [previewCols, setPreviewCols] = useState(3);

  // Saved songs and account
  const [songs, setSongs] = useState<SavedSong[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [session, setSession] = useState<Session | null>(null);
  const [bulkText, setBulkText] = useState("");
  const [status, setStatus] = useState("Paste lyrics to start.");
  const [statusIsError, setStatusIsError] = useState(false);

  const lyricsRef = useRef<HTMLTextAreaElement>(null);

  // Opened from the Presentation Builder: #lyrics:<songId> opens that song, and a link goes back
  const [openId] = useState(() => window.location.hash.match(/^#lyrics:(.+)$/)?.[1] ?? "");
  const openedRef = useRef(false);
  const [returnToBuilder] = useState(() => {
    try { return sessionStorage.getItem("returnToBuilder") === "builder"; } catch { return false; }
  });
  useEffect(() => {
    if (!openId || openedRef.current || !songs.length) return;
    const song = songs.find((x) => x.id === openId);
    if (song) { fillForm(song); say(`Editing "${song.title || "(untitled)"}". Change the formatting, save, then go back.`); }
    openedRef.current = true;
    // Runs when the song list arrives
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [songs]);

  const say = (msg: string, error = false) => { setStatus(msg); setStatusIsError(error); };

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
  const refreshSongs = async (user: Session["user"] | null) => {
    if (supabase) {
      // Reading is public: everyone sees the shared songs, signed in or not
      const { data, error } = await supabase
        .from("lyric_songs")
        .select("id, title, song_number, lyrics, owner_id, look")
        .order("updated_at", { ascending: false });
      if (error) { say("Could not load songs: " + error.message, true); setSongs([]); return; }
      setSongs(data.map((r) => ({ id: r.id, title: r.title, number: r.song_number, lyrics: r.lyrics, owner: r.owner_id, look: r.look ?? {} })));
    } else {
      setSongs(loadLocal());
    }
    void user;
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
    // refreshSongs is stable enough for a one-time subscription
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const user = session?.user ?? null;

  function fillForm(song: SavedSong | null) {
    setSelectedId(song?.id ?? "");
    setSongTitle(song?.title ?? "");
    setSongNumber(song?.number ?? "");
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

  async function saveCurrent(): Promise<SavedSong | null> {
    if (!lyrics.trim()) return null;
    if (supabase && !user) { say("Sign in to save songs. Everyone can view them without signing in.", true); return null; }
    let existing = songs.find((s) => s.id === selectedId) ?? null;
    // A song someone else saved can't be changed: saving makes your own copy
    if (supabase && existing && existing.owner !== user?.id) existing = null;
    const look = currentLook();
    const row = { title: songTitle.trim(), song_number: songNumber.trim(), lyrics, look };
    if (supabase && user) {
      const q = existing
        ? supabase.from("lyric_songs").update(row).eq("id", existing.id).select("id").single()
        : supabase.from("lyric_songs").insert(row).select("id").single();
      const { data, error } = await q;
      if (error) { say("Could not save: " + error.message, true); return null; }
      const saved: SavedSong = { id: data.id, title: row.title, number: row.song_number, lyrics, look };
      await refreshSongs(user);
      setSelectedId(saved.id);
      return saved;
    }
    const list = loadLocal();
    const id = existing?.id ?? String(Date.now());
    const song: SavedSong = { id, title: row.title, number: row.song_number, lyrics, look };
    const idx = list.findIndex((s) => s.id === id);
    if (idx >= 0) list[idx] = song; else list.unshift(song);
    storeLocal(list);
    await refreshSongs(null);
    setSelectedId(id);
    return song;
  }

  async function onSave() {
    if (await saveCurrent()) say(supabase ? "Song saved." : "Song saved in this browser.");
    else if (!lyrics.trim()) say("Paste lyrics before saving.", true);
  }

  // Save the song, then open the Presentation Builder, where it is at the top of Recent songs
  async function onAddToPresentation() {
    const saved = await saveCurrent();
    if (!saved) { say("Paste lyrics and sign in first, so the song can be saved.", true); return; }
    window.location.hash = "#builder";
  }

  async function onNext() {
    await saveCurrent();
    fillForm(null);
    say("Ready for the next song.");
  }

  async function onDelete() {
    if (!selectedId) return;
    if (supabase && !user) { say("Sign in to delete songs.", true); return; }
    if (!window.confirm("Delete this saved song?")) return;
    if (supabase && user) {
      const mine = songs.find((s) => s.id === selectedId);
      if (mine && mine.owner !== user.id) { say("You can only delete songs you saved.", true); return; }
      const { error } = await supabase.from("lyric_songs").delete().eq("id", selectedId);
      if (error) { say("Could not delete: " + error.message, true); return; }
    } else {
      storeLocal(loadLocal().filter((s) => s.id !== selectedId));
    }
    await refreshSongs(user);
    fillForm(null);
  }

  // ---------- Account ----------

  // Copy songs saved in this browser into the account (skips ones already imported)
  async function importSongs() {
    if (!supabase || !user) return;
    const local = loadLocal();
    if (!local.length) { say("No songs saved in this browser."); return; }
    const { data: have } = await supabase.from("lyric_songs").select("local_id").not("local_id", "is", null);
    const done = new Set((have || []).map((r) => r.local_id));
    const rows = local
      .filter((s) => !done.has(s.id))
      .map((s) => ({ title: s.title, song_number: s.number, lyrics: s.lyrics, local_id: s.id }));
    if (!rows.length) { say("All browser songs are already in your account."); return; }
    const { error } = await supabase.from("lyric_songs").insert(rows);
    if (error) { say("Import failed: " + error.message, true); return; }
    await refreshSongs(user);
    say(`Imported ${rows.length} song${rows.length === 1 ? "" : "s"}.`);
  }

  async function bulkSave() {
    const found = parseBulk(bulkText);
    if (!found.length) { say('Nothing to save. Each song must start with a "Title, ..." line.', true); return; }
    if (!supabase || !user) { say("Sign in to save several songs at once.", true); return; }
    const key = (s: { title: string; number: string }) => `${s.number}|${s.title}`.toLowerCase();
    const have = new Set(songs.map((s) => key(s)));
    const fresh = found.filter((s) => !have.has(key(s)));
    if (fresh.length) {
      const { error } = await supabase
        .from("lyric_songs")
        .insert(fresh.map((s) => ({ title: s.title, song_number: s.number, lyrics: s.lyrics })));
      if (error) { say("Bulk save failed: " + error.message, true); return; }
    }
    setBulkText("");
    await refreshSongs(user);
    const skipped = found.length - fresh.length;
    say(`Saved ${fresh.length} song${fresh.length === 1 ? "" : "s"}${skipped ? `, skipped ${skipped} already saved` : ""}.`);
  }

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

  return (
    <>
    <NavBar />
    <div className="lyrics-page">
      {returnToBuilder && (
        <div className="return-bar">
          <span>Editing a song for a presentation.</span>
          <button onClick={() => {
            try { sessionStorage.removeItem("returnToBuilder"); } catch { /* storage blocked */ }
            window.location.hash = "#builder";
          }}>Back to Presentation Builder</button>
        </div>
      )}
      <header>
        <h1>Lyrics to Slides</h1>
        <p className="sub">Paste lyrics, choose a look, then download or open the projector view.</p>
      </header>

      <div className="layout">
        <section className="panel">
          {supabase && user && (
            <div className="account">
              <div className="row">
                <button className="secondary" onClick={importSongs}>Import browser songs</button>
              </div>
              <label>Bulk add (each song starts with a "Title, ..." line)</label>
              <textarea value={bulkText} onChange={(e) => setBulkText(e.target.value)} />
              <button className="secondary" onClick={bulkSave}>Save all songs</button>
            </div>
          )}

          <label htmlFor="savedSongs">Saved songs</label>
          <select id="savedSongs" value={selectedId} onChange={(e) => fillForm(songs.find((s) => s.id === e.target.value) ?? null)}>
            <option value="">{songs.length ? "Choose a saved song" : "No saved songs yet"}</option>
            {sorted.map((s) => <option key={s.id} value={s.id}>{songLabel(s)}</option>)}
          </select>
          <div className="row">
            <button className="secondary" onClick={onSave}>Save song</button>
            <button className="secondary" onClick={onNext}>Next song</button>
            <button onClick={onAddToPresentation}>Add to presentation</button>
          </div>
          <button className="secondary" onClick={onDelete} disabled={!selectedId}>Delete selected song</button>

          <div className="grid2">
            <div>
              <label htmlFor="songTitle">Song title</label>
              <input id="songTitle" value={songTitle} placeholder="Amazing Grace" onChange={(e) => setSongTitle(e.target.value)} />
            </div>
            <div>
              <label htmlFor="songNumber">Song number</label>
              <input id="songNumber" value={songNumber} placeholder="90" onChange={(e) => setSongNumber(e.target.value)} />
            </div>
          </div>

          <label htmlFor="lyrics">Lyrics</label>
          <textarea
            id="lyrics"
            ref={lyricsRef}
            className="lyrics"
            value={lyrics}
            placeholder={"[Verse 1]\nLine one of the verse\n\n[Chorus]\nChorus line one"}
            onChange={(e) => onLyricsChange(e.target.value, e.target.selectionStart)}
          />

          <div className="grid2">
            <div>
              <label htmlFor="font">Font</label>
              <select id="font" value={font} onChange={(e) => setFont(e.target.value)}>
                {FONTS.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="perSlide">Maximum lines per slide</label>
              <select id="perSlide" value={perSlide} onChange={(e) => setPerSlide(parseInt(e.target.value, 10))}>
                {[2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="fontSize">Font size (pt)</label>
              <input id="fontSize" type="number" min={20} max={200} placeholder="Automatic" value={customSize} onChange={(e) => setCustomSize(e.target.value)} />
            </div>
            <div className="colors">
              <label>Colours</label>
              <input type="color" value={colorBg} title="Background" onChange={(e) => setColorBg(e.target.value)} />
              <input type="color" value={colorText} title="Text" onChange={(e) => setColorText(e.target.value)} />
            </div>
          </div>

          <label className="check"><input type="checkbox" checked={showTitle} onChange={(e) => setShowTitle(e.target.checked)} /> Add a title slide</label>
          <label className="check"><input type="checkbox" checked={showLabels} onChange={(e) => setShowLabels(e.target.checked)} /> Show section labels on slides (V1, C1)</label>
          <label className="check"><input type="checkbox" checked={removeRepeats} onChange={(e) => setRemoveRepeats(e.target.checked)} /> Remove repeated text</label>

          <div className="row">
            <button onClick={downloadPptx} disabled={!slides.length}>Download PowerPoint (.pptx)</button>

          </div>
          <p className={statusIsError ? "status error" : "status"}>{warning || status}</p>
        </section>

        <section className="panel preview">
          <div className="preview-head">
            <button className="secondary" onClick={openProjector} disabled={!slides.length}>Open projector view</button>
            <p className="summary">
            {slides.length
              ? `${slides.length} slide${slides.length === 1 ? "" : "s"} · ${deck.size} pt text · ${font}`
                + (deck.notes.repeats ? ` · ${deck.notes.repeats} repeat${deck.notes.repeats === 1 ? "" : "s"} shown once` : "")
              : ""}
            </p>
            <label className="size-pick">
              Preview size
              <select value={previewCols} onChange={(e) => setPreviewCols(parseInt(e.target.value, 10))}>
                <option value={4}>Small</option>
                <option value={3}>Medium</option>
                <option value={2}>Large</option>
                <option value={1}>Full width</option>
              </select>
            </label>
          </div>
          <div className="slides" style={{ gridTemplateColumns: `repeat(${previewCols}, minmax(0, 1fr))` }}>
            {slides.map((lines, i) => (
              <div key={i}>
                <div className="slide-num">Slide {i + 1}</div>
                <div className="slide" style={{ background: colorBg, color: colorText, fontFamily: `${font}, sans-serif` }}>
                  <div className="slide-inner" style={{ fontSize: `${(deck.size / SLIDE_W_PT) * 100}cqw` }}>
                    {lines.join("\n")}
                  </div>
                  {lines.label && showLabels && (
                    <div className="slide-tag" style={{ opacity: lines.label.startsWith("V") ? 0.65 : 1 }}>{lines.label}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
          {!slides.length && <p className="empty">Paste lyrics to see slides. Maximum size is {MAX_PT} pt.</p>}
        </section>
      </div>
    </div>
    </>
  );
}
