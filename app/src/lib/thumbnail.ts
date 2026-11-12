// Sermon thumbnail maker: the drawing and PDF-reading engine, ported from the original thumbnail page.
// The page itself (Thumbnail.tsx) only holds the form and the preview.
// The PDF text is read with pdf.js, loaded from cdnjs (window.pdfjsLib).
// @ts-nocheck: a direct port of the canvas code from the original page; its helpers are untyped by design.
declare const pdfjsLib: any;



export const W = 1280, H = 720;
export const FAM = "Montserrat, system-ui, sans-serif";
export const SERIF = '"Playfair Display", Georgia, serif';
// Clear margin on every side. It also clears the 56px letterbox bars with a 24px gap.
export const SAFE = 80;


export const MONTHS = "January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec";
export const BOOKS = "Genesis|Exodus|Leviticus|Numbers|Deuteronomy|Joshua|Judges|Ruth|Samuel|Kings|Chronicles|Ezra|Nehemiah|Esther|Job|Psalms?|Proverbs|Ecclesiastes|Song of Solomon|Song|Isaiah|Jeremiah|Lamentations|Ezekiel|Daniel|Hosea|Joel|Amos|Obadiah|Jonah|Micah|Nahum|Habakkuk|Zephaniah|Haggai|Zechariah|Malachi|Matthew|Mark|Luke|John|Acts|Romans|Corinthians|Galatians|Ephesians|Philippians|Colossians|Thessalonians|Timothy|Titus|Philemon|Hebrews|James|Peter|Jude|Revelation";
export const VERSE_REF = new RegExp(`\\b((?:[1-3]\\s+)?(?:${BOOKS})\\s+\\d{1,3}:\\d{1,3}(?:\\s*[-–]\\s*\\d{1,3})?)\\b`, "i");
export const DATE_RE = new RegExp(`\\b((?:(?:Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday),?\\s+)?(?:${MONTHS})\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?,?\\s*\\d{4})\\b|\\b(\\d{1,2}\\/\\d{1,2}\\/\\d{2,4})\\b`, "i");

// ---------- Design styles ----------
// colors: defaults when the style is picked
// photo: the box the picture fills; mode: default photo effect
// layout: text column. Title options: upper, titleSize, titleWeight, titleFamily, titleFx
// back(c, colors, box) draws under the photo; front(c, colors) draws over it, under the text
export const STYLES: Record<string, any> = {
  bold: {
    label: "Bold circle",
    colors: { bg: "#1f4f8a", text: "#ffffff", hi: "#f5c542" },
    bgGradient: true, glow: 0.06,
    photo: { x: W - SAFE - 460, y: (H - 460) / 2, w: 460, h: 460 }, mode: "circle",
    layout: { x: SAFE, width: 600, align: "left", anchor: "top" },
  },
  fade: {
    label: "Full-bleed fade",
    colors: { bg: "#213648", text: "#e4e3e2", hi: "#b9955f" },
    bgGradient: true, glow: 0, texture: true,
    photo: { x: 560, y: 0, w: 720, h: 720 }, mode: "fade-left",
    layout: { x: SAFE, width: 460, align: "left", anchor: "center" },
  },
  minimal: {
    label: "Minimal light",
    colors: { bg: "#f4f1ea", text: "#1b1f27", hi: "#b5651d" },
    bgGradient: false, glow: 0,
    photo: { x: W - SAFE - 520, y: SAFE, w: 520, h: H - 2 * SAFE }, mode: "rect",
    layout: { x: SAFE, width: 520, align: "left", anchor: "center" },
  },
  duo: {
    label: "Navy duotone",
    colors: { bg: "#1d2f4a", text: "#ffffff", hi: "#f2c14e" },
    bgGradient: false, glow: 0, texture: true,
    photo: { x: 0, y: 0, w: W, h: H }, mode: "duotone",
    front: (c, colors) => {
      c.fillStyle = lin(c, 0, H, W * 0.8, H * 0.2, [
        [0, hexToRgba(colors.bg, 0.95)],
        [0.55, hexToRgba(colors.bg, 0.35)],
        [1, hexToRgba(colors.bg, 0)],
      ]);
      c.fillRect(0, 0, W, H);
    },
    layout: { x: SAFE, width: 960, align: "left", anchor: "bottom", upper: true, titleSize: 96, titleWeight: 800, titleFx: { shadow: true } },
  },
  diag: {
    label: "Diagonal band",
    colors: { bg: "#111418", text: "#ffffff", hi: "#ffd166" },
    bgGradient: false, glow: 0,
    photo: { x: 0, y: 0, w: W, h: H }, mode: "rect",
    front: (c, colors) => {
      c.save();
      c.globalAlpha = 0.94;
      c.fillStyle = "#c8102e";
      c.beginPath();
      c.moveTo(0, 110);
      c.lineTo(W, 40);
      c.lineTo(W, 610);
      c.lineTo(0, 680);
      c.closePath();
      c.fill();
      c.restore();
    },
    layout: { x: SAFE, width: 860, align: "left", anchor: "center", titleFx: { shadow: true } },
  },
  glass: {
    label: "Glass card",
    colors: { bg: "#1b1f3b", text: "#ffffff", hi: "#ffc857" },
    bgGradient: true, glow: 0,
    photo: { x: 0, y: 0, w: W, h: H }, mode: "rect",
    front: (c, colors) => {
      c.fillStyle = hexToRgba(colors.bg, 0.6);
      c.fillRect(0, 0, W, H);
      rrPath(c, 40, 40, 600, 640, 28);
      c.fillStyle = "rgba(255,255,255,0.12)";
      c.fill();
      c.strokeStyle = "rgba(255,255,255,0.4)";
      c.lineWidth = 2;
      c.stroke();
    },
    layout: { x: SAFE, width: 520, align: "left", anchor: "center", titleFx: { shadow: true } },
  },
  arch: {
    label: "Arch window",
    colors: { bg: "#f1e9dc", text: "#2b2118", hi: "#a0522d" },
    bgGradient: false, glow: 0, texture: true,
    photo: { x: W - SAFE - 440, y: SAFE, w: 440, h: H - 2 * SAFE }, mode: "arch",
    back: (c, colors, b) => {
      archPath(c, { x: b.x - 14, y: b.y - 14, w: b.w + 28, h: b.h + 28 });
      c.fillStyle = colors.hi;
      c.fill();
    },
    layout: { x: SAFE, width: 500, align: "left", anchor: "center", titleFamily: SERIF, titleWeight: 700, titleSize: 84 },
  },
  poster: {
    label: "Bold poster",
    colors: { bg: "#0b0b0b", text: "#ffffff", hi: "#ff3b30" },
    bgGradient: false, glow: 0,
    photo: { x: 0, y: 0, w: W, h: H }, mode: "rect",
    front: (c, colors) => {
      c.fillStyle = lin(c, 0, 0, W * 0.75, 0, [
        [0, hexToRgba(colors.bg, 0.96)],
        [0.5, hexToRgba(colors.bg, 0.7)],
        [1, hexToRgba(colors.bg, 0)],
      ]);
      c.fillRect(0, 0, W, H);
    },
    layout: { x: SAFE, width: 700, align: "left", anchor: "center", upper: true, titleSize: 120, titleWeight: 800, titleFx: { shadow: true, stroke: 10, strokeColor: "#000000" } },
  },
  duoSplit: {
    label: "Duotone split",
    colors: { bg: "#1d2f4a", text: "#ffffff", hi: "#f2c14e" },
    bgGradient: true, glow: 0, texture: true,
    photo: { x: 620, y: 0, w: 660, h: 720 }, mode: "duotone-left",
    layout: { x: SAFE, width: 500, align: "left", anchor: "center", upper: true, titleSize: 84, titleWeight: 800, titleFx: { shadow: true } },
  },
  duoFrame: {
    label: "Gold frame",
    colors: { bg: "#17263b", text: "#ffffff", hi: "#d4a955" },
    bgGradient: false, glow: 0, texture: true,
    photo: { x: 0, y: 0, w: W, h: H }, mode: "duotone",
    front: (c, colors) => {
      c.fillStyle = lin(c, 0, H, 0, H * 0.35, [
        [0, hexToRgba(colors.bg, 0.97)],
        [1, hexToRgba(colors.bg, 0)],
      ]);
      c.fillRect(0, 0, W, H);
      c.strokeStyle = colors.hi;
      c.lineWidth = 3;
      c.strokeRect(40, 40, W - 80, H - 80);
    },
    layout: { x: SAFE, width: W - 2 * SAFE, align: "center", anchor: "bottom", upper: true, titleSize: 96, titleWeight: 800, titleFx: { shadow: true } },
  },
  fadeRight: {
    label: "Fade right",
    colors: { bg: "#16202c", text: "#eef1f5", hi: "#e0b15c" },
    bgGradient: true, glow: 0, texture: true,
    photo: { x: 0, y: 0, w: 720, h: 720 }, mode: "fade-right",
    layout: { x: W - SAFE - 520, width: 520, align: "left", anchor: "center", titleFx: { shadow: true } },
  },
  glassBand: {
    label: "Glass band",
    colors: { bg: "#14213d", text: "#ffffff", hi: "#f7c873" },
    bgGradient: true, glow: 0,
    photo: { x: 0, y: 0, w: W, h: H }, mode: "rect",
    front: (c, colors) => {
      c.fillStyle = hexToRgba(colors.bg, 0.55);
      c.fillRect(0, 0, W, H);
      rrPath(c, 120, 100, W - 240, 520, 36);
      c.fillStyle = "rgba(255,255,255,0.14)";
      c.fill();
      c.strokeStyle = "rgba(255,255,255,0.45)";
      c.lineWidth = 2;
      c.stroke();
    },
    layout: { x: 180, width: W - 360, align: "center", anchor: "center", titleFx: { shadow: true } },
  },
  posterYellow: {
    label: "Poster yellow",
    colors: { bg: "#f5c400", text: "#0b0b0b", hi: "#c1121f" },
    bgGradient: false, glow: 0,
    photo: { x: 600, y: 0, w: 680, h: 720 }, mode: "fade-left",
    layout: { x: SAFE, width: 500, align: "left", anchor: "center", upper: true, titleSize: 110, titleWeight: 800 },
  },
  seriesStandard: {
    label: "Series standard",
    colors: { bg: "#213648", text: "#F5F2EA", hi: "#B9955F" },
    bgGradient: false, bgTo: "#1D2F4A", glow: 0, texture: true,
    photo: { x: 640, y: 0, w: 640, h: 720 }, mode: "duotone-left",
    layout: { x: SAFE, width: 500, align: "left", anchor: "center", upper: true, titleSize: 80, titleWeight: 800, titleFx: { shadow: true }, verseGold: true, badgeColor: "#F2C14E" },
  },
  seriesMirror: {
    label: "Series mirror",
    colors: { bg: "#213648", text: "#F5F2EA", hi: "#B9955F" },
    bgGradient: false, bgTo: "#1D2F4A", glow: 0, texture: true,
    photo: { x: 0, y: 0, w: 640, h: 720 }, mode: "duotone-right",
    layout: { x: W - SAFE - 500, width: 500, align: "right", anchor: "center", upper: true, titleSize: 80, titleWeight: 800, titleFx: { shadow: true }, verseGold: true, badgeColor: "#F2C14E" },
  },
  seriesCentered: {
    label: "Series centered",
    colors: { bg: "#213648", text: "#F5F2EA", hi: "#B9955F" },
    bgGradient: false, bgTo: "#1D2F4A", glow: 0, texture: true,
    photo: { x: 320, y: 0, w: 640, h: 720 }, mode: "duotone-both",
    front: (c, colors) => {
      c.fillStyle = lin(c, 0, H, 0, H * 0.45, [
        [0, hexToRgba(colors.bg, 0.95)],
        [1, hexToRgba(colors.bg, 0)],
      ]);
      c.fillRect(0, 0, W, H);
    },
    layout: { x: 140, width: 1000, align: "center", anchor: "bottom", upper: true, titleSize: 80, titleWeight: 800, titleFx: { shadow: true }, verseGold: true, badgeColor: "#F2C14E" },
  },
  seriesBottom: {
    label: "Series low portrait",
    colors: { bg: "#213648", text: "#F5F2EA", hi: "#B9955F" },
    bgGradient: false, bgTo: "#1D2F4A", glow: 0, texture: true,
    photo: { x: 480, y: 0, w: 800, h: 560 }, mode: "duotone",
    layout: { x: SAFE, width: 700, align: "left", anchor: "bottom", upper: true, titleSize: 80, titleWeight: 800, titleFx: { shadow: true }, verseGold: true, badgeColor: "#F2C14E" },
  },
  seriesFrame: {
    label: "Series framed",
    colors: { bg: "#213648", text: "#F5F2EA", hi: "#B9955F" },
    bgGradient: false, bgTo: "#1D2F4A", glow: 0, texture: true,
    photo: { x: 640, y: 0, w: 640, h: 720 }, mode: "duotone-left",
    front: (c, colors) => {
      c.strokeStyle = colors.hi;
      c.lineWidth = 2;
      c.strokeRect(40, 40, W - 80, H - 80);
    },
    layout: { x: SAFE, width: 500, align: "left", anchor: "center", upper: true, titleSize: 80, titleWeight: 800, titleFx: { shadow: true }, verseGold: true, badgeColor: "#F2C14E" },
  },
  naturalFade: {
    label: "Natural fade",
    colors: { bg: "#213648", text: "#F5F2EA", hi: "#B9955F" },
    bgGradient: false, bgTo: "#1D2F4A", glow: 0, texture: true,
    photo: { x: 620, y: 0, w: 660, h: 720 }, mode: "fade-left",
    layout: { x: SAFE, width: 480, align: "left", anchor: "center", upper: true, titleSize: 80, titleWeight: 800, titleFx: { shadow: true }, verseGold: true, badgeColor: "#F2C14E" },
  },
  naturalArch: {
    label: "Natural arch",
    colors: { bg: "#213648", text: "#F5F2EA", hi: "#B9955F" },
    bgGradient: false, bgTo: "#1D2F4A", glow: 0, texture: true,
    photo: { x: W - SAFE - 440, y: SAFE, w: 440, h: H - 2 * SAFE }, mode: "arch",
    back: (c, colors, b) => {
      archPath(c, { x: b.x - 14, y: b.y - 14, w: b.w + 28, h: b.h + 28 });
      c.fillStyle = colors.hi;
      c.fill();
    },
    layout: { x: SAFE, width: 500, align: "left", anchor: "center", upper: true, titleSize: 80, titleWeight: 800, titleFx: { shadow: true }, verseGold: true, badgeColor: "#F2C14E" },
  },
  naturalCircle: {
    label: "Natural circle",
    colors: { bg: "#213648", text: "#F5F2EA", hi: "#B9955F" },
    bgGradient: false, bgTo: "#1D2F4A", glow: 0, texture: true,
    photo: { x: W - SAFE - 460, y: (H - 460) / 2, w: 460, h: 460 }, mode: "circle",
    layout: { x: SAFE, width: 600, align: "left", anchor: "center", upper: true, titleSize: 80, titleWeight: 800, titleFx: { shadow: true }, verseGold: true, badgeColor: "#F2C14E" },
  },
  naturalFull: {
    label: "Natural full-bleed",
    colors: { bg: "#213648", text: "#F5F2EA", hi: "#B9955F" },
    bgGradient: false, glow: 0,
    photo: { x: 0, y: 0, w: W, h: H }, mode: "rect",
    front: (c, colors) => {
      // Soft navy shade only behind the text column; the portrait keeps its natural color
      c.fillStyle = lin(c, 0, 0, W * 0.65, 0, [
        [0, hexToRgba(colors.bg, 0.95)],
        [0.7, hexToRgba(colors.bg, 0.55)],
        [1, hexToRgba(colors.bg, 0)],
      ]);
      c.fillRect(0, 0, W, H);
    },
    layout: { x: SAFE, width: 620, align: "left", anchor: "center", upper: true, titleSize: 88, titleWeight: 800, titleFx: { shadow: true }, verseGold: true, badgeColor: "#F2C14E" },
  },
  naturalBottom: {
    label: "Natural bottom fade",
    colors: { bg: "#213648", text: "#F5F2EA", hi: "#B9955F" },
    bgGradient: false, glow: 0,
    photo: { x: 640, y: 0, w: 640, h: 480 }, mode: "fade-bottom",
    layout: { x: SAFE, width: 520, align: "left", anchor: "bottom", upper: true, titleSize: 84, titleWeight: 800, titleFx: { shadow: true }, verseGold: true, badgeColor: "#F2C14E" },
  },
};

// Alpha fades applied to the photo edges. Each fade multiplies the picture's
// transparency, so the photo melts into whatever background sits behind it.
export const FADES = {
  "rect": [],
  "fade-left": [{ side: "left", len: 0.4 }],
  "fade-bottom": [{ side: "bottom", len: 0.4 }],
  "fade-edges": [
    { side: "left", len: 0.25 },
    { side: "right", len: 0.25 },
    { side: "top", len: 0.2 },
    { side: "bottom", len: 0.3 },
  ],
  "duotone": [{ side: "bottom", len: 0.5 }],
  "duotone-left": [{ side: "left", len: 0.45 }],
  "fade-right": [{ side: "right", len: 0.4 }],
  "duotone-right": [{ side: "right", len: 0.45 }],
  "duotone-both": [{ side: "left", len: 0.3 }, { side: "right", len: 0.3 }],
};

// ---------- PDF extraction ----------

export async function extractFromPdf(file) {
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  const pages = [];
  const maxPages = Math.min(pdf.numPages, 3);
  for (let p = 1; p <= maxPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    pages.push(content.items
      .filter((it) => it.str && it.str.trim())
      .map((it) => ({
        text: it.str.trim(),
        x: it.transform[4],
        y: it.transform[5],
        width: it.width || 0,
        size: Math.abs(it.transform[3]) || it.height || 0,
      })));
  }
  return pages;
}

// Group text items into visual lines (same baseline), top to bottom.
export function toLines(items) {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines = [];
  for (const it of sorted) {
    const last = lines[lines.length - 1];
    if (last && Math.abs(last.y - it.y) < 3) {
      last.parts.push(it);
    } else {
      lines.push({ y: it.y, parts: [it] });
    }
  }
  return lines.map((l) => {
    l.parts.sort((a, b) => a.x - b.x);
    // Fragments touch when the gap is small, so only add a space for a real gap.
    let text = "";
    let prevEnd = null;
    for (const p of l.parts) {
      if (prevEnd !== null && p.x - prevEnd > 1.5) text += " ";
      text += p.text;
      prevEnd = p.x + p.width;
    }
    return {
      y: l.y,
      text: text.replace(/\s+/g, " ").trim(),
      size: Math.max(...l.parts.map((p) => p.size)),
    };
  });
}

export function parseProgram(pages) {
  const lines = toLines(pages.flat());
  const fullText = lines.map((l) => l.text).join(" ");

  // Verse reference and quoted verse text
  let verseRef = "", verseText = "";
  const refMatch = fullText.match(VERSE_REF);
  if (refMatch) {
    verseRef = refMatch[1].replace(/\s+/g, " ").trim();
    const idx = fullText.indexOf(refMatch[1]);
    const near = fullText.slice(Math.max(0, idx - 400), idx + 400);
    const quoted = near.match(/[“"]([^”"]{15,})[”"]/);
    if (quoted) verseText = quoted[1].replace(/\s+/g, " ").trim();
  }

  // Date
  let dateText = "";
  const dateMatch = fullText.match(DATE_RE);
  if (dateMatch) dateText = (dateMatch[1] || dateMatch[2]).replace(/\s+/g, " ").trim();

  // Title: first a labeled line such as "Sermon: Walking in Grace".
  // Otherwise the largest type on the first page, using the first contiguous run of it.
  const first = lines.filter((l) => l.text.length > 2);
  let title = "";
  const labeled = first.map((l) => l.text.match(/^(?:sermon|message|sermon title|title|topic)\s*:\s*(.+)$/i)).find(Boolean);
  if (labeled) {
    title = labeled[1];
  } else {
    const maxSize = Math.max(...first.map((l) => l.size));
    const qualifies = (l) =>
      l.size >= maxSize * 0.9 &&
      !VERSE_REF.test(l.text) &&
      !DATE_RE.test(l.text);
    const idxs = first.map((_, i) => i).filter((i) => qualifies(first[i]));
    const run = [];
    for (const i of idxs) {
      if (run.length && i !== run[run.length - 1] + 1) break;
      run.push(i);
    }
    title = run.map((i) => first[i].text).join(" ");
  }
  title = title.replace(/\s+/g, " ").trim();
  if (title.length > 120) title = title.slice(0, 117).trim() + "…";

  return { title, verseText, verseRef, dateText };
}

// ---------- Drawing helpers ----------

export function hexToRgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
}

// Darken (negative amount) or lighten (positive) a hex color.
export function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const clamp = (v) => Math.max(0, Math.min(255, v));
  const r = clamp((n >> 16) + amt), g = clamp(((n >> 8) & 255) + amt), b = clamp((n & 255) + amt);
  return `rgb(${r},${g},${b})`;
}

// Linear gradient from (x0,y0) to (x1,y1). stops is a list of [position, color].
export function lin(c, x0, y0, x1, y1, stops) {
  const g = c.createLinearGradient(x0, y0, x1, y1);
  for (const [p, col] of stops) g.addColorStop(p, col);
  return g;
}

// Dark text on light colors, light text on dark colors
export function contrastText(hex) {
  const n = parseInt(hex.slice(1), 16);
  const lum = 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
  return lum > 150 ? "#0b1220" : "#ffffff";
}

// Rounded rectangle path (no fill)
export function rrPath(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

export function roundRect(c, x, y, w, h, r, fill) {
  rrPath(c, x, y, w, h, r);
  c.fillStyle = fill;
  c.fill();
}

// Arch path: straight sides with a half-circle top (no fill)
export function archPath(c, b) {
  const r = b.w / 2;
  c.beginPath();
  c.moveTo(b.x, b.y + b.h);
  c.lineTo(b.x, b.y + r);
  c.arc(b.x + r, b.y + r, r, Math.PI, 0);
  c.lineTo(b.x + b.w, b.y + b.h);
  c.closePath();
}

export function wrapText(c, text, maxWidth) {
  const words = text.split(/\s+/);
  const out = [];
  let line = "";
  for (const w of words) {
    const test = line ? line + " " + w : w;
    if (c.measureText(test).width > maxWidth && line) {
      out.push(line);
      line = w;
    } else {
      line = test;
    }
  }
  if (line) out.push(line);
  return out;
}

// Shrink the font until the wrapped text fits the box.
export function fitText(c, text, maxWidth, maxHeight, family, weight, startSize, style = "") {
  let size = startSize;
  let lines = [];
  while (size > 22) {
    c.font = `${style} ${weight} ${size}px ${family}`.trim();
    lines = wrapText(c, text, maxWidth);
    if (lines.length * size * 1.15 <= maxHeight) break;
    size -= 4;
  }
  return { size, lines, lh: size * 1.15 };
}

export function drawCover(c, img, x, y, w, h) {
  const scale = Math.max(w / img.width, h / img.height);
  const sw = w / scale, sh = h / scale;
  const sx = (img.width - sw) / 2;
  const sy = Math.max(0, (img.height - sh) * 0.2); // favor the top, where faces usually are
  c.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

// Draws the photo into box using the chosen effect.
export function drawPhoto(c: any, box: any, mode: string, colors: any, photo: any) {
  if (mode === "circle") {
    const r = Math.min(box.w, box.h) / 2;
    const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
    c.save();
    c.beginPath();
    c.arc(cx, cy, r, 0, Math.PI * 2);
    c.clip();
    if (photo) drawCover(c, photo, box.x, box.y, box.w, box.h);
    else { c.fillStyle = "rgba(0,0,0,0.25)"; c.fillRect(box.x, box.y, box.w, box.h); }
    c.restore();
    c.lineWidth = 10;
    c.strokeStyle = colors.hi;
    c.beginPath();
    c.arc(cx, cy, r + 5, 0, Math.PI * 2);
    c.stroke();
    return;
  }

  if (mode === "arch") {
    c.save();
    archPath(c, box);
    c.clip();
    if (photo) drawCover(c, photo, box.x, box.y, box.w, box.h);
    else { c.fillStyle = "rgba(0,0,0,0.25)"; c.fillRect(box.x, box.y, box.w, box.h); }
    c.restore();
    return;
  }

  // Fades need a separate layer so the transparency only affects the photo.
  const off = document.createElement("canvas");
  off.width = Math.round(box.w);
  off.height = Math.round(box.h);
  const oc = off.getContext("2d");
  const w = off.width, h = off.height;
  if (photo) drawCover(oc, photo, 0, 0, w, h);
  else { oc.fillStyle = "rgba(0,0,0,0.25)"; oc.fillRect(0, 0, w, h); }

  // Duotone: tint the photo with the background color, keeping its light and shade
  if (mode.startsWith("duotone")) {
    oc.globalCompositeOperation = "color";
    oc.fillStyle = colors.bg;
    oc.fillRect(0, 0, w, h);
  }

  oc.globalCompositeOperation = "destination-in";
  for (const f of FADES[mode] || []) {
    let g;
    if (f.side === "left") g = oc.createLinearGradient(0, 0, w * f.len, 0);
    else if (f.side === "right") g = oc.createLinearGradient(w, 0, w * (1 - f.len), 0);
    else if (f.side === "top") g = oc.createLinearGradient(0, 0, 0, h * f.len);
    else g = oc.createLinearGradient(0, h, 0, h * (1 - f.len));
    // Eased S-curve (smoothstep): the fade starts and ends softly, with no straight edge
    for (let i = 0; i <= 16; i++) {
      const t = i / 16;
      g.addColorStop(t, `rgba(0,0,0,${t * t * (3 - 2 * t)})`);
    }
    oc.fillStyle = g;
    oc.fillRect(0, 0, w, h);
  }
  c.drawImage(off, box.x, box.y);
}

// Builds the text blocks at scale k (1 = full size). Heights are measured so the stack can fit.
// Block roles: "title", "verse", "hi" (highlight color), "text"
export function layoutBlocks(c, d, L, k) {
  const blocks = [];
  const add = (lines, font, role, lh, gap) => blocks.push({ lines, font, role, lh, gap });
  const tf = L.titleFamily || FAM;
  const tw = L.titleWeight || 800;

  if (d.church) add([d.church.toUpperCase()], `800 ${26 * k}px ${FAM}`, "hi", 30 * k, 26 * k);
  if (d.title) {
    const titleText = L.upper ? d.title.toUpperCase() : d.title;
    const t = fitText(c, titleText, L.width, 260 * k, tf, tw, (L.titleSize || 84) * k);
    add(t.lines, `${tw} ${t.size}px ${tf}`, "title", t.lh, 26 * k);
  }
  if (d.verseText) {
    const v = fitText(c, `“${d.verseText}”`, L.width, 150 * k, SERIF, 500, 40 * k, "italic");
    add(v.lines, `italic 500 ${v.size}px ${SERIF}`, "verse", v.lh, 18 * k);
  }
  if (d.verseRef) add([d.verseRef.toUpperCase()], `800 ${30 * k}px ${FAM}`, "hi", 36 * k, 14 * k);
  if (d.dateText) blocks.push({ badge: true, text: d.dateText, font: `800 ${26 * k}px ${FAM}`, h: 56 * k, gap: 18 * k });
  if (d.pastor) add([d.pastor], `600 ${24 * k}px ${FAM}`, "text", 30 * k, 0);

  // The last gap is not part of the visible stack, so leave it out
  const total = blocks.reduce((s, b) => s + (b.badge ? b.h : b.lines.length * b.lh) + b.gap, 0)
    - blocks[blocks.length - 1].gap;
  return { blocks, total };
}

// Stacks the text blocks inside the safe area and places them according to the style's layout.
export function drawText(c, d, colors, L) {
  const avail = H - 2 * SAFE;
  let k = 1;
  let lay = layoutBlocks(c, d, L, k);
  while (lay.total > avail && k > 0.6) {
    k -= 0.05;
    lay = layoutBlocks(c, d, L, k);
  }
  const { blocks, total } = lay;
  let y = L.anchor === "top" ? SAFE
    : L.anchor === "center" ? SAFE + (avail - total) / 2
    : H - SAFE - total;

  const fx = L.titleFx || {};
  c.textBaseline = "top";
  for (const b of blocks) {
    c.font = b.font;
    if (b.badge) {
      const pad = 22 * k;
      const bw = c.measureText(b.text).width + 2 * pad;
      const bx = L.align === "center" ? L.x + (L.width - bw) / 2
        : L.align === "right" ? L.x + L.width - bw : L.x;
      roundRect(c, bx, y, bw, b.h, 10 * k, L.badgeColor || colors.hi);
      c.fillStyle = contrastText(L.badgeColor || colors.hi);
      c.fillText(b.text, bx + pad, y + (b.h - 26 * k * 1.15) / 2);
      y += b.h + b.gap;
    } else {
      const isTitle = b.role === "title";
      c.fillStyle = b.role === "hi" || (b.role === "verse" && L.verseGold) ? colors.hi : colors.text;
      b.lines.forEach((ln, i) => {
        const tw = c.measureText(ln).width;
        const x = L.align === "center" ? L.x + (L.width - tw) / 2
          : L.align === "right" ? L.x + L.width - tw : L.x;
        const yy = y + i * b.lh;
        if (isTitle && fx.shadow) {
          c.shadowColor = "rgba(0,0,0,0.55)";
          c.shadowBlur = 28;
          c.shadowOffsetY = 6;
        }
        if (isTitle && fx.stroke) {
          c.lineWidth = fx.stroke;
          c.strokeStyle = fx.strokeColor;
          c.lineJoin = "round";
          c.strokeText(ln, x, yy);
        }
        c.fillText(ln, x, yy);
        c.shadowColor = "transparent";
        c.shadowBlur = 0;
        c.shadowOffsetY = 0;
      });
      y += b.lines.length * b.lh + b.gap;
    }
  }
}

// Film grain tile, made once and reused as a repeating pattern
let grainTile: HTMLCanvasElement | null = null;
export function grainPattern(c) {
  if (!grainTile) {
    grainTile = document.createElement("canvas");
    grainTile.width = grainTile.height = 256;
    const gc = grainTile.getContext("2d");
    const img = gc.createImageData(256, 256);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.random() * 255;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    gc.putImageData(img, 0, 0);
  }
  return c.createPattern(grainTile, "repeat");
}

// Cinematic finish: teal-and-amber grade, light leak, lens streak, vignette, grain, letterbox bars
export const BAR = 56;
export function drawCinematic(c) {
  const grade = c.createLinearGradient(0, 0, 0, H);
  grade.addColorStop(0, "rgba(20,90,110,0.55)");
  grade.addColorStop(1, "rgba(255,150,70,0.4)");
  c.save();
  c.globalCompositeOperation = "overlay";
  c.fillStyle = grade;
  c.fillRect(0, 0, W, H);
  c.restore();

  // Warm light leak in the top-right corner
  const leak = c.createRadialGradient(W, 0, 0, W, 0, W * 0.55);
  leak.addColorStop(0, "rgba(255,170,90,0.55)");
  leak.addColorStop(1, "rgba(255,170,90,0)");
  c.save();
  c.globalCompositeOperation = "screen";
  c.fillStyle = leak;
  c.fillRect(0, 0, W, H);
  c.restore();

  // Anamorphic lens streak across the frame
  const streakY = H * 0.42;
  const streak = c.createLinearGradient(0, 0, W, 0);
  streak.addColorStop(0, "rgba(120,200,255,0)");
  streak.addColorStop(0.5, "rgba(120,200,255,0.7)");
  streak.addColorStop(1, "rgba(120,200,255,0)");
  c.save();
  c.globalCompositeOperation = "screen";
  c.fillStyle = streak;
  c.fillRect(0, streakY - 3, W, 6);
  c.globalAlpha = 0.25;
  c.fillRect(0, streakY - 14, W, 28);
  c.restore();

  const vg = c.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, W * 0.7);
  vg.addColorStop(0, "rgba(0,0,0,0)");
  vg.addColorStop(1, "rgba(0,0,0,0.6)");
  c.fillStyle = vg;
  c.fillRect(0, 0, W, H);

  c.save();
  c.globalAlpha = 0.09;
  c.fillStyle = grainPattern(c);
  c.fillRect(0, 0, W, H);
  c.restore();

  c.fillStyle = "#000";
  c.fillRect(0, 0, W, BAR);
  c.fillRect(0, H - BAR, W, BAR);
}

// Draws one complete thumbnail at any size (cw x ch) using design units of 1280x720.
export function renderTo(c: any, key: string, cw: number, ch: number, data: any, colors: any, mode: string, cine: boolean, photo: any) {
  const s = STYLES[key];
  c.setTransform(cw / W, 0, 0, ch / H, 0, 0);

  if (s.bgTo) {
    c.fillStyle = lin(c, 0, 0, W, H, [[0, colors.bg], [1, s.bgTo]]);
  } else if (s.bgGradient) {
    const g = c.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, shade(colors.bg, -35));
    g.addColorStop(1, colors.bg);
    c.fillStyle = g;
  } else {
    c.fillStyle = colors.bg;
  }
  c.fillRect(0, 0, W, H);

  // Paper-like texture, as in the reference design
  if (s.texture) {
    c.save();
    c.globalAlpha = 0.06;
    c.fillStyle = grainPattern(c);
    c.fillRect(0, 0, W, H);
    c.restore();
  }

  const b = s.photo;
  if (s.glow) {
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    const g = c.createRadialGradient(cx, cy, 0, cx, cy, Math.max(b.w, b.h) * 0.75);
    g.addColorStop(0, `rgba(255,255,255,${s.glow})`);
    g.addColorStop(1, "rgba(255,255,255,0)");
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);
  }

  if (s.back) s.back(c, colors, b);
  drawPhoto(c, b, mode, colors, photo);
  if (s.front) s.front(c, colors);
  if (cine) drawCinematic(c);
  drawText(c, data, colors, s.layout);
}

