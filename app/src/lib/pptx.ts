import { VERSE_SPLIT } from "./richtext";
// Shared PowerPoint export: turns projector slides into a 16:9 .pptx file.
// Verse numbers (marked with \u0001) take the verse-number colour, and each slide keeps its formatting.
import PptxGenJS from "pptxgenjs";
import { MARGIN_IN, SLIDE_H_IN, SLIDE_W_IN, USABLE_H } from "./slides";
import { paragraphEnds } from "./richtext";

// Ends a row of text: a line break, or (for justified text) a space so the words run on as one paragraph
export function breakRow(runs: { text: string; options: Record<string, unknown> }[], end: boolean) {
  if (!runs.length) return;
  if (end) runs[runs.length - 1].options.breakLine = true;
  else runs[runs.length - 1].text += " ";
}
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
    const ends = s.align === "justify" ? paragraphEnds(s.rows ?? []) : null;
    (s.rows ?? []).forEach((row, ri) => {
      row.split(VERSE_SPLIT).forEach((part, k) => {
        if (!part) return;
        const isNum = !!s.verse && k % 2 === 1;
        runs.push({
          text: isNum ? `${part} ` : k ? part.replace(/^ /, "") : part,
          options: isNum ? { ...base, color: hex(s.numColor || numColor), fontSize: Math.round((s.size || deck.size) * 0.5) } : { ...base },
        });
      });
      if (ri < (s.rows ?? []).length - 1) breakRow(runs, ends?.[ri] ?? true);
    });
    // The passage reference, bottom-right, on every slide of the passage (kept clear of the text)
    if (s.ref) sl.addText(s.ref, { x: SLIDE_W_IN - MARGIN_IN - 4.5, y: SLIDE_H_IN - MARGIN_IN - 0.4, w: 4.5, h: 0.4, fontFace: deck.font, fontSize: 14, color: hex(s.fg || deck.fg), transparency: 35, align: "right", valign: "bottom", margin: 0 });
    sl.addText(runs as never, {
      x: MARGIN_IN, y: MARGIN_IN, w: SLIDE_W_IN - 2 * MARGIN_IN, h: s.ref ? USABLE_H - 0.5 : USABLE_H,
      align: s.align ?? "left", valign: "middle", margin: 0, lineSpacingMultiple: 1.1, fit: "none",
    });
  }
  const safe = (title || "presentation").replace(/[^\w]+/g, "-").replace(/^-|-$/g, "").slice(0, 50) || "presentation";
  pptx.writeFile({ fileName: `${safe}.pptx` });
}
