import { groupParagraphs, paragraphEnds, VERSE_SPLIT } from "../lib/richtext";
import { useEffect, useRef, useState } from "react";

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
  align?: "left" | "center" | "right" | "justify";
  verse?: boolean;
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
}

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
const CHANNEL = "church-projector";

// One slide as a stage. The audience uses it full screen; the presenter window shows it small.
function renderStage(slide: ProjSlide, deck: ProjDeck, extraClass = "", onClick?: () => void) {
  const lines: Seg[][] = slide.segs ?? (slide.rows ?? []).map((r) => [{ text: r, f: null }]);
  const numColor = slide.verse ? (slide.numColor || deck.numColor || "#f2c14e") : null;
  const textStyle = { "--size": slide.size || deck.size } as React.CSSProperties;
  const ends = paragraphEnds(lines.map((l) => l.map((s) => s.text).join("")));
  return (
    <div
      className={`stage${deck.reserve || slide.ref ? " reserve" : ""}${extraClass}`}
      style={{ background: slide.bg ?? deck.bg, color: slide.fg ?? deck.fg, fontFamily: `${slide.font ?? deck.font}, Arial, sans-serif` }}
      onClick={onClick}
    >
      <div className="text" style={{ ...textStyle, paddingBottom: deck.padBottomPct ? `${deck.padBottomPct}%` : undefined }}>
        <div style={{ width: "100%", textAlign: slide.align === "justify" ? "justify" : slide.align ?? "center", ...fmtStyle(slide.fmt) }}>
          {slide.align === "justify"
            // Justified: each paragraph (verse) is one block, so the browser wraps it and fills the full width
            ? groupParagraphs(ends).map((grp, gi) => (
              <div key={gi} style={{ textAlign: "justify" }}>
                {grp.map((i, k) => <span key={i}>{k > 0 ? " " : null}{lineNodes(lines[i], numColor)}</span>)}
              </div>
            ))
            : lines.map((segs, i) => <div key={i}>{lineNodes(segs, numColor)}</div>)}
        </div>
      </div>
      {slide.ref && <div className="ref-tag">{slide.ref}</div>}
      {slide.label && deck.showLabels && (
        <div
          className="tag"
          style={{
            opacity: deck.tagOpacity ?? (slide.label.startsWith("V") ? 0.65 : 1),
            color: deck.labelColor || undefined,
            fontSize: deck.tagPt ? `calc(${deck.tagPt} / 960 * 100cqw)` : undefined,
            textTransform: deck.tagPt ? "uppercase" : undefined,
          }}
        >
          {slide.label}
        </div>
      )}
    </div>
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
  // Presenter only: is the projector window answering?
  const [connected, setConnected] = useState(true);
  const lastSeen = useRef(0);
  const chRef = useRef<BroadcastChannel | null>(null);
  const latest = useRef({ index, blackout, waiting });
  latest.current = { index, blackout, waiting };

  useEffect(() => {
    try { sessionStorage.setItem(INDEX_KEY, String(index)); } catch { /* storage blocked */ }
  }, [index]);

  // Both windows listen on one channel. The audience window acts on commands; the presenter window sends them.
  useEffect(() => {
    if (!deck) return;
    const total = deck.slides.length;
    const act = (cmd: string, arg?: number) => {
      switch (cmd) {
        case "goto": setIndex(Math.max(0, Math.min(total - 1, arg ?? 0))); setBlackout(false); break;
        case "next": setIndex((i) => Math.min(total - 1, i + 1)); setBlackout(false); break;
        case "prev": setIndex((i) => Math.max(0, i - 1)); setBlackout(false); break;
        case "first": setIndex(0); setBlackout(false); break;
        case "last": setIndex(total - 1); setBlackout(false); break;
        case "blackout": setBlackout((b) => !b); break;
        case "waiting": setWaiting((w) => !w); break;
      }
    };
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
          setIndex(m.index); setBlackout(!!m.blackout); setWaiting(!!m.waiting);
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
      Home: "first", End: "last", b: "blackout", B: "blackout", w: "waiting", W: "waiting",
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "f" || e.key === "F") {
        if (document.fullscreenElement) document.exitFullscreen();
        else document.documentElement.requestFullscreen();
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
    return () => {
      document.removeEventListener("keydown", onKey);
      (ch as (BroadcastChannel & { _cleanup?: () => void }) | null)?._cleanup?.();
      ch?.close();
      chRef.current = null;
    };
  }, [deck, presenter]);

  // The audience window tells the presenter window where it is
  useEffect(() => {
    if (!presenter && chRef.current) chRef.current.postMessage({ type: "state", index, blackout, waiting });
  }, [index, blackout, waiting, presenter]);

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
    return (
      <div className="pres">
        <div className="pres-head">
          <strong>Presenter</strong>
          <span>Slide {index + 1} of {total}{blackout ? " · screen blanked" : ""}{waiting ? " · waiting screen on" : ""}</span>
        </div>
        <div className="pres-row">
          <div className="pres-card">
            <div className="pres-label">Now</div>
            {renderStage(deck.slides[index], deck, " in-pres")}
          </div>
          <div className="pres-card">
            <div className="pres-label">Next</div>
            {index + 1 < total ? renderStage(deck.slides[index + 1], deck, " in-pres") : <div className="pres-end">End of presentation</div>}
          </div>
        </div>
        <div className="pres-controls">
          <button className="secondary" onClick={() => send("prev")} disabled={index === 0}>← Previous</button>
          <button className="primary" onClick={() => send("next")} disabled={index >= total - 1}>Next →</button>
          <button className="secondary" onClick={() => send("blackout")}>{blackout ? "Show screen" : "Blank screen"}</button>
          <button className="secondary" onClick={() => send("waiting")}>{waiting ? "Hide waiting screen" : "Waiting screen"}</button>
        </div>
        {!connected && <p className="pres-warn">Projector not connected. Open the projector window (#projector) and keep it open.</p>}
        <div className="pres-list" role="list" aria-label="Jump to slide">
          {deck.slides.map((sl, i) => (
            <button key={i} role="listitem" className={`pres-jump${i === index ? " current" : ""}`} onClick={() => send("goto", i)} aria-current={i === index ? "true" : undefined}>
              <span className="pres-jump-num">{i + 1}</span>
              <span className="pres-jump-text">{(sl.rows ?? []).join(" ").slice(0, 60)}</span>
            </button>
          ))}
        </div>
        <p className="pres-help">Keys work in this window: arrows, Space and Enter move, Home and End jump to the first and last slide, B blanks, W shows the waiting screen, F goes full screen on the projector window.</p>
      </div>
    );
  }

  if (blackout) {
    return <div className="projector-blackout" onClick={() => setBlackout(false)} />;
  }

  if (waiting) {
    let welcome = "Welcome";
    try { welcome = localStorage.getItem("projectorWelcome") || welcome; } catch { /* storage blocked */ }
    return <div className="projector-waiting"><div>{welcome}</div></div>;
  }

  const slide = deck.slides[index];
  return (
    <>
      {renderStage(slide, deck, "", () => setIndex((i) => Math.min(total - 1, i + 1)))}
      <div className="counter">{index + 1} / {total}</div>
    </>
  );
}
