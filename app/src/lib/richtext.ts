// Selected-text formatting for slide text. Markers stay in the text as typed:
//   **bold**   ~~italic~~   __underline__   {#rrggbb}coloured{/}
// Only the text between a pair of markers is formatted. Markers can be combined.

export type RichSeg = { text: string; bold?: boolean; italic?: boolean; underline?: boolean; color?: string; highlight?: string };
export type RichPiece = { text: string; token: boolean; bold?: boolean; italic?: boolean; underline?: boolean; color?: string; highlight?: string };

export const RICH_TOKENS: Record<string, "bold" | "italic" | "underline"> = { "**": "bold", "~~": "italic", "__": "underline" };
const COLOR_OPEN = /^\{#([0-9a-fA-F]{6})\}/;
const COLOR_CLOSE = "{/}";
const HIGHLIGHT_OPEN = /^\{h#([0-9a-fA-F]{6})\}/;
const HIGHLIGHT_CLOSE = "{/h}";

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
  return text.replace(/\*\*|~~|__|\{#[0-9a-fA-F]{6}\}|\{\/\}|\{h#[0-9a-fA-F]{6}\}|\{\/h\}/g, "");
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
