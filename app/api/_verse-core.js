// Shared by api/verse.js, api/verse-card.js and the Vite dev stand-in (vite.config.ts).
// A shared verse link (/v/JHN.3.16-17) answers with a small page that carries the Open Graph tags (so messaging apps show
// the verse card) and sends people straight on to the Bible reader at that verse. The card is a 1200 x 630 PNG.
// Files starting with "_" in api/ are not routes on Vercel.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import fontkit from "@pdf-lib/fontkit";
import { Resvg } from "@resvg/resvg-js";

const DEFAULT_TRANSLATION = "bunong-vn";
const APP = "Nau Brah Ndu Ngơi";
const FONT_FILES = {
  regular: new URL("../public/fonts/NotoSerif-Regular.ttf", import.meta.url),
  semi: new URL("../public/fonts/NotoSerif-SemiBold.ttf", import.meta.url),
  italic: new URL("../public/fonts/NotoSerif-Italic.ttf", import.meta.url),
};

// "JHN.3.16" or "JHN.3.16-17"
export function parseRef(s, t) {
  const m = /^([1-3A-Z]{3})\.(\d{1,3})\.(\d{1,3})(?:-(\d{1,3}))?$/.exec(String(s || ""));
  if (!m) return null;
  const v1 = +m[3], v2 = m[4] ? Math.max(+m[4], v1) : v1;
  return { b: m[1], c: +m[2], v1, v2: Math.min(v2, v1 + 30), t: /^[a-z0-9-]{2,40}$/.test(String(t || "")) ? String(t) : DEFAULT_TRANSLATION };
}
export const refParam = (r) => `${r.b}.${r.c}.${r.v1}${r.v2 > r.v1 ? `-${r.v2}` : ""}`;
const tParam = (r) => (r.t && r.t !== DEFAULT_TRANSLATION ? `t=${r.t}` : "");

const tidyVerse = (t) => String(t).replace(/\s+/g, " ").trim().replace(/^[“”"]+|[“”"]+$/g, "");

// Everything shown about a shared verse comes from the database: its words, and the translation's own book name. found is false when the verse is not there (the preview then shows only the reference).
export async function fetchVerse(r, supabaseUrl, anonKey) {
  if (!supabaseUrl || !anonKey) return null;
  const h = { apikey: anonKey, Authorization: `Bearer ${anonKey}` };
  const q = (path) => fetch(`${supabaseUrl}/rest/v1/${path}`, { headers: h }).then((x) => (x.ok ? x.json() : []));
  const t = encodeURIComponent(r.t);
  const [verses, names] = await Promise.all([
    q(`bible_verses?select=verse,text&translation_id=eq.${t}&book_code=eq.${r.b}&chapter=eq.${r.c}&verse=gte.${r.v1}&verse=lte.${r.v2}&order=verse`),
    q(`bible_book_names?select=name&translation_id=eq.${t}&book_code=eq.${r.b}`),
  ]);
  const book = names[0]?.name || r.b;
  return {
    found: verses.length > 0,
    text: tidyVerse(verses.map((v) => v.text).join(" ")),
    label: `${book} ${r.c}:${r.v1}${r.v2 > r.v1 ? `–${r.v2}` : ""}`,
  };
}

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// The page messaging apps read. People are sent on to the reader at once.
export function verseHtml({ origin, r, verse }) {
  const t = tParam(r);
  const reader = `${origin}/nau-brah-ndu-ngoi/?v=${refParam(r)}${t ? `&${t}` : ""}`;
  const label = verse?.label ?? `${r.b} ${r.c}:${r.v1}${r.v2 > r.v1 ? `–${r.v2}` : ""}`;
  const title = label;
  const desc = verse?.found ? verse.text : title;
  const image = `${origin}/api/verse-card?v=${refParam(r)}${t ? `&${t}` : ""}`;
  verse = verse?.found ? verse : null;
  return `<!doctype html><html lang="mnw"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="${APP}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(`${origin}/v/${refParam(r)}${t ? `?${t}` : ""}`)}">
${verse ? `<meta property="og:image" content="${esc(image)}">
<meta property="og:image:width" content="600">
<meta property="og:image:height" content="600">
<meta property="og:image:alt" content="${esc(title)}">
<meta name="twitter:card" content="summary">
<meta name="twitter:image" content="${esc(image)}">` : `<meta name="twitter:card" content="summary">`}
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta http-equiv="refresh" content="0;url=${esc(reader)}">
<script>location.replace(${JSON.stringify(reader)})</script>
<style>body{font:18px/1.6 Georgia,serif;max-width:36em;margin:15vh auto;padding:0 20px;color:#1b2430}a{color:#2f5f8a}</style>
</head><body>
${verse ? `<p>“${esc(verse.text)}”</p><p>— ${esc(verse.label)}</p>` : ""}
<p><a href="${esc(reader)}">Read the full passage in ${APP}</a></p>
</body></html>`;
}

// ---------- The card ----------
let fonts = null;
function loadFonts() {
  if (fonts) return fonts;
  const buf = Object.fromEntries(Object.entries(FONT_FILES).map(([k, u]) => [k, readFileSync(u)]));
  fonts = { buf, regular: fontkit.create(buf.regular) };
  return fonts;
}
const widthOf = (font, text, size) => (font.layout(text).advanceWidth / font.unitsPerEm) * size;

// Break words into lines no wider than max. Returns null when they need more than maxLines.
function wrap(font, text, size, max, maxLines) {
  const lines = [];
  let line = "";
  for (const w of text.split(" ")) {
    const next = line ? `${line} ${w}` : w;
    if (!line || widthOf(font, next, size) <= max) line = next;
    else { lines.push(line); line = w; }
    if (lines.length > maxLines) return null;
  }
  if (line) lines.push(line);
  return lines.length <= maxLines ? lines : null;
}

// A square tile: the reference in italic serif on burgundy. Messaging apps show it beside the title, and the verse
// itself travels in the message text.
const S = 600, PAD = 64;

export function cardSvg(verse) {
  const { regular } = loadFonts();
  const label = verse.label;
  const cut = label.lastIndexOf(" ");
  const lines = cut > 0 ? [label.slice(0, cut), label.slice(cut + 1)] : [label];
  // The biggest size, up to 96, at which each line fits across the tile
  let size = 96;
  while (size > 36 && lines.some((l) => widthOf(regular, l, size) > S - PAD * 2)) size -= 4;
  let parts = lines;
  if (lines.some((l) => widthOf(regular, l, size) > S - PAD * 2)) parts = wrap(regular, lines[0], size, S - PAD * 2, 3)?.concat(lines.slice(1)) ?? lines;
  const lead = size * 1.25;
  const y0 = S / 2 - ((parts.length - 1) * lead) / 2 + size * 0.35;
  const tspans = parts.map((l, i) => `<tspan x="${S / 2}" y="${(y0 + i * lead).toFixed(1)}">${esc(l)}</tspan>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
<rect width="${S}" height="${S}" fill="#7a3324"/>
<text text-anchor="middle" font-family="Noto Serif" font-style="italic" font-size="${size}" fill="#f6ede2">${tspans}</text>
</svg>`;
}

export function cardPng(verse) {
  const svg = cardSvg(verse);
  const r = new Resvg(svg, { font: { fontFiles: Object.values(FONT_FILES).map((u) => fileURLToPath(u)), loadSystemFonts: false, defaultFontFamily: "Noto Serif" } });
  return r.render().asPng();
}

export const originOf = (headers) => {
  const host = headers["x-forwarded-host"] || headers.host || "localhost";
  const proto = headers["x-forwarded-proto"] || (/^(localhost|127\.)/.test(host) ? "http" : "https");
  return `${String(proto).split(",")[0]}://${host}`;
};
