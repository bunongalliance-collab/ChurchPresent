import { LYRIC_LABEL_PT, SLIDE_PAD } from "../lib/slides";
import { groupParagraphs, paragraphEnds, VERSE_SPLIT } from "../lib/richtext";
import { useEffect, useRef, useState } from "react";
import Presenter from "./Presenter";
import { supabase } from "../lib/supabase";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getRemoteCode, remoteChannel, REMOTE_CODE_KEY, stateFor } from "../lib/remote";

// A slide as saved by the lyrics page (and later the scripture and builder pages).
// rows: plain lines. segs: optional formatted segments per line (scripture decks).
export interface Seg { text: string; f?: { bold?: boolean; italic?: boolean; underline?: boolean; color?: string; highlight?: string } | null }
export interface SlideFmt { bold?: boolean; italic?: boolean; underline?: boolean; color?: string }
export interface ProjSlide {
  ref?: string;        // passage reference, shown bottom-right on every slide of the passage
  bg?: string;          // this slide's background (falls back to the deck's)
  fg?: string;          // this slide's text colour
  font?: string;        // this slide's font
  fmt?: SlideFmt;       // whole-slide text formatting
  numColor?: string;    // verse-number colour for this slide
  label?: string;
  rows?: string[];
  segs?: Seg[][];
  size?: number;
  lineH?: number;       // line spacing for this slide
  pad?: string;         // padding around the text on this slide (singing slides use less)
  wrap?: boolean;       // one text block that wraps at word boundaries, with a band at the bottom for the reference
  align?: "left" | "center" | "right" | "justify";
  verse?: boolean;
  top?: boolean;        // text starts at the top of the slide instead of the middle
  lyric?: boolean;      // a lyric slide: the label sits small inside the bottom padding
}
export interface ProjDeck {
  font: string;
  size: number;
  bg: string;
  fg: string;
  showLabels: boolean;
  numColor?: string;
  labelColor?: string;  // slide title / label colour
  padBottomPct?: number;
  reserve?: boolean;
  tagPt?: number;
  tagOpacity?: number;
  slides: ProjSlide[];
  outline?: DeckItem[]; // the order of worship items, for the presenter's side list (each item's first slide and slide count)
}
export interface DeckItem { title: string; first: number; count: number }

export const PROJECTOR_KEY = "lyricsDeck";

export function loadDeck(): ProjDeck | null {
  try {
    const d = JSON.parse(localStorage.getItem(PROJECTOR_KEY) || "null");
    return d && Array.isArray(d.slides) && d.slides.length ? (d as ProjDeck) : null;
  } catch {
    return null;
  }
}

// Whole-slide formatting: bold, italic, underline and colour
function fmtStyle(f?: SlideFmt): React.CSSProperties {
  if (!f) return {};
  return {
    fontWeight: f.bold ? 700 : undefined,
    fontStyle: f.italic ? "italic" : undefined,
    textDecoration: f.underline ? "underline" : undefined,
    color: f.color || undefined,
  };
}

// Split one text line into segments, drawing verse numbers (marked with \u0001) small and coloured
function lineNodes(segs: Seg[], numColor: string | null) {
  return segs.map((seg, j) => {
    const parts = numColor ? seg.text.split(VERSE_SPLIT) : [seg.text.replace(/[\u0001-\u0003]/g, "")];
    const style: React.CSSProperties = {};
    if (seg.f) {
      style.fontWeight = seg.f.bold ? 700 : 400;
      if (seg.f.italic) style.fontStyle = "italic";
      if (seg.f.underline) style.textDecoration = "underline";
      if (seg.f.color) style.color = seg.f.color;
      if (seg.f.highlight) style.backgroundColor = seg.f.highlight;
    }
    const prevIsNum = j > 0 && segs[j - 1].text.startsWith("\u0001");
    return (
      <span key={j} style={style}>
        {j > 0 && !prevIsNum ? " " : null}
        {parts.map((part, k) =>
          k % 2
            ? <span key={k} className="vnum" style={{ color: numColor ?? undefined }}>{part} </span>
            : part ? <span key={k}>{k ? part.replace(/^ /, "") : part}</span> : null,
        )}
      </span>
    );
  });
}

const INDEX_KEY = "projectorIndex";
// The image for the Logo screen, chosen in the presenter window (a data URL kept in this browser)
export const LOGO_KEY = "projectorLogo";
const CHURCH_NAME = "Montagnard Bunong Alliance Church";

// Open the audience window (the screen people see). With second = true, Chrome and Edge move it onto
// another connected screen and fill it; other browsers open it as a normal window to drag across.
// The window opens first, straight from the click, so the browser does not block it as a pop-up.
export async function openAudience(second: boolean) {
  const w = window.open(`${import.meta.env.BASE_URL}#projector`, "churchAudience", "popup,width=960,height=540");
  if (!w || !second) return;
  type Scr = { availLeft: number; availTop: number; availWidth: number; availHeight: number; isPrimary?: boolean };
  const getDetails = (window as unknown as { getScreenDetails?: () => Promise<{ screens: Scr[]; currentScreen: Scr }> }).getScreenDetails;
  if (!getDetails) return;
  try {
    const { screens, currentScreen } = await getDetails.call(window);
    const other = screens.find((sc) => sc !== currentScreen && sc.availLeft !== currentScreen.availLeft) ?? screens.find((sc) => !sc.isPrimary);
    if (!other) return;
    w.moveTo(other.availLeft, other.availTop);
    w.resizeTo(other.availWidth, other.availHeight);
  } catch { /* permission refused: the window stays where it opened */ }
}
const CHANNEL = "church-projector";

// One slide as a stage. The audience uses it full screen; the presenter window shows it small.
export function renderStage(slide: ProjSlide, deck: ProjDeck, extraClass = "", onClick?: () => void) {
  const lines: Seg[][] = slide.segs ?? (slide.rows ?? []).map((r) => [{ text: r, f: null }]);
  // A wrapped block is one paragraph: its rows run together and the browser wraps them at word boundaries
  const shownLines: Seg[][] = slide.wrap ? [lines.flatMap((l, i) => (i ? [{ text: " ", f: null }, ...l] : l))] : lines;
  const numColor = slide.verse ? (slide.numColor || deck.numColor || "#f2c14e") : null;
  const textStyle = { "--size": slide.size || deck.size, ...(slide.lineH ? { "--lh": slide.lineH } : {}), ...(slide.pad ? { "--pad": slide.pad } : {}) } as React.CSSProperties;
  const ends = paragraphEnds(lines.map((l) => l.map((s) => s.text).join("")));
  return (
    <div
      className={`stage${deck.reserve || slide.ref ? " reserve" : ""}${extraClass}`}
      style={{ background: slide.bg ?? deck.bg, color: slide.fg ?? deck.fg, fontFamily: `${slide.font ?? deck.font}, Arial, sans-serif` }}
      onClick={onClick}
    >
      <div className="text" style={{ ...textStyle, ...(slide.top ? { alignItems: "flex-start" } : {}), paddingBottom: slide.ref ? `calc(${SLIDE_PAD} + 9%)` : deck.padBottomPct ? `${deck.padBottomPct}%` : undefined }}>
        <div style={{ width: "100%", textAlign: slide.align === "justify" ? "justify" : slide.align ?? "center", ...fmtStyle(slide.fmt) }}>
          {slide.align === "justify" && !slide.wrap
            // Justified: each paragraph (verse) is one block, so the browser wraps it and fills the full width
            ? groupParagraphs(ends).map((grp, gi) => (
              <div key={gi} style={{ textAlign: "justify" }}>
                {grp.map((i, k) => <span key={i}>{k > 0 ? " " : null}{lineNodes(lines[i], numColor)}</span>)}
              </div>
            ))
            : shownLines.map((segs, i) => <div key={i}>{lineNodes(segs, numColor)}</div>)}
        </div>
      </div>
      {slide.ref && <div className="ref-tag">{slide.ref}</div>}
      {slide.label && deck.showLabels && (
        <div
          className="tag"
          style={{
            opacity: deck.tagOpacity ?? (slide.label.startsWith("V") ? 0.65 : 1),
            color: deck.labelColor || undefined,
            fontSize: deck.tagPt ? `calc(${deck.tagPt} / 960 * 100cqw)` : slide.lyric ? `calc(${LYRIC_LABEL_PT} / 960 * 100cqw)` : undefined,
            textTransform: deck.tagPt ? "uppercase" : undefined,
            ...(slide.lyric ? { right: "4%", bottom: "0.3cqw", lineHeight: 1 } : {}),
          }}
        >
          {slide.label}
        </div>
      )}
    </div>
  );
}

// Leave the presentation: close the window the app opened. A window the app did not open cannot close itself,
// so after a moment it goes back to the Builder instead.
function exitPresentation() {
  try { if (document.fullscreenElement) void document.exitFullscreen(); } catch { /* not in full screen */ }
  window.close();
  window.setTimeout(() => { window.location.hash = "#builder"; }, 250);
}

// A small Exit button that appears when the mouse moves or the screen is touched, then fades away
function ExitButton({ show }: { show: boolean }) {
  return (
    <button type="button" className={`proj-exit${show ? " show" : ""}`} aria-label="Exit presentation" tabIndex={show ? 0 : -1}
      onClick={(e) => { e.stopPropagation(); exitPresentation(); }}>
      Exit (Esc)
    </button>
  );
}

export default function Projector() {
  // "#projector:presenter" opens the presenter window (current slide, next slide, count)
  const presenter = window.location.hash.startsWith("#projector:presenter");
  const [deck] = useState<ProjDeck | null>(loadDeck);
  const [index, setIndex] = useState(() => {
    // Resume where the projector was, after a refresh
    const n = parseInt(sessionStorage.getItem(INDEX_KEY) || "0", 10);
    return deck && n >= 0 && n < deck.slides.length ? n : 0;
  });
  const [blackout, setBlackout] = useState(false);
  // Waiting screen: a welcome message before the service, turned on and off with W
  const [waiting, setWaiting] = useState(false);
  // Logo screen (L) and Clear text (C): the background stays, the words are hidden
  const [logo, setLogo] = useState(false);
  const [clear, setClear] = useState(false);
  // Presenter only: is the projector window answering?
  const [connected, setConnected] = useState(true);
  const lastSeen = useRef(0);
  const chRef = useRef<BroadcastChannel | null>(null);
  const latest = useRef({ index, blackout, waiting, logo, clear });
  latest.current = { index, blackout, waiting, logo, clear };
  // The command handler, shared with the phone remote
  const actRef = useRef<(cmd: string, arg?: number) => void>(() => {});
  // Phone remote: the pairing code (changed from the presenter's "New code"), and when a phone was last heard
  const [remoteCode, setRemoteCode] = useState(getRemoteCode);
  const [phoneAt, setPhoneAt] = useState(0);
  const remoteRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    try { sessionStorage.setItem(INDEX_KEY, String(index)); } catch { /* storage blocked */ }
  }, [index]);

  // Both windows listen on one channel. The audience window acts on commands; the presenter window sends them.
  useEffect(() => {
    if (!deck) return;
    const total = deck.slides.length;
    // Moving to a slide brings the words back and leaves any special screen
    const show = () => { setBlackout(false); setLogo(false); setClear(false); };
    const act = (cmd: string, arg?: number) => {
      switch (cmd) {
        case "goto": setIndex(Math.max(0, Math.min(total - 1, arg ?? 0))); show(); break;
        case "next": setIndex((i) => Math.min(total - 1, i + 1)); show(); break;
        case "prev": setIndex((i) => Math.max(0, i - 1)); show(); break;
        case "first": setIndex(0); show(); break;
        case "last": setIndex(total - 1); show(); break;
        case "blackout": setBlackout((b) => !b); break;
        case "waiting": setWaiting((w) => !w); break;
        case "logo": setLogo((v) => !v); break;
        case "clear": setClear((v) => !v); break;
      }
    };
    actRef.current = act;
    let ch: BroadcastChannel | null = null;
    if (typeof BroadcastChannel !== "undefined") {
      ch = new BroadcastChannel(CHANNEL);
      chRef.current = ch;
      ch.onmessage = (e: MessageEvent) => {
        const m = e.data;
        if (!presenter && m?.type === "cmd") act(m.cmd, m.index);
        if (!presenter && m?.type === "hello") ch?.postMessage({ type: "state", ...latest.current });
        if (presenter && m?.type === "state") {
          lastSeen.current = Date.now();
          setConnected(true);
          setIndex(m.index); setBlackout(!!m.blackout); setWaiting(!!m.waiting); setLogo(!!m.logo); setClear(!!m.clear);
          setPhoneAt(m.phoneAt ?? 0);
        }
      };
      if (presenter) {
        ch.postMessage({ type: "hello" });
        // Ask again every 2 seconds, and report when the projector window stops answering
        const timer = window.setInterval(() => {
          ch?.postMessage({ type: "hello" });
          setConnected(Date.now() - lastSeen.current < 4000);
        }, 2000);
        const cleanupTimer = () => window.clearInterval(timer);
        (ch as BroadcastChannel & { _cleanup?: () => void })._cleanup = cleanupTimer;
      }
    }
    const commandFor: Record<string, string> = {
      ArrowRight: "next", ArrowDown: "next", PageDown: "next", " ": "next", Enter: "next",
      ArrowLeft: "prev", ArrowUp: "prev", PageUp: "prev", Backspace: "prev",
      Home: "first", End: "last", b: "blackout", B: "blackout", ".": "blackout", w: "waiting", W: "waiting", l: "logo", L: "logo", c: "clear", C: "clear",
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "f" || e.key === "F") {
        if (document.fullscreenElement) document.exitFullscreen();
        else document.documentElement.requestFullscreen();
        return;
      }
      if (e.key === "Escape") {
        // In full screen the browser uses Esc to leave full screen first; a second Esc exits the presentation
        if (!document.fullscreenElement) exitPresentation();
        return;
      }
      if (e.key === "p" || e.key === "P") {
        if (!presenter) window.open(`${import.meta.env.BASE_URL}#projector:presenter`, "_blank");
        return;
      }
      const cmd = commandFor[e.key];
      if (!cmd) return;
      e.preventDefault();
      if (presenter) ch?.postMessage({ type: "cmd", cmd });
      else act(cmd);
    };
    document.addEventListener("keydown", onKey);
    // Scroll wheel: down for the next slide, up for the previous one. One step per gesture, so a
    // trackpad's long swipe does not run through many slides. Lists in the presenter still scroll.
    let wheelAt = 0;
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) < 4) return;
      if (presenter && (e.target as HTMLElement | null)?.closest(".prv-side, .prv-thumbs-wrap")) return;
      const t = Date.now();
      if (t - wheelAt < 600) return;
      wheelAt = t;
      const cmd = e.deltaY > 0 ? "next" : "prev";
      if (presenter) ch?.postMessage({ type: "cmd", cmd });
      else act(cmd);
    };
    window.addEventListener("wheel", onWheel, { passive: true });
    return () => {
      window.removeEventListener("wheel", onWheel);
      document.removeEventListener("keydown", onKey);
      (ch as (BroadcastChannel & { _cleanup?: () => void }) | null)?._cleanup?.();
      ch?.close();
      chRef.current = null;
    };
  }, [deck, presenter]);

  // The audience window tells the presenter window (and a paired phone) where it is
  useEffect(() => {
    if (!presenter && chRef.current) chRef.current.postMessage({ type: "state", index, blackout, waiting, logo, clear, phoneAt });
  }, [index, blackout, waiting, logo, clear, phoneAt, presenter]);
  useEffect(() => {
    if (!presenter && deck && remoteRef.current) void remoteRef.current.send({ type: "broadcast", event: "state", payload: stateFor(deck, { index, blackout, waiting, logo, clear }) });
  }, [index, blackout, waiting, logo, clear, presenter, deck]);

  // A new pairing code made in the presenter window reaches this window through storage
  useEffect(() => {
    const onStorage = (e: StorageEvent) => { if (e.key === REMOTE_CODE_KEY && e.newValue) setRemoteCode(e.newValue); };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // Phone remote: the audience window joins the pairing code's channel, acts on the phone's commands and
  // answers its hello with the current state. Needs internet; without it the keys and presenter still work.
  useEffect(() => {
    const sb = supabase;
    if (presenter || !deck || !sb) return;
    const rc = sb.channel(remoteChannel(remoteCode), { config: { broadcast: { self: false } } });
    const sendState = () => void rc.send({ type: "broadcast", event: "state", payload: stateFor(deck, latest.current) });
    rc.on("broadcast", { event: "cmd" }, ({ payload }) => {
      setPhoneAt(Date.now());
      const p = payload as { cmd?: string; index?: number };
      if (typeof p.cmd === "string") actRef.current(p.cmd, typeof p.index === "number" ? p.index : undefined);
    });
    rc.on("broadcast", { event: "hello" }, () => { setPhoneAt(Date.now()); sendState(); });
    rc.subscribe((status) => { if (status === "SUBSCRIBED") sendState(); });
    remoteRef.current = rc;
    return () => { remoteRef.current = null; void sb.removeChannel(rc); };
  }, [deck, presenter, remoteCode]);

  // The Exit button shows for 3 seconds after the mouse moves or the screen is touched
  const [showExit, setShowExit] = useState(false);
  useEffect(() => {
    let timer = 0;
    const wake = () => { setShowExit(true); window.clearTimeout(timer); timer = window.setTimeout(() => setShowExit(false), 3000); };
    window.addEventListener("pointermove", wake);
    window.addEventListener("pointerdown", wake);
    return () => { window.removeEventListener("pointermove", wake); window.removeEventListener("pointerdown", wake); window.clearTimeout(timer); };
  }, []);

  if (!deck) {
    return (
      <div className="projector-message">
        No slides yet. Go to the lyrics page, paste the song, then press "Open projector view".
      </div>
    );
  }

  const total = deck.slides.length;

  // Presenter buttons send the same commands as the keys
  const send = (cmd: string, arg?: number) => {
    if (chRef.current) chRef.current.postMessage({ type: "cmd", cmd, index: arg });
  };

  if (presenter) {
    return <Presenter deck={deck} state={{ index, blackout, waiting, logo, clear }} connected={connected} send={send} phoneAt={phoneAt} />;
  }

  if (blackout) {
    return <div className="projector-blackout" onClick={() => setBlackout(false)}><ExitButton show={showExit} /></div>;
  }

  if (logo) {
    let src = "";
    try { src = localStorage.getItem(LOGO_KEY) || ""; } catch { /* storage blocked */ }
    return (
      <div className="projector-logo">
        {src ? <img src={src} alt={CHURCH_NAME} /> : <div>{CHURCH_NAME}</div>}
        <ExitButton show={showExit} />
      </div>
    );
  }

  if (waiting) {
    let welcome = "Welcome";
    try { welcome = localStorage.getItem("projectorWelcome") || welcome; } catch { /* storage blocked */ }
    return <div className="projector-waiting"><div>{welcome}</div><ExitButton show={showExit} /></div>;
  }

  const slide = clear ? { ...deck.slides[index], rows: [], segs: [], ref: undefined, label: undefined } : deck.slides[index];
  return (
    <>
      {renderStage(slide, deck, "", () => setIndex((i) => Math.min(total - 1, i + 1)))}
      <div className="counter">{index + 1} / {total}</div>
      <ExitButton show={showExit} />
    </>
  );
}
