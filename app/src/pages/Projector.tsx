import { useEffect, useState } from "react";

// A slide as saved by the lyrics page (and later the scripture and builder pages).
// rows: plain lines. segs: optional formatted segments per line (scripture decks).
export interface Seg { text: string; f?: { bold?: boolean; italic?: boolean; underline?: boolean; color?: string } | null }
export interface SlideFmt { bold?: boolean; italic?: boolean; underline?: boolean; color?: string }
export interface ProjSlide {
  bg?: string;          // this slide's background (falls back to the deck's)
  fg?: string;          // this slide's text colour
  font?: string;        // this slide's font
  fmt?: SlideFmt;       // whole-slide text formatting
  numColor?: string;    // verse-number colour for this slide
  label?: string;
  rows?: string[];
  segs?: Seg[][];
  size?: number;
  align?: "left" | "center" | "right";
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
    const parts = numColor ? seg.text.split(/\u0001(\d{1,3})/) : [seg.text.replace(/\u0001/g, "")];
    const style: React.CSSProperties = {};
    if (seg.f) {
      style.fontWeight = seg.f.bold ? 700 : 400;
      if (seg.f.italic) style.fontStyle = "italic";
      if (seg.f.underline) style.textDecoration = "underline";
      if (seg.f.color) style.color = seg.f.color;
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

export default function Projector() {
  const [deck] = useState<ProjDeck | null>(loadDeck);
  const [index, setIndex] = useState(0);
  const [blackout, setBlackout] = useState(false);

  useEffect(() => {
    if (!deck) return;
    const go = (delta: number) => {
      setIndex((i) => Math.min(deck.slides.length - 1, Math.max(0, i + delta)));
      setBlackout(false);
    };
    const onKey = (e: KeyboardEvent) => {
      switch (e.key) {
        case "ArrowRight": case "ArrowDown": case "PageDown": case " ": case "Enter":
          e.preventDefault(); go(1); break;
        case "ArrowLeft": case "ArrowUp": case "PageUp": case "Backspace":
          e.preventDefault(); go(-1); break;
        case "Home": setIndex(0); setBlackout(false); break;
        case "End": setIndex(deck.slides.length - 1); setBlackout(false); break;
        case "b": case "B": setBlackout((b) => !b); break;
        case "f": case "F":
          if (document.fullscreenElement) document.exitFullscreen();
          else document.documentElement.requestFullscreen();
          break;
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [deck]);

  if (!deck) {
    return (
      <div className="projector-message">
        No slides yet. Go to the lyrics page, paste the song, then press "Open projector view".
      </div>
    );
  }

  if (blackout) {
    return <div className="projector-blackout" onClick={() => setBlackout(false)} />;
  }

  const slide = deck.slides[index];
  const lines: Seg[][] = slide.segs ?? (slide.rows ?? []).map((r) => [{ text: r, f: null }]);
  const numColor = slide.verse ? (slide.numColor || deck.numColor || "#f2c14e") : null;
  const textStyle = { "--size": slide.size || deck.size } as React.CSSProperties;

  return (
    <>
      <div
        className={`stage${deck.reserve ? " reserve" : ""}`}
        style={{ background: slide.bg ?? deck.bg, color: slide.fg ?? deck.fg, fontFamily: `${slide.font ?? deck.font}, Arial, sans-serif` }}
        onClick={() => setIndex((i) => Math.min(deck.slides.length - 1, i + 1))}
      >
        <div className="text" style={{ ...textStyle, paddingBottom: deck.padBottomPct ? `${deck.padBottomPct}%` : undefined }}>
          <div style={{ width: "100%", textAlign: slide.align ?? "center", ...fmtStyle(slide.fmt) }}>
            {lines.map((segs, i) => (
              <div key={i}>{lineNodes(segs, numColor)}</div>
            ))}
          </div>
        </div>
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
      <div className="counter">{index + 1} / {deck.slides.length}</div>
    </>
  );
}
