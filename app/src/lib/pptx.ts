// Shared PowerPoint export: turns projector slides into a 16:9 .pptx file.
// Verse numbers (marked with \u0001) take the verse-number colour, and each slide keeps its formatting.
import PptxGenJS from "pptxgenjs";
import { MARGIN_IN, SLIDE_H_IN, SLIDE_W_IN, USABLE_H } from "./slides";
import type { ProjDeck } from "../pages/Projector";

const hex = (c: string) => c.replace("#", "");

export function downloadDeckPptx(deck: ProjDeck, title: string) {
  if (!deck.slides.length) return;
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.title = title || "Presentation";
  const deckFg = hex(deck.fg);
  const numColor = hex(deck.numColor || "#f2c14e");
  const labelColor = hex(deck.labelColor || deck.fg);

  for (const s of deck.slides) {
    const sl = pptx.addSlide();
    sl.background = { color: hex(s.bg ?? deck.bg) };
    if (s.label && deck.showLabels) {
      sl.addText(s.label, {
        x: SLIDE_W_IN - MARGIN_IN - 3, y: SLIDE_H_IN - MARGIN_IN - 0.5, w: 3, h: 0.5,
        fontFace: deck.font, fontSize: 24, bold: true, color: labelColor, align: "right", valign: "bottom", margin: 0,
      });
    }
    // Text runs: verse numbers in their colour and smaller, the rest in the slide's formatting
    const base = {
      fontFace: s.font ?? deck.font,
      fontSize: s.size || deck.size,
      bold: s.fmt?.bold ?? true,
      italic: !!s.fmt?.italic,
      underline: s.fmt?.underline ? { style: "sng" } : undefined,
      color: hex(s.fmt?.color || s.fg || deckFg),
    };
    const runs: { text: string; options: Record<string, unknown> }[] = [];
    (s.rows ?? []).forEach((row, ri) => {
      row.split(/\u0001(\d{1,3})/).forEach((part, k) => {
        if (!part) return;
        const isNum = !!s.verse && k % 2 === 1;
        runs.push({
          text: isNum ? `${part} ` : k ? part.replace(/^ /, "") : part,
          options: isNum ? { ...base, color: hex(s.numColor || numColor), fontSize: Math.round((s.size || deck.size) * 0.5) } : { ...base },
        });
      });
      if (ri < (s.rows ?? []).length - 1 && runs.length) runs[runs.length - 1].options.breakLine = true;
    });
    sl.addText(runs as never, {
      x: MARGIN_IN, y: MARGIN_IN, w: SLIDE_W_IN - 2 * MARGIN_IN, h: USABLE_H,
      align: "center", valign: "middle", margin: 0, lineSpacingMultiple: 1.1, fit: "none",
    });
  }
  const safe = (title || "presentation").replace(/[^\w]+/g, "-").replace(/^-|-$/g, "").slice(0, 50) || "presentation";
  pptx.writeFile({ fileName: `${safe}.pptx` });
}
