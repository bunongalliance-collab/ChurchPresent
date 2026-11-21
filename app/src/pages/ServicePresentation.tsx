import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import NavBar from "../components/NavBar";
import { PROJECTOR_KEY, renderStage, type ProjDeck, type ProjSlide } from "./Projector";
import { flatten, type Item, type Settings } from "./Builder";
import { buildOutput } from "./Scripture";
import { loadDraft } from "./Program";
import { findSongOptions, loadSongOptions, matchSong } from "../lib/recentSongs";
import { PROGRAM_DRAFT_KEY, rowsToLines, subKind } from "../lib/orderLines";
import { STAGES } from "../lib/programPdf";
import { browserMeasure } from "../lib/slides";
import { buildServiceDeck, parseItems, type Resources, type SongData } from "../lib/servicePresentation";

// Service presentation (#service): slides for the whole service, built from the Program's order of worship.
// It reads the Program saved in this browser and the saved songs, readings and scriptures. It keeps no copy of any of them:
// every time the page opens (or Refresh is pressed) the slides are built again from the current data.

const BG = "#213648";
const FG = "#f5f2ea";
const FONT = "Arial";
const SETTINGS: Settings = { font: FONT, perSlide: 4, bg: BG, fg: FG, showLabels: true, removeRepeats: false };

// Load what the Program's lines point at: songs (public), recent readings (this browser) and scripture studies (the owner's)
async function loadResources(lines: ReturnType<typeof rowsToLines>): Promise<Resources> {
  const items = parseItems(lines);
  // Songs typed by hand (or kept from the Program's older format) are matched to a saved song: by "number. title", by number,
  // by title, and, when the song list does not hold it, by asking the database. The whole list is only loaded when needed.
  const typedLabels = [...new Set(items.filter((it) => subKind(it.name) === "song").flatMap((it) => it.subs.filter((s) => !s.line.songId).map((s) => s.text.trim())))];
  const options = typedLabels.length ? await loadSongOptions() : [];
  const resolved = new Map<string, string>();
  for (const label of typedLabels) {
    const id = matchSong(label, options) ?? matchSong(label, await findSongOptions(label));
    if (id) resolved.set(label.toLowerCase(), id);
  }
  const idForLabel = (label: string) => resolved.get(label.trim().toLowerCase());

  const songIds = new Set<string>();
  const readingIds = new Set<string>();
  const studyIds = new Set<string>();
  for (const it of items) {
    for (const sub of it.subs) {
      if (sub.line.readingId) readingIds.add(sub.line.readingId);
      if (sub.line.studyId) studyIds.add(sub.line.studyId);
      if (subKind(it.name) === "song") {
        const id = sub.line.songId ?? idForLabel(sub.text);
        if (id) songIds.add(id);
      }
    }
  }

  // Songs: the saved library (anyone can read it); offline, the copy kept in this browser
  const songs: Record<string, SongData> = {};
  if (songIds.size && supabase) {
    const { data } = await supabase.from("lyric_songs").select("id, title, song_number, lyrics, look").in("id", [...songIds]);
    for (const r of data ?? []) songs[r.id] = { id: r.id, title: r.title ?? "", number: r.song_number ?? "", lyrics: r.lyrics ?? "", look: (r.look ?? {}) as SongData["look"] };
  } else if (songIds.size) {
    try {
      for (const r of JSON.parse(localStorage.getItem("lyricsSongs") || "[]") as { id: string; title?: string; number?: string; lyrics?: string; look?: SongData["look"] }[]) {
        if (songIds.has(r.id)) songs[r.id] = { id: r.id, title: r.title ?? "", number: r.number ?? "", lyrics: r.lyrics ?? "", look: r.look };
      }
    } catch { /* storage blocked */ }
  }

  // Recent readings: the copies the Readings page saved in this browser
  const readings: Record<string, ProjSlide[]> = {};
  try {
    for (const item of JSON.parse(localStorage.getItem("addedReadingsLog") || "[]") as Item[]) {
      if (item.kind === "reading" && readingIds.has(item.id)) readings[item.id] = flatten([item], SETTINGS, 60).slides;
    }
  } catch { /* storage blocked */ }

  // Scripture studies: only the signed-in owner can read them. Built the same way the Builder adds a study.
  const studies: Record<string, ProjSlide[]> = {};
  if (studyIds.size && supabase) {
    const { data } = await supabase.from("scripture_studies").select("id, study_title, data").in("id", [...studyIds]);
    for (const row of data ?? []) {
      const d = row.data as { slides?: unknown[] } & Record<string, unknown>;
      const look = { font: FONT, perSlide: 4, aspect: "16:9", bg: BG, fg: FG, verseNumbers: true, showLabels: false, numColor: "#f2c14e", labelColor: "#f2c14e", ...d };
      const out = buildOutput((d.slides ?? []) as never, look as never);
      if (!out.slides.length) continue;
      const item: Item = {
        kind: "scripture", id: row.id, studyId: row.id, title: row.study_title ?? "",
        slides: out.slides.map((x) => ({ rows: [...x.rows], label: x.label, ref: x.ref, verse: x.verse, fmt: x.fmt, bg: x.bg, fg: x.fg, font: x.font, size: x.size, numColor: x.numColor })),
        numColor: String(look.numColor), labelColor: String(look.labelColor), size: out.size,
      };
      studies[row.id] = flatten([item], SETTINGS, 60).slides;
    }
  }
  return { songs, songIdForLabel: idForLabel, readings, studies };
}

export default function ServicePresentation() {
  const [program, setProgram] = useState(() => loadDraft());
  const lines = useMemo(() => program.lines ?? rowsToLines(program.rows), [program]);
  const [res, setRes] = useState<Resources | null>(null);
  const [index, setIndex] = useState(0);
  const [showWarnings, setShowWarnings] = useState(false);

  // The Program as it was when these slides were built, to notice when it has been edited since (for example in another tab)
  const seenRaw = useRef<string | null>(null);
  const readRaw = () => { try { return localStorage.getItem(PROGRAM_DRAFT_KEY); } catch { return null; } };
  if (seenRaw.current === null) seenRaw.current = readRaw() ?? "";
  const refresh = useCallback(() => { seenRaw.current = readRaw() ?? ""; setRes(null); setProgram(loadDraft()); }, []);
  useEffect(() => {
    const check = () => { if ((readRaw() ?? "") !== seenRaw.current) refresh(); };
    window.addEventListener("storage", check);   // another tab saved the Program
    window.addEventListener("focus", check);     // coming back to this tab
    return () => { window.removeEventListener("storage", check); window.removeEventListener("focus", check); };
  }, [refresh]);
  useEffect(() => {
    let cancelled = false;
    loadResources(lines).then((r) => { if (!cancelled) setRes(r); }).catch(() => { if (!cancelled) setRes({ songs: {}, songIdForLabel: () => undefined, readings: {}, studies: {} }); });
    return () => { cancelled = true; };
  }, [lines, program]);

  const result = useMemo(() => {
    if (!res) return null;
    return buildServiceDeck(
      { church: program.church, service: program.coverKind, date: program.date, leader: program.leader, announcements: program.announcements, lines },
      res, { font: FONT, bg: BG, fg: FG, measureFor: browserMeasure },
    );
  }, [res, program, lines]);

  const deck: ProjDeck | null = useMemo(() => (result ? { font: FONT, size: 60, bg: BG, fg: FG, showLabels: true, slides: result.slides,
    outline: result.outline.filter((o) => o.count > 0).map((o) => ({ title: o.detail ? `${o.item}: ${o.detail}` : o.item, first: o.first, count: o.count })) } : null), [result]);
  const total = deck?.slides.length ?? 0;
  const at = Math.min(index, Math.max(0, total - 1));

  // Arrow keys move through the preview (not while typing)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT")) return;
      if (e.key === "ArrowRight" || e.key === "PageDown") setIndex((i) => Math.min(Math.max(0, total - 1), i + 1));
      else if (e.key === "ArrowLeft" || e.key === "PageUp") setIndex((i) => Math.max(0, i - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [total]);

  // Present: the existing projector view (arrows, presenter window, full screen, Esc or Exit to leave), from the selected slide
  function present() {
    if (!deck) return;
    try {
      localStorage.setItem(PROJECTOR_KEY, JSON.stringify(deck));
      sessionStorage.setItem("projectorIndex", String(at));
    } catch { /* storage blocked */ }
    window.open(`${import.meta.env.BASE_URL}#projector`, "_blank");
  }

  // Presenter: the operator's window (order of worship, now and next, clock, black and logo screens).
  // It opens here; its "Show on second screen" button opens the audience window on the other screen.
  function presenterView() {
    if (!deck) return;
    try {
      localStorage.setItem(PROJECTOR_KEY, JSON.stringify(deck));
      sessionStorage.setItem("projectorIndex", String(at));
    } catch { /* storage blocked */ }
    window.open(`${import.meta.env.BASE_URL}#projector:presenter`, "_blank");
  }

  const stageName = (s: number) => STAGES[s] ?? "";
  const itemCount = parseItems(lines).length;

  return (
    <>
      <NavBar />
      <div className="ss">
        <header className="ss-top">
          <div>
            <h1>Service presentation</h1>
            <p className="ss-status">
              {!result ? "Building the slides…" : `${total} slide${total === 1 ? "" : "s"} for ${itemCount} program item${itemCount === 1 ? "" : "s"}, from the Program saved in this browser.`}
              {result && result.warnings.length > 0 && (
                <> <button type="button" className="ss-warnlink" onClick={() => setShowWarnings((v) => !v)} aria-expanded={showWarnings}>{result.warnings.length} thing{result.warnings.length === 1 ? "" : "s"} to check</button></>
              )}
            </p>
          </div>
          <div className="ss-actions">
            <a className="ss-link" href="#program">Open Program</a>
            <button type="button" className="secondary" onClick={refresh}>Refresh</button>
            <button type="button" className="secondary" onClick={() => window.print()} disabled={!total}>Print</button>
            <button type="button" className="primary" onClick={present} disabled={!total}>Present</button>
            <button type="button" className="secondary" onClick={presenterView} disabled={!total}>Presenter view</button>
          </div>
        </header>

        {showWarnings && result && (
          <ul className="ss-warnings" aria-label="Things to check">
            {result.warnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        )}

        {itemCount === 0 && (
          <p className="ss-empty">The Program has no items yet. Add items on the <a href="#program">Program page</a>, then come back.</p>
        )}

        <div className="ss-grid">
          <aside className="ss-outline" aria-label="Program order">
            <h2>Program order</h2>
            {result?.outline.map((e, i) => {
              const showStage = i > 0 && (i === 1 || e.stage !== result.outline[i - 1].stage);
              return (
                <div key={`${e.item}-${i}`}>
                  {showStage && <p className="ss-stage">{stageName(e.stage)}</p>}
                  <button type="button" className={`ss-item${at >= e.first && at < e.first + e.count ? " on" : ""}`} onClick={() => setIndex(e.first)}>
                    <span className="ss-item-name">{e.item}</span>
                    {e.detail && <span className="ss-item-detail">{e.detail}</span>}
                    <span className="ss-item-meta">{e.count} slide{e.count === 1 ? "" : "s"}{e.warnings.length > 0 && <span className="ss-warnmark" title={e.warnings.join(" ")}> ⚠ check</span>}</span>
                  </button>
                </div>
              );
            })}
          </aside>

          <section className="ss-preview ss-screen" aria-label="Slide preview">
            {deck && total > 0 ? (
              <>
                <div className="ss-stagewrap">{renderStage(deck.slides[at], deck, " in-pres")}</div>
                <div className="ss-nav">
                  <button type="button" className="secondary" onClick={() => setIndex(Math.max(0, at - 1))} disabled={at === 0}>← Previous</button>
                  <span className="ss-count" aria-live="polite">Slide {at + 1} of {total}</span>
                  <button type="button" className="secondary" onClick={() => setIndex(Math.min(total - 1, at + 1))} disabled={at >= total - 1}>Next →</button>
                </div>
                <div className="ss-thumbs" role="list" aria-label="All slides">
                  {deck.slides.map((sl, i) => (
                    <div key={i} role="listitem" className={`ss-thumb${i === at ? " on" : ""}`} aria-current={i === at ? "true" : undefined}>
                      {renderStage(sl, deck, " in-pres", () => setIndex(i))}
                      <span className="ss-thumb-n">{i + 1}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : <p className="ss-empty">{result ? "No slides yet." : "Building the slides…"}</p>}
          </section>
        </div>

        {/* Printing: one slide per landscape page. Hidden on screen. */}
        {deck && (
          <div className="ss-print" aria-hidden="true">
            {deck.slides.map((sl, i) => <div className="ss-print-page" key={i}>{renderStage(sl, deck, " in-pres")}</div>)}
          </div>
        )}
      </div>
    </>
  );
}
