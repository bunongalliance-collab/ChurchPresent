// Selected-text formatting for slide text. Markers stay in the text as typed:
//   **bold**   ~~italic~~   __underline__   {#rrggbb}coloured{/}
//   {v}styled like a verse number{/v}   {n}never styled as a verse number{/n}
// Only the text between a pair of markers is formatted. Markers can be combined.

export type RichSeg = { text: string; bold?: boolean; italic?: boolean; underline?: boolean; color?: string; highlight?: string };
export type RichPiece = { text: string; token: boolean; bold?: boolean; italic?: boolean; underline?: boolean; color?: string; highlight?: string };

export const RICH_TOKENS: Record<string, "bold" | "italic" | "underline"> = { "**": "bold", "~~": "italic", "__": "underline" };
const COLOR_OPEN = /^\{#([0-9a-fA-F]{6})\}/;
const COLOR_CLOSE = "{/}";
const HIGHLIGHT_OPEN = /^\{h#([0-9a-fA-F]{6})\}/;
const HIGHLIGHT_CLOSE = "{/h}";
// Verse-number mode markers: they only change how numbers are drawn, so the text box hides them
const MODE_TOKENS = ["{v}", "{/v}", "{n}", "{/n}"];

// Splits one line into pieces. Marker pieces are kept, so the text box can show them faintly
// and keep its layout exactly the same as the typed text.
export function richPieces(line: string): RichPiece[] {
  const out: RichPiece[] = [];
  const st: { bold: boolean; italic: boolean; underline: boolean; color?: string; highlight?: string } = { bold: false, italic: false, underline: false };
  let buf = "";
  const flush = () => {
    if (!buf) return;
    out.push({
      text: buf, token: false,
      ...(st.bold ? { bold: true } : {}), ...(st.italic ? { italic: true } : {}),
      ...(st.underline ? { underline: true } : {}), ...(st.color ? { color: st.color } : {}), ...(st.highlight ? { highlight: st.highlight } : {}),
    });
    buf = "";
  };
  for (let i = 0; i < line.length; ) {
    const rest = line.slice(i);
    const mode = MODE_TOKENS.find((t) => rest.startsWith(t));
    if (mode) {
      flush();
      out.push({ text: mode, token: true });
      i += mode.length;
      continue;
    }
    if (rest.startsWith(COLOR_CLOSE)) {
      flush();
      out.push({ text: COLOR_CLOSE, token: true });
      st.color = undefined;
      i += COLOR_CLOSE.length;
      continue;
    }
    if (rest.startsWith(HIGHLIGHT_CLOSE)) {
      flush();
      out.push({ text: HIGHLIGHT_CLOSE, token: true });
      st.highlight = undefined;
      i += HIGHLIGHT_CLOSE.length;
      continue;
    }
    const hl = rest.match(HIGHLIGHT_OPEN);
    if (hl) {
      flush();
      out.push({ text: hl[0], token: true });
      st.highlight = `#${hl[1]}`;
      i += hl[0].length;
      continue;
    }
    const open = rest.match(COLOR_OPEN);
    if (open) {
      flush();
      out.push({ text: open[0], token: true });
      st.color = `#${open[1]}`;
      i += open[0].length;
      continue;
    }
    const two = line.slice(i, i + 2);
    const kind = RICH_TOKENS[two];
    if (kind) {
      flush();
      out.push({ text: two, token: true });
      st[kind] = !st[kind];
      i += 2;
      continue;
    }
    buf += line[i];
    i++;
  }
  flush();
  return out;
}

// The formatted segments of one line (markers removed)
export function parseRich(line: string): RichSeg[] {
  return richPieces(line).filter((p) => !p.token).map((p) => ({
    text: p.text, bold: p.bold, italic: p.italic, underline: p.underline, color: p.color, highlight: p.highlight,
  }));
}

// Wraps the selected text in a marker, or removes the marker when the selection already has it.
export function toggleMarker(text: string, start: number, end: number, token: string): { text: string; start: number; end: number } | null {
  if (start === end) return null;
  const before = text.slice(0, start);
  const selected = text.slice(start, end);
  const after = text.slice(end);
  const t = token.length;
  if (selected.length >= 2 * t && selected.startsWith(token) && selected.endsWith(token)) {
    const inner = selected.slice(t, selected.length - t);
    return { text: before + inner + after, start, end: start + inner.length };
  }
  return { text: before + token + selected + token + after, start: start + t, end: end + t };
}

// Colours the selected text
export function colorSelection(text: string, start: number, end: number, hex: string): { text: string; start: number; end: number } | null {
  if (start === end) return null;
  const open = `{#${hex.replace("#", "").toLowerCase()}}`;
  const before = text.slice(0, start);
  const selected = text.slice(start, end);
  const after = text.slice(end);
  return { text: before + open + selected + COLOR_CLOSE + after, start: start + open.length, end: end + open.length };
}

// Highlights the selected text
export function highlightSelection(text: string, start: number, end: number, hex: string): { text: string; start: number; end: number } | null {
  if (start === end) return null;
  const open = `{h#${hex.replace("#", "").toLowerCase()}}`;
  const before = text.slice(0, start);
  const selected = text.slice(start, end);
  const after = text.slice(end);
  return { text: before + open + selected + HIGHLIGHT_CLOSE + after, start: start + open.length, end: end + open.length };
}

// Removes every formatting marker from a text (used by Clear formatting)
export function stripMarkers(text: string): string {
  return text.replace(/\*\*|~~|__|\{#[0-9a-fA-F]{6}\}|\{\/\}|\{h#[0-9a-fA-F]{6}\}|\{\/h\}|\{\/?[vn]\}/g, "");
}

// Ready-made colours for the text box
export const TEXT_COLOR_OPTIONS = ["#FFFFFF", "#F2C14E", "#FFD166", "#7EC8E3", "#5FD3A8", "#FF8A80", "#E9B44C", "#B5452D"];
export const HIGHLIGHT_OPTIONS = ["#FFF176", "#A7F3D0", "#BAE6FD", "#FBCFE8", "#FDE68A", "#FF6B6B", "#FDBA74", "#C4B5FD"];

// Removes colour markers (text colour or highlight) inside a piece of text
export function stripColorMarkers(text: string, kind: "text" | "highlight"): string {
  return kind === "text" ? text.replace(/\{#[0-9a-fA-F]{6}\}|\{\/\}/g, "") : text.replace(/\{h#[0-9a-fA-F]{6}\}|\{\/h\}/g, "");
}

// A readable text colour for a background: dark text on light backgrounds, white on dark ones
export function contrastText(bg: string): string {
  const h = bg.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.35 ? "#1B2A41" : "#FFFFFF";
}

// Ready-made highlight colours; the text colour for each is picked so it reads clearly
export const COMBO_OPTIONS: { name: string; fg: string; bg: string }[] = [
  { name: "Yellow", bg: "#FFF176" },
  { name: "Mint", bg: "#A7F3D0" },
  { name: "Sky", bg: "#BAE6FD" },
  { name: "Gold", bg: "#FFD166" },
  { name: "Green", bg: "#019A66" },
  { name: "Terracotta", bg: "#B5452D" },
  { name: "Navy", bg: "#213648" },
  { name: "Maroon", bg: "#5C1A1B" },
].map((c) => ({ ...c, fg: contrastText(c.bg) }));

// Sets the text colour and the highlight together on the selected text, replacing earlier colours in it
export function comboSelection(text: string, start: number, end: number, fg: string, bg: string): { text: string; start: number; end: number } | null {
  if (start === end) return null;
  const part = stripColorMarkers(stripColorMarkers(text.slice(start, end), "text"), "highlight");
  const open = `{#${fg.replace("#", "").toLowerCase()}}{h#${bg.replace("#", "").toLowerCase()}}`;
  const close = "{/h}{/}";
  return {
    text: text.slice(0, start) + open + part + close + text.slice(end),
    start: start + open.length,
    end: start + open.length + part.length,
  };
}

// ---------- Verse numbers ----------
// On slides a verse number is marked "\u0001" + digits. Text the user set to match verse numbers
// is marked "\u0001\u0002" + text + "\u0003". VERSE_SPLIT splits a line so every odd part is a number.
export const VERSE_SPLIT = /\u0001\u0002?((?<=\u0002)[^\u0003]*|\d{1,3})\u0003?/;
const AUTO_BOUNDARY = /[\s.;:!?,]/;
const ANY_TOKEN = /^(\*\*|~~|__|\{#[0-9a-fA-F]{6}\}|\{\/\}|\{h#[0-9a-fA-F]{6}\}|\{\/h\}|\{\/?[vn]\})/;

// Turns one stored line into a slide line: detected verse numbers are marked (when auto is on),
// {v} text is marked as a verse number, {n} text is left as normal text. The {v}/{n} markers are removed.
export function markVerses(line: string, auto: boolean): string {
  let out = "";
  let mode: "" | "v" | "n" = "";
  let prev = ""; // the last visible character
  let vbuf = "";
  const flushV = () => { out += vbuf.replace(/\S+/g, (w) => `\u0001\u0002${w}\u0003`); vbuf = ""; };
  for (let i = 0; i < line.length; ) {
    const tok = line.slice(i, i + 16).match(ANY_TOKEN)?.[0];
    if (tok) {
      if (mode === "v") flushV();
      if (tok === "{v}") mode = "v";
      else if (tok === "{n}") mode = "n";
      else if (tok === "{/v}" || tok === "{/n}") mode = "";
      else out += tok;
      i += tok.length;
      continue;
    }
    const ch = line[i];
    if (mode === "v") { vbuf += ch; prev = ch; i++; continue; }
    if (auto && mode === "" && /\d/.test(ch) && (prev === "" || AUTO_BOUNDARY.test(prev))) {
      const m = line.slice(i).match(/^\d{1,3}(?=\s)/);
      if (m) { out += `\u0001${m[0]}`; prev = m[0].slice(-1); i += m[0].length; continue; }
    }
    out += ch; prev = ch; i++;
  }
  if (mode === "v") flushV();
  return out;
}

// Sets the verse-number mode ("v", "n" or "" for automatic) of the selected text, keeping all other markers.
// When the whole selection already has that mode, it goes back to automatic.
export function setVerseMode(text: string, start: number, end: number, want: "v" | "n"): { text: string; start: number; end: number } | null {
  if (start === end) return null;
  type Item = { s: string; tok: boolean; m: "" | "v" | "n"; pos: number };
  const items: Item[] = [];
  let mode: "" | "v" | "n" = "";
  for (let i = 0; i < text.length; ) {
    const tok = text.slice(i, i + 16).match(ANY_TOKEN)?.[0];
    if (tok && /^\{\/?[vn]\}$/.test(tok)) { mode = tok === "{v}" ? "v" : tok === "{n}" ? "n" : ""; i += tok.length; continue; }
    if (text[i] === "\n") mode = "";
    const s = tok ?? text[i];
    items.push({ s, tok: !!tok || s === "\n", m: mode, pos: i });
    i += s.length;
  }
  const inSel = (it: Item) => !it.tok && it.pos >= start && it.pos < end;
  const chosen = items.filter(inSel);
  if (!chosen.length) return null;
  const next: "" | "v" | "n" = chosen.every((it) => it.m === want) ? "" : want;
  chosen.forEach((it) => { it.m = next; });
  // write it back; a line break or a mode change opens and closes the mode markers
  let out = "";
  let cur: "" | "v" | "n" = "";
  let ns = -1, ne = -1;
  const close = () => { if (cur) out += `{/${cur}}`; cur = ""; };
  for (const it of items) {
    if (it.s === "\n") { close(); out += "\n"; continue; }
    if (!it.tok && it.m !== cur) { close(); if (it.m) out += `{${it.m}}`; cur = it.m; }
    if (inSel(it) && ns < 0) ns = out.length;
    out += it.s;
    if (inSel(it)) ne = out.length;
  }
  close();
  return { text: out, start: ns, end: ne };
}

// Text is split into lines, rows and slides, and each row is drawn on its own. Formatting that starts
// in one row and ends in a later one (or on a later line) would be lost, so this closes what is still
// open at the end of each row and opens it again at the start of the next, in order.
export function carryFormatting(rows: string[]): string[] {
  const st: { b: boolean; i: boolean; u: boolean; c?: string; h?: string } = { b: false, i: false, u: false };
  return rows.map((row) => {
    const prefix = (st.c ? `{#${st.c}}` : "") + (st.h ? `{h#${st.h}}` : "") + (st.b ? "**" : "") + (st.i ? "~~" : "") + (st.u ? "__" : "");
    for (let k = 0; k < row.length; ) {
      const tok = row.slice(k, k + 16).match(ANY_TOKEN)?.[0];
      if (!tok) { k++; continue; }
      if (tok === "**") st.b = !st.b;
      else if (tok === "~~") st.i = !st.i;
      else if (tok === "__") st.u = !st.u;
      else if (tok === "{/}") st.c = undefined;
      else if (tok === "{/h}") st.h = undefined;
      else if (tok.startsWith("{#")) st.c = tok.slice(2, 8);
      else if (tok.startsWith("{h#")) st.h = tok.slice(3, 9);
      k += tok.length;
    }
    const suffix = (st.u ? "__" : "") + (st.i ? "~~" : "") + (st.b ? "**" : "") + (st.h ? "{/h}" : "") + (st.c ? "{/}" : "");
    return prefix + row + suffix;
  });
}

// Same as carryFormatting, across all the rows of a list of slides
export function carryFormattingSlides(slides: string[][]): string[][] {
  const flat = carryFormatting(slides.flat());
  let k = 0;
  return slides.map((s) => s.map(() => flat[k++]));
}

// Sets the text colour and/or highlight of the selected characters (null removes it, undefined leaves it).
// Every character keeps its own colours, so overlapping or earlier colours never break, and each line
// opens and closes its own markers so the text box shows every line formatted.
export function setColors(text: string, start: number, end: number, want: { c?: string | null; h?: string | null }): { text: string; start: number; end: number } | null {
  if (start === end) return null;
  type Item = { s: string; tok: boolean; c?: string; h?: string; pos: number };
  const items: Item[] = [];
  let c: string | undefined, h: string | undefined;
  for (let i = 0; i < text.length; ) {
    const tok = text.slice(i, i + 16).match(ANY_TOKEN)?.[0];
    if (tok && (tok === "{/}" || tok === "{/h}" || tok.startsWith("{#") || tok.startsWith("{h#"))) {
      if (tok === "{/}") c = undefined; else if (tok === "{/h}") h = undefined;
      else if (tok.startsWith("{#")) c = tok.slice(2, 8).toLowerCase(); else h = tok.slice(3, 9).toLowerCase();
      i += tok.length; continue;
    }
    const s = tok ?? text[i];
    items.push({ s, tok: !!tok || s === "\n", c, h, pos: i });
    i += s.length;
  }
  const inSel = (it: Item) => !it.tok && it.pos >= start && it.pos < end;
  const norm = (x?: string | null) => (x ? x.replace("#", "").toLowerCase() : x);
  items.filter(inSel).forEach((it) => {
    if (want.c !== undefined) it.c = norm(want.c) ?? undefined;
    if (want.h !== undefined) it.h = norm(want.h) ?? undefined;
  });
  let out = "";
  let oc: string | undefined, oh: string | undefined;
  let ns = -1, ne = -1;
  const closeAll = () => { if (oh) out += "{/h}"; if (oc) out += "{/}"; oh = oc = undefined; };
  for (const it of items) {
    if (it.s === "\n") { closeAll(); out += "\n"; continue; }
    if (!it.tok) {
      if (oh && oh !== it.h) { out += "{/h}"; oh = undefined; }
      if (oc && oc !== it.c) { out += "{/}"; oc = undefined; }
      if (it.c && oc !== it.c) { out += `{#${it.c}}`; oc = it.c; }
      if (it.h && oh !== it.h) { out += `{h#${it.h}}`; oh = it.h; }
    }
    if (inSel(it) && ns < 0) ns = out.length;
    out += it.s;
    if (inSel(it)) ne = out.length;
  }
  closeAll();
  return ns < 0 ? null : { text: out, start: ns, end: ne };
}

// Makes every line carry its own formatting markers (used after bold/italic/underline across lines)
export function carryLines(text: string): string {
  return carryFormatting(text.split("\n")).join("\n");
}
