import { PDFDocument, PDFFont, PDFPage, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import type { Draft } from "../pages/Program";

// The completed church program as a two-page US Letter landscape PDF, laid out like the Word sample.
// Only the brochure is drawn: no webpage, buttons or editor controls.
// Page 1 (outside): welcome (left) and front cover (right).
// Page 2 (inside): today's gathering and order of worship (left), worship together (right).

const W = 792, H = 612;             // US Letter landscape, points
const M = 34.56;                    // 0.48 in margin, as the Word sample
const PANEL = (W - 2 * M) / 2;      // two equal panels with the centre fold
const PAD = 22;                     // inner padding of each panel
const INNER = PANEL - 2 * PAD;
const BURGUNDY = rgb(0x86 / 255, 0x15 / 255, 0x1b / 255);
const CHARCOAL = rgb(0x27 / 255, 0x27 / 255, 0x27 / 255);
const GREY = rgb(0x62 / 255, 0x62 / 255, 0x62 / 255);
const RULE = rgb(0xd8 / 255, 0xd8 / 255, 0xd8 / 255);

// One type scale for the whole brochure, so the same kind of text is the same size on both pages
const T = {
  eyebrow: 8,    // section labels, in burgundy capitals
  h2: 18,        // section titles: Welcome to, Order of Worship, For your visit
  body: 8.5,     // all body and detail text
  strong: 9,     // item and step names
  num: 13,       // step and prayer numbers
  h3: 12,        // scripture reference
  cover1: 22,    // church name, first line (cover): one size for the whole church name
  cover2: 22,    // church name, second line (cover)
  cover3: 11,    // service title (cover): small, so the church name leads
};
const LEAD = 1.3;

const fontFile = (name: string) => `${import.meta.env.BASE_URL}fonts/${name}`;
interface Fonts { serif: PDFFont; serifBold: PDFFont; serifItalic: PDFFont; sans: PDFFont; sansBold: PDFFont; sansItalic: PDFFont; orderSans: PDFFont; orderItalic: PDFFont; orderBold: PDFFont }

// Today's scripture comes from the Scripture Reading item in the order of worship (its reference and text).
// Without one, the fallback fields on the program are used.
export function todayScripture(d: Draft): { ref: string; text: string; cite: string; reader: string } {
  const row = d.rows.find((r) => r.kind === "scripture" && (r.detail.trim() || r.text.trim()));
  if (row) {
    const ref = row.detail.trim() || d.scriptureRef;
    return { ref, text: row.text.trim() || d.scriptureText, cite: ref ? `— ${ref}` : d.scriptureCite, reader: row.led.trim() };
  }
  return { ref: d.scriptureRef, text: d.scriptureText, cite: d.scriptureCite, reader: "" };
}

// Writes wrapped text, returns the y below it (y counts down from the top of the page)
function para(page: PDFPage, text: string, o: { x: number; y: number; width: number; font: PDFFont; size: number; color?: ReturnType<typeof rgb>; lead?: number; align?: "left" | "center" }) {
  const lead = o.lead ?? o.size * LEAD;
  const words = text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w;
    if (o.font.widthOfTextAtSize(test, o.size) > o.width && cur) { lines.push(cur); cur = w; } else cur = test;
  }
  if (cur) lines.push(cur);
  let y = o.y;
  for (const l of lines) {
    const lw = o.font.widthOfTextAtSize(l, o.size);
    const x = o.align === "center" ? o.x + (o.width - lw) / 2 : o.x;
    page.drawText(l, { x, y: H - y - o.size, size: o.size, font: o.font, color: o.color ?? CHARCOAL });
    y += lead;
  }
  return y;
}
const line = (page: PDFPage, text: string, o: Parameters<typeof para>[2]) => para(page, text, { ...o, lead: o.size * LEAD });
const upper = (s: string) => s.toUpperCase();
// The five stages of the order of worship, in order
export const STAGES = ["OPENING", "MID-SERVICE", "SHARING THE WORD", "CLOSING", "FELLOWSHIP"];
// Each word starts with a capital letter, as in song names
const titleCase = (s: string) => s.split(" ").map((w) => (w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w)).join(" ");

// A dotted leader between the end of an item and the start of its name
const leader = (page: PDFPage, x1: number, x2: number, y: number, size: number, font: PDFFont) => {
  const gap = x2 - x1 - 10;
  const dot = ". ";
  const step = font.widthOfTextAtSize(dot, 8);
  if (gap < step * 2) return;
  const count = Math.floor(gap / step);
  page.drawText(dot.repeat(count), { x: x1 + 5, y: H - y - size + 1, size: 8, font, color: rgb(0x8a / 255, 0x8a / 255, 0x8a / 255) });
};
// The prayer number in a small burgundy ring
const ring = (page: PDFPage, cx: number, cy: number, n: string, font: PDFFont) => {
  page.drawEllipse({ x: cx, y: H - cy, xScale: 5.5, yScale: 5.5, borderColor: BURGUNDY, borderWidth: 0.8 });
  const w = font.widthOfTextAtSize(n, 6.5);
  page.drawText(n, { x: cx - w / 2, y: H - cy - 2.3, size: 6.5, font, color: BURGUNDY });
};
// Height of wrapped text, for drawing a box behind it
const heightOf = (text: string, font: PDFFont, size: number, width: number, lead: number) => {
  const words = text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  let lines = 0, cur = "";
  for (const w of words) { const t = cur ? `${cur} ${w}` : w; if (font.widthOfTextAtSize(t, size) > width && cur) { lines++; cur = w; } else cur = t; }
  return (lines + (cur ? 1 : 0)) * lead;
};

export async function buildProgramPdf(d: Draft, logoUrl: string, coverDate: string): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  pdf.setTitle(`${d.coverName1} ${d.coverName2} – Service program`);
  const load = async (name: string) => pdf.embedFont(await (await fetch(fontFile(name))).arrayBuffer());
  const fonts: Fonts = {
    serif: await load("NotoSerif-Regular.ttf"),
    serifBold: await load("NotoSerif-SemiBold.ttf"),
    serifItalic: await load("NotoSerif-Italic.ttf"),
    // The brochure is set in serif throughout: a lighter, cleaner serif than the bold DejaVu
    sans: await load("NotoSerif-Regular.ttf"),
    sansBold: await load("NotoSerif-SemiBold.ttf"),
    sansItalic: await load("NotoSerif-Italic.ttf"),
    // The order of worship uses a sans serif for its stages, items and details
    orderSans: await load("DejaVuSans.ttf"),
    orderItalic: await load("DejaVuSans-Oblique.ttf"),
    orderBold: await load("DejaVuSans-Bold.ttf"),
  };
  const scripture = todayScripture(d);
  let logo: Awaited<ReturnType<PDFDocument["embedPng"]>> | null = null;
  try { logo = await pdf.embedPng(await (await fetch(logoUrl)).arrayBuffer()); } catch { logo = null; }

  const p1 = pdf.addPage([W, H]);
  const p2 = pdf.addPage([W, H]);
  const leftX = M, rightX = M + PANEL;
  for (const p of [p1, p2]) p.drawLine({ start: { x: W / 2, y: M }, end: { x: W / 2, y: H - M }, thickness: 0.4, color: RULE });

  // ----- Page 1, left: welcome -----
  const xl = leftX + PAD;
  let y = M + PAD;
  y = line(p1, upper(d.eyebrow), { x: xl, y, width: INNER, font: fonts.sansBold, size: T.eyebrow, color: BURGUNDY }) + 2;
  y = line(p1, d.welcomeTo, { x: xl, y, width: INNER, font: fonts.serifBold, size: T.h2 });
  // The church name stays on one line: this line is reduced only as far as needed to fit the panel
  let churchSize = T.h2;
  while (churchSize > 11 && fonts.serifBold.widthOfTextAtSize(d.church, churchSize) > INNER) churchSize -= 0.5;
  y = line(p1, d.church, { x: xl, y, width: INNER + 1000, font: fonts.serifBold, size: churchSize }) + 4;
  y = line(p1, d.welcomeText, { x: xl, y, width: INNER, font: fonts.sans, size: T.body, color: GREY }) + 8;
  y = line(p1, upper("Plan your next step"), { x: xl, y, width: INNER, font: fonts.sansBold, size: T.eyebrow, color: BURGUNDY }) + 4;
  for (const [i, s] of d.steps.entries()) {
    p1.drawText(`0${i + 1}`, { x: xl, y: H - y - T.num, size: T.num, font: fonts.serifBold, color: BURGUNDY });
    const tx = xl + 30, tw = INNER - 30;
    y = line(p1, s.title, { x: tx, y, width: tw, font: fonts.sansBold, size: T.strong });
    y = line(p1, s.text, { x: tx, y, width: tw, font: fonts.sans, size: T.body, color: GREY }) + 4;
  }
  y = line(p1, upper("This week"), { x: xl, y, width: INNER, font: fonts.sansBold, size: T.eyebrow, color: BURGUNDY }) + 2;
  for (const w of d.weekLines.filter((x) => x.trim())) y = line(p1, w, { x: xl, y, width: INNER, font: fonts.sans, size: T.body });
  if (d.webLine.trim()) line(p1, d.webLine, { x: xl, y: y + 4, width: INNER, font: fonts.sansBold, size: T.body, color: BURGUNDY });

  // ----- Page 1, right: front cover (centred) -----
  const cx = rightX, cw = PANEL;
  p1.drawRectangle({ x: cx + 16, y: M + 16, width: cw - 32, height: H - 2 * M - 32, borderColor: RULE, borderWidth: 0.8 });
  let cy = M + PAD;
  cy = line(p1, upper(`Sunday worship · ${coverDate}`), { x: cx, y: cy, width: cw, font: fonts.sansBold, size: T.eyebrow, color: BURGUNDY, align: "center" }) + 14;
  if (logo) {
    const lw = 66, lh = 66 * (logo.height / logo.width);
    p1.drawImage(logo, { x: cx + (cw - lw) / 2, y: H - cy - lh, width: lw, height: lh });
    cy += lh + 8;
  }
  cy = line(p1, d.coverName1, { x: cx, y: cy, width: cw, font: fonts.serifBold, size: T.cover1, color: BURGUNDY, align: "center" });
  cy = line(p1, d.coverName2, { x: cx, y: cy, width: cw, font: fonts.serifBold, size: T.cover2, color: BURGUNDY, align: "center" }) + 6;
  cy = line(p1, upper(d.coverKind), { x: cx, y: cy, width: cw, font: fonts.sansBold, size: T.cover3, color: CHARCOAL, align: "center" });
  cy = line(p1, d.tagline, { x: cx, y: cy, width: cw, font: fonts.sans, size: T.body, color: GREY, align: "center" }) + 14;
  // The cover verse sits in the same tinted box as Today's Scripture, with the same layout
  const cText = scripture.text || d.verse;
  const cRef = scripture.ref || d.verseRef;
  const bp = 12, boxW = cw * 0.82, bx = cx + (cw - boxW) / 2, inW = boxW - 2 * bp;
  const hBox = bp + T.eyebrow * LEAD + T.h3 * LEAD + heightOf(cText, fonts.serifItalic, T.body, inW, T.body * LEAD) + (scripture.cite ? T.eyebrow * LEAD : 0) + (scripture.reader ? T.eyebrow * LEAD : 0) + bp;
  p1.drawRectangle({ x: bx, y: H - cy - hBox, width: boxW, height: hBox, color: rgb(0xfa / 255, 0xf6 / 255, 0xf3 / 255) });
  let iy = cy + bp;
  iy = line(p1, upper("Today’s scripture"), { x: bx + bp, y: iy, width: inW, font: fonts.sansBold, size: T.eyebrow, color: BURGUNDY }) + 1;
  iy = line(p1, cRef, { x: bx + bp, y: iy, width: inW, font: fonts.serifBold, size: T.h3 }) + 1;
  iy = line(p1, cText, { x: bx + bp, y: iy, width: inW, font: fonts.serifItalic, size: T.body, color: CHARCOAL }) + 1;
  if (scripture.cite) iy = line(p1, scripture.cite, { x: bx + bp, y: iy, width: inW, font: fonts.sansBold, size: T.eyebrow, color: BURGUNDY });
  if (scripture.reader) line(p1, `Read by ${titleCase(scripture.reader)}`, { x: bx + bp, y: iy, width: inW, font: fonts.sans, size: T.body, color: GREY });
  cy += hBox + 10;
  line(p1, `${d.coverTime}  ·  ${d.coverPlace}`, { x: cx, y: H - M - PAD - T.body * LEAD, width: cw, font: fonts.sans, size: T.body, color: GREY, align: "center" });

  // ----- Page 2 -----
  // Both inside panels are drawn at one scale, chosen so that everything fits on the page
  // (up to 10 announcements and the full prayer categories).
  const xl2 = leftX + PAD, xr = rightX + PAD;
  const topY = M + PAD;
  const bottomLimit = H - M - PAD;
  const dry = { drawText() {}, drawRectangle() {}, drawLine() {}, drawCircle() {}, drawEllipse() {}, drawImage() {} } as unknown as PDFPage;
  const prayerCols = (n: number) => (n > 7 ? 2 : 1);

  const drawLeftPanel = (page: PDFPage, K: number): number => {
    const B = T.body * K, E = T.eyebrow * K, SC = T.h3 * K;
    let y = topY;
    // Main heading: 20 pt bold serif, charcoal, on the text edge
    y = line(page, d.orderTitle, { x: xl2, y, width: INNER, font: fonts.serifBold, size: 20, color: rgb(0x29 / 255, 0x29 / 255, 0x29 / 255) });
    if (d.leader.trim()) {
      const led = `Led by ${titleCase(d.leader.trim())}`;
      page.drawText(led, { x: xl2, y: H - y + 4, size: 8.5 * K, font: fonts.orderItalic, color: GREY });
    }
    y += 10 * K;
    const DOT = rgb(0xa8 / 255, 0x56 / 255, 0x5d / 255);
    const CHAR = rgb(0x4a / 255, 0x4a / 255, 0x4a / 255);
    const DET = rgb(0x66 / 255, 0x66 / 255, 0x66 / 255);
    const ITEM_IND = 0.22 * 72;   // service items sit 0.22 in in from the stage line
    const DET_IND = 0.45 * 72;    // details sit 0.45 in in from the text edge
    STAGES.forEach((stage, si) => {
      const items = d.rows.filter((r) => r.item.trim() && (r.stage ?? 0) === si);
      if (!items.length) return;
      // Stage label: three bullets (6.5 pt), then the label (9.5 pt), with 12 pt above and 3 pt below
      const dots = "• • •";
      page.drawText(dots, { x: xl2, y: H - y - 6.5 * K, size: 6.5 * K, font: fonts.serif, color: DOT });
      const dotsW = fonts.serif.widthOfTextAtSize(dots, 6.5 * K) + 6;
      page.drawText(stage, { x: xl2 + dotsW, y: H - y - 9.5 * K, size: 9.5 * K, font: fonts.serif, color: DOT });
      y += 9.5 * K * LEAD + 3 * K;
      for (const r of items) {
        const rowTop = y;
        const nameTxt = r.led.trim() ? titleCase(r.led.trim()) : "";
        const ix = xl2 + ITEM_IND;
        const itemW = INNER - ITEM_IND;
        // Service item: 10.5 pt regular sans, charcoal gray
        y = line(page, r.item, { x: ix, y, width: itemW - 110, font: fonts.sansBold, size: 10 * K, color: CHAR });
        if (nameTxt) {
          const w = fonts.serif.widthOfTextAtSize(nameTxt, 10 * K);
          const itemEnd = ix + fonts.sansBold.widthOfTextAtSize(r.item, 10 * K);
          leader(page, itemEnd, xl2 + INNER - w, rowTop, 10 * K, fonts.serif);
          page.drawText(nameTxt, { x: xl2 + INNER - w, y: H - rowTop - 10 * K, size: 10 * K, font: fonts.serif, color: CHAR });
        }
        // Details: 8.5 pt italic gray, indented further
        if (r.detail.trim()) y = line(page, titleCase(r.detail), { x: xl2 + DET_IND, y, width: INNER - DET_IND, font: fonts.sansItalic, size: 8 * K, color: DET });
        const names = r.names.filter((n) => n.trim()).map((n) => titleCase(n.trim()));
        if (r.kind === "people") {
          if (names.length) y = line(page, names.join(" · "), { x: xl2 + DET_IND, y, width: INNER - DET_IND, font: fonts.sansItalic, size: 8 * K, color: DET });
        } else {
          for (const n of names) y = line(page, n, { x: xl2 + DET_IND, y, width: INNER - DET_IND, font: fonts.sansItalic, size: 8 * K, color: DET });
        }
        y += 4 * K;
      }
    });
    if (d.orderNote.trim()) y = line(page, d.orderNote, { x: xl2, y: y + 2, width: INNER, font: fonts.sansItalic, size: 8 * K, color: DET }) + 8 * K;
    // Today's scripture (from the Scripture Reading item), in a light tinted box
    const boxH = 16 * K + E * LEAD + SC * LEAD + heightOf(scripture.text, fonts.serifItalic, B, INNER - 14, B * LEAD) + E * LEAD + (scripture.reader ? B * LEAD : 0);
    page.drawRectangle({ x: xl2 - 7, y: H - y - boxH + 2, width: INNER + 14, height: boxH, color: rgb(0xfa / 255, 0xf6 / 255, 0xf3 / 255) });
    y += 7 * K;
    y = line(page, upper("Today’s scripture"), { x: xl2, y, width: INNER, font: fonts.sansBold, size: E, color: BURGUNDY }) + 1;
    y = line(page, scripture.ref, { x: xl2, y, width: INNER, font: fonts.serifBold, size: SC }) + 1;
    y = line(page, scripture.text, { x: xl2, y, width: INNER, font: fonts.serifItalic, size: B, color: CHARCOAL }) + 1;
    y = line(page, scripture.cite, { x: xl2, y, width: INNER, font: fonts.sansBold, size: E, color: BURGUNDY });
    if (scripture.reader) y = line(page, `Read by ${titleCase(scripture.reader)}`, { x: xl2, y, width: INNER, font: fonts.sans, size: B, color: GREY });
    return y;
  };

  const drawRightPanel = (page: PDFPage, K: number): number => {
    const B = T.body * K, E = T.eyebrow * K, HD = T.h2 * K;
    const step = 14 * K;
    let vy = topY;
    vy = line(page, upper(d.worshipTitle), { x: xr, y: vy, width: INNER, font: fonts.sansBold, size: E, color: BURGUNDY }) + 2 * K;
    vy = line(page, d.visitTitle, { x: xr, y: vy, width: INNER, font: fonts.serifBold, size: HD }) + 4 * K;
    const notes = d.announcements.filter((a) => a.trim());
    if (notes.length) {
      vy = line(page, upper(d.announcementsTitle), { x: xr, y: vy, width: INNER, font: fonts.sansBold, size: E, color: BURGUNDY }) + 1;
      for (const a of notes) vy = line(page, a, { x: xr, y: vy, width: INNER, font: fonts.sans, size: B }) + 1;
      vy += 6 * K;
    }
    for (const g of d.prayerGroups.filter((g) => g.title.trim() || g.items.some((x) => x.trim()))) {
      const items = g.items.filter((x) => x.trim());
      if (g.title.trim()) vy = line(page, upper(g.title), { x: xr, y: vy, width: INNER, font: fonts.sansBold, size: E, color: BURGUNDY }) + 1;
      const cols = prayerCols(items.length);
      const colW = cols === 2 ? (INNER - 12) / 2 : INNER;
      const rowsStart = vy;
      let maxY = vy;
      items.forEach((pr, i) => {
        const c = cols === 2 ? i % 2 : 0;
        const rr = cols === 2 ? Math.floor(i / 2) : i;
        const x0 = xr + c * (colW + 12);
        const yTop = rowsStart + rr * step;
        ring(page, x0 + 6 * K, yTop + step / 2, String(i + 1), fonts.serifBold);
        const after = line(page, pr, { x: x0 + 30 * K, y: yTop, width: colW - 30 * K, font: fonts.sans, size: B, color: CHARCOAL });
        maxY = Math.max(maxY, Math.max(after, yTop + step));
      });
      vy = maxY + 5 * K;
    }
    vy = line(page, upper("Stay in touch"), { x: xr, y: vy, width: INNER, font: fonts.sansBold, size: E, color: BURGUNDY }) + 1;
    for (const c of [d.contactName, d.contactAddress, [d.contactPhone, d.contactEmail].filter(Boolean).join("  ·  "), d.contactWeb].filter((x) => x && x.trim())) {
      vy = line(page, c, { x: xr, y: vy, width: INNER, font: fonts.sans, size: B, color: GREY });
    }
    return vy;
  };

  const fits = (K: number) => drawLeftPanel(dry, K) <= bottomLimit && drawRightPanel(dry, K) <= bottomLimit;
  let K = 1;
  while (K > 0.7 && !fits(K)) K -= 0.02;
  drawLeftPanel(p2, K);
  drawRightPanel(p2, K);

  return pdf.save();
}
