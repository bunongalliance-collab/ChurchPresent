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
  cover1: 30,    // church name, first line (cover)
  cover2: 18,    // church name, second line (cover)
  cover3: 22,    // service title (cover)
};
const LEAD = 1.3;

const fontFile = (name: string) => `${import.meta.env.BASE_URL}fonts/${name}`;
interface Fonts { serif: PDFFont; serifBold: PDFFont; serifItalic: PDFFont; sans: PDFFont; sansBold: PDFFont; sansItalic: PDFFont }

// Today's scripture comes from the Scripture Reading item in the order of worship (its reference and text).
// Without one, the fallback fields on the program are used.
export function todayScripture(d: Draft): { ref: string; text: string; cite: string } {
  const row = d.rows.find((r) => r.kind === "scripture" && (r.detail.trim() || r.text.trim()));
  if (row) {
    const ref = row.detail.trim() || d.scriptureRef;
    return { ref, text: row.text.trim() || d.scriptureText, cite: ref ? `— ${ref}` : d.scriptureCite };
  }
  return { ref: d.scriptureRef, text: d.scriptureText, cite: d.scriptureCite };
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

export async function buildProgramPdf(d: Draft, logoUrl: string, coverDate: string): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  pdf.setTitle(`${d.coverName1} ${d.coverName2} – Service program`);
  const load = async (name: string) => pdf.embedFont(await (await fetch(fontFile(name))).arrayBuffer());
  const fonts: Fonts = {
    serif: await load("DejaVuSerif.ttf"),
    serifBold: await load("DejaVuSerif-Bold.ttf"),
    serifItalic: await load("DejaVuSerif-Italic.ttf"),
    // The brochure is set in serif throughout
    sans: await load("DejaVuSerif.ttf"),
    sansBold: await load("DejaVuSerif-Bold.ttf"),
    sansItalic: await load("DejaVuSerif-Italic.ttf"),
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
  y = line(p1, d.church, { x: xl, y, width: INNER, font: fonts.serifBold, size: T.h2 }) + 4;
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
  let cy = M + PAD;
  cy = line(p1, upper(`Sunday worship · ${coverDate}`), { x: cx, y: cy, width: cw, font: fonts.sansBold, size: T.eyebrow, color: BURGUNDY, align: "center" }) + 14;
  if (logo) {
    const lw = 66, lh = 66 * (logo.height / logo.width);
    p1.drawImage(logo, { x: cx + (cw - lw) / 2, y: H - cy - lh, width: lw, height: lh });
    cy += lh + 8;
  }
  cy = line(p1, d.coverName1, { x: cx, y: cy, width: cw, font: fonts.serifBold, size: T.cover1, color: BURGUNDY, align: "center" });
  cy = line(p1, d.coverName2, { x: cx, y: cy, width: cw, font: fonts.serifBold, size: T.cover2, align: "center" }) + 8;
  cy = line(p1, d.coverKind, { x: cx, y: cy, width: cw, font: fonts.serifBold, size: T.cover3, align: "center" });
  cy = line(p1, d.tagline, { x: cx, y: cy, width: cw, font: fonts.sans, size: T.body, color: GREY, align: "center" }) + 14;
  const coverVerse = scripture.text ? `“${scripture.text}”` : d.verse;
  cy = para(p1, coverVerse, { x: cx + PAD, y: cy, width: cw - 2 * PAD, font: fonts.serifItalic, size: 11, align: "center", lead: 15 }) + 6;
  cy = line(p1, upper(scripture.ref || d.verseRef), { x: cx, y: cy, width: cw, font: fonts.sansBold, size: T.eyebrow, color: BURGUNDY, align: "center" }) + 10;
  line(p1, `${d.coverTime}  ·  ${d.coverPlace}`, { x: cx, y: cy, width: cw, font: fonts.sans, size: T.body, color: GREY, align: "center" });

  // ----- Page 2, left: today's gathering and the order of worship -----
  y = M + PAD;
  const top = y;
  y = line(p2, upper(d.gatheringLabel), { x: xl, y, width: INNER, font: fonts.sansBold, size: T.eyebrow, color: BURGUNDY }) + 2;
  if (d.leader.trim()) {
    const led = `Led by ${d.leader.trim()}`;
    p2.drawText(led, { x: xl + INNER - fonts.sans.widthOfTextAtSize(led, T.body), y: H - top - T.eyebrow, size: T.body, font: fonts.sans, color: GREY });
  }
  y = line(p2, d.orderTitle, { x: xl, y, width: INNER, font: fonts.serifBold, size: T.h2 }) + 6;
  for (const r of d.rows.filter((r) => r.item.trim())) {
    const rowTop = y;
    y = line(p2, r.item, { x: xl, y, width: INNER - 110, font: fonts.sansBold, size: T.strong, color: BURGUNDY });
    if (r.led.trim()) {
      const w = fonts.sans.widthOfTextAtSize(r.led.trim(), T.body);
      p2.drawText(r.led.trim(), { x: xl + INNER - w, y: H - rowTop - T.strong, size: T.body, font: fonts.sans, color: CHARCOAL });
    }
    if (r.detail.trim()) y = line(p2, r.detail, { x: xl + 26, y, width: INNER - 26, font: fonts.sansItalic, size: T.body, color: GREY });
    for (const n of r.names.filter((n) => n.trim())) y = line(p2, n.trim(), { x: xl + 26, y, width: INNER - 26, font: fonts.sansItalic, size: T.body, color: GREY });
    y += 4;
  }
  if (d.orderNote.trim()) line(p2, d.orderNote, { x: xl, y: y + 2, width: INNER, font: fonts.serifItalic, size: T.body, color: GREY });

  // ----- Page 2, right: worship together -----
  const xr = rightX + PAD;
  let vy = M + PAD;
  vy = line(p2, upper(d.worshipTitle), { x: xr, y: vy, width: INNER, font: fonts.sansBold, size: T.eyebrow, color: BURGUNDY }) + 2;
  vy = line(p2, d.visitTitle, { x: xr, y: vy, width: INNER, font: fonts.serifBold, size: T.h2 }) + 4;
  for (const v of d.visits.filter((v) => v.heading.trim() || v.text.trim())) {
    vy = line(p2, upper(v.heading), { x: xr, y: vy, width: INNER, font: fonts.sansBold, size: T.eyebrow, color: BURGUNDY });
    vy = line(p2, v.text, { x: xr, y: vy, width: INNER, font: fonts.sans, size: T.body, color: GREY }) + 3;
  }
  const notes = d.announcements.filter((a) => a.trim());
  if (notes.length) {
    vy += 2;
    vy = line(p2, upper(d.announcementsTitle), { x: xr, y: vy, width: INNER, font: fonts.sansBold, size: T.eyebrow, color: BURGUNDY }) + 1;
    for (const a of notes) vy = line(p2, a, { x: xr, y: vy, width: INNER, font: fonts.sans, size: T.body }) + 1;
    vy += 3;
  }
  const prayers = d.prayers.filter((x) => x.trim());
  if (prayers.length) {
    vy = line(p2, upper(d.prayerTitle), { x: xr, y: vy, width: INNER, font: fonts.sansBold, size: T.eyebrow, color: BURGUNDY }) + 1;
    prayers.forEach((pr, i) => {
      p2.drawText(String(i + 1).padStart(2, "0"), { x: xr, y: H - vy - T.num, size: T.num, font: fonts.serifBold, color: BURGUNDY });
      const start = vy;
      const after = line(p2, pr, { x: xr + 30, y: vy, width: INNER - 30, font: fonts.sans, size: T.body, color: CHARCOAL }) + 1;
      vy = Math.max(after, start + T.num + 3);
    });
    vy += 3;
  }
  vy = line(p2, upper("Today’s scripture"), { x: xr, y: vy, width: INNER, font: fonts.sansBold, size: T.eyebrow, color: BURGUNDY }) + 1;
  vy = line(p2, scripture.ref, { x: xr, y: vy, width: INNER, font: fonts.serifBold, size: T.h3 }) + 1;
  vy = line(p2, scripture.text, { x: xr, y: vy, width: INNER, font: fonts.serifItalic, size: T.body, color: CHARCOAL }) + 1;
  vy = line(p2, scripture.cite, { x: xr, y: vy, width: INNER, font: fonts.sansBold, size: T.eyebrow, color: BURGUNDY }) + 4;
  vy = line(p2, upper("Stay in touch"), { x: xr, y: vy, width: INNER, font: fonts.sansBold, size: T.eyebrow, color: BURGUNDY }) + 1;
  for (const c of [d.contactName, d.contactAddress, [d.contactPhone, d.contactEmail].filter(Boolean).join("  ·  "), d.contactWeb].filter((x) => x && x.trim())) {
    vy = line(p2, c, { x: xr, y: vy, width: INNER, font: fonts.sans, size: T.body, color: GREY });
  }

  return pdf.save();
}
