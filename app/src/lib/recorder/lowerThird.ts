// The Recorder's lower third: the current Program Order item (title and sub-items), drawn onto the video
// like a news broadcast name bar. Pure lookup plus canvas drawing; no React.
import type { DeckItem } from "../../pages/Projector";

export interface Caption { title: string; subtitle: string }

// The Program Order item that holds slide `index`. Older decks have only the joined title ("Item: detail").
export function captionAt(outline: DeckItem[] | undefined, index: number): Caption | null {
  const it = outline?.find((o) => index >= o.first && index < o.first + o.count);
  if (!it) return null;
  if (it.item !== undefined) return { title: it.item, subtitle: it.detail ?? "" };
  const cut = it.title.indexOf(": ");
  return cut > 0 ? { title: it.title.slice(0, cut), subtitle: it.title.slice(cut + 2) } : { title: it.title, subtitle: "" };
}

export const sameCaption = (a: Caption | null, b: Caption | null) =>
  a === b || (!!a && !!b && a.title === b.title && a.subtitle === b.subtitle);

// The bar's look. These are video graphics burned into the recording, so they are fixed colours, not theme tokens.
export interface LowerThirdLook { panel: string; accent: string; title: string; subtitle: string; font: string }
export const DEFAULT_LOOK: LowerThirdLook = {
  panel: "rgba(18, 46, 37, 0.88)", accent: "#F2C14E", title: "#FFFFFF", subtitle: "#D3E7DB", font: "Nunito, Arial, sans-serif",
};

const IN_MS = 450;
const OUT_MS = 250;

// Keeps what is on screen and animates between captions: the old bar slides out, then the new one slides in.
export class LowerThird {
  private shown: Caption | null = null;
  private target: Caption | null = null;
  private phase: "idle" | "in" | "out" = "idle";
  private t0 = 0;

  set(next: Caption | null, now: number) {
    if (sameCaption(next, this.target)) return;
    this.target = next;
    if (this.shown && this.phase !== "out") { this.phase = "out"; this.t0 = now; }
    else if (!this.shown) this.startIn(now);
  }

  private startIn(now: number) {
    this.shown = this.target;
    this.phase = this.shown ? "in" : "idle";
    this.t0 = now;
  }

  // 0 = hidden, 1 = fully on screen
  private progress(now: number): number {
    const t = now - this.t0;
    if (this.phase === "in") { if (t >= IN_MS) { this.phase = "idle"; return 1; } return ease(t / IN_MS); }
    if (this.phase === "out") {
      if (t >= OUT_MS) { this.startIn(now); return 0; }
      return 1 - ease(t / OUT_MS);
    }
    return this.shown ? 1 : 0;
  }

  draw(ctx: CanvasRenderingContext2D, W: number, H: number, now: number, look: LowerThirdLook = DEFAULT_LOOK) {
    const p = this.progress(now);
    const cap = this.shown;
    if (!cap || p <= 0) return;
    const s = H / 1080; // sizes are set for 1080p and scale with the canvas
    const margin = 80 * s;
    const titlePx = 56 * s;
    const subPx = 36 * s;
    const padX = 34 * s;
    const accentW = 14 * s;
    const maxText = W - 2 * margin - accentW - 2 * padX;
    ctx.save();
    ctx.textBaseline = "alphabetic";
    ctx.font = `700 ${titlePx}px ${look.font}`;
    const title = fit(ctx, cap.title, maxText);
    const tw = ctx.measureText(title).width;
    ctx.font = `400 ${subPx}px ${look.font}`;
    const sub = cap.subtitle ? fit(ctx, cap.subtitle, maxText) : "";
    const sw = sub ? ctx.measureText(sub).width : 0;
    const boxW = accentW + 2 * padX + Math.max(tw, sw);
    const boxH = (sub ? 150 : 104) * s;
    const x = margin - (1 - p) * (boxW * 0.35);
    const y = H - margin - boxH;
    ctx.globalAlpha = p;
    ctx.fillStyle = look.panel;
    ctx.fillRect(x, y, boxW, boxH);
    ctx.fillStyle = look.accent;
    ctx.fillRect(x, y, accentW, boxH);
    const tx = x + accentW + padX;
    ctx.fillStyle = look.title;
    ctx.font = `700 ${titlePx}px ${look.font}`;
    ctx.fillText(title, tx, y + (sub ? 70 : 72) * s);
    if (sub) {
      ctx.fillStyle = look.subtitle;
      ctx.font = `400 ${subPx}px ${look.font}`;
      ctx.fillText(sub, tx, y + 122 * s);
    }
    ctx.restore();
  }
}

const ease = (t: number) => 1 - Math.pow(1 - t, 3);

// Shorten with an ellipsis when the text is wider than the frame allows
function fit(ctx: CanvasRenderingContext2D, text: string, max: number): string {
  if (ctx.measureText(text).width <= max) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > max) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}
