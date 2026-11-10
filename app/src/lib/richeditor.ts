// Helpers for the formatted text editor. The stored text keeps its markers (see richtext.ts);
// the editor shows the formatting and hides the markers. Offsets are counted two ways:
//   marker offset  = position in the stored text (with markers)
//   visible offset = position in what the user sees (without markers)

const TOKEN_RE = /^(\*\*|~~|__|\{#[0-9a-fA-F]{6}\}|\{\/\}|\{h#[0-9a-fA-F]{6}\}|\{\/h\}|\{\/?[vn]\})/;

export type Fmt = { b: boolean; i: boolean; u: boolean; c?: string; h?: string; v?: boolean; n?: boolean };
export const NO_FMT: Fmt = { b: false, i: false, u: false };

// Length of the marker token starting at index i (0 if there is none)
export function tokenLenAt(s: string, i: number): number {
  const m = s.slice(i, i + 16).match(TOKEN_RE);
  return m ? m[0].length : 0;
}

// Stored text -> visible text (markers removed)
export function visibleText(s: string): string {
  let out = "";
  for (let i = 0; i < s.length; ) {
    const t = tokenLenAt(s, i);
    if (t) { i += t; continue; }
    out += s[i];
    i++;
  }
  return out;
}

// Visible offset -> marker offset (the position just before that visible character)
export function visibleToMarker(s: string, v: number): number {
  let seen = 0;
  for (let i = 0; i < s.length; ) {
    if (seen >= v) return i;
    const t = tokenLenAt(s, i);
    if (t) { i += t; continue; }
    seen++;
    i++;
  }
  return s.length;
}

// Marker offset -> visible offset
export function markerToVisible(s: string, m: number): number {
  let seen = 0;
  for (let i = 0; i < Math.min(m, s.length); ) {
    const t = tokenLenAt(s, i);
    if (t) { i += t; continue; }
    seen++;
    i++;
  }
  return seen;
}

// The formatting in effect at a marker offset
export function fmtAt(s: string, m: number): Fmt {
  const f: Fmt = { b: false, i: false, u: false };
  for (let i = 0; i < Math.min(m, s.length); ) {
    const t = tokenLenAt(s, i);
    if (!t) { i++; continue; }
    const tok = s.slice(i, i + t);
    if (tok === "**") f.b = !f.b;
    else if (tok === "~~") f.i = !f.i;
    else if (tok === "__") f.u = !f.u;
    else if (tok === "{/}") f.c = undefined;
    else if (tok === "{/h}") f.h = undefined;
    else if (tok === "{v}") { f.v = true; f.n = false; }
    else if (tok === "{n}") { f.n = true; f.v = false; }
    else if (tok === "{/v}") f.v = false;
    else if (tok === "{/n}") f.n = false;
    else if (tok.startsWith("{#")) f.c = tok.slice(2, 8).replace(/^/, "#");
    else if (tok.startsWith("{h#")) f.h = tok.slice(3, 9).replace(/^/, "#");
    i += t;
  }
  return f;
}

// A verse number: 1 to 3 digits, at the start or after a space or punctuation, followed by a space
export const VERSE_RE = /(^|[\s.;:!?,])(\d{1,3})(?=\s)/g;
const VERSE_RE_HTML = /(^|[\s.;:!?,])(\d{1,3})(?=\s)/g;

// HTML for the editor: each line is a block, each run of formatted text is a span
export function editorHtml(s: string, numbers = true): string {
  const esc = (x: string) => x.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return s.split("\n").map((line) => {
    if (!line) return "<div><br></div>";
    // parse the line into runs of (text, formatting)
    const runs: { text: string; f: Fmt }[] = [];
    let f: Fmt = { b: false, i: false, u: false };
    let buf = "";
    const push = () => { if (buf) { runs.push({ text: buf, f: { ...f } }); buf = ""; } };
    for (let i = 0; i < line.length; ) {
      const t = tokenLenAt(line, i);
      if (!t) { buf += line[i]; i++; continue; }
      push();
      const tok = line.slice(i, i + t);
      if (tok === "**") f.b = !f.b;
      else if (tok === "~~") f.i = !f.i;
      else if (tok === "__") f.u = !f.u;
      else if (tok === "{/}") f.c = undefined;
      else if (tok === "{/h}") f.h = undefined;
      else if (tok === "{v}") { f.v = true; f.n = false; }
      else if (tok === "{n}") { f.n = true; f.v = false; }
      else if (tok === "{/v}") f.v = false;
      else if (tok === "{/n}") f.n = false;
      else if (tok.startsWith("{#")) f.c = `#${tok.slice(2, 8)}`;
      else if (tok.startsWith("{h#")) f.h = `#${tok.slice(3, 9)}`;
      i += t;
    }
    push();
    // the verse number at the start of a line gets its own style (it is still plain text)
    const html = runs.map((r) => {
      const attrs = [r.f.b ? 'data-b="1"' : "", r.f.i ? 'data-i="1"' : "", r.f.u ? 'data-u="1"' : "", r.f.c ? `data-c="${r.f.c}"` : "", r.f.h ? `data-h="${r.f.h}"` : "", r.f.v ? 'data-v="1"' : "", r.f.n ? 'data-n="1"' : ""].filter(Boolean).join(" ");
      const style = [r.f.b ? "font-weight:700" : "", r.f.i ? "font-style:italic" : "", r.f.u ? "text-decoration:underline" : "", r.f.c ? `color:${r.f.c}` : "", r.f.h ? `background:${r.f.h}` : ""].filter(Boolean).join(";");
      // Verse numbers (a number followed by a space, at the start or after a space or punctuation) are styled
      // {v} text is drawn like a verse number; {n} text never is
      if (r.f.v) return `<span ${attrs} class="vtb-num" style="${style}">${esc(r.text)}</span>`;
      const body = r.f.n || !numbers ? esc(r.text) : esc(r.text).replace(VERSE_RE_HTML, (_m, lead: string, num: string) => `${lead}<span class="vtb-num">${num}</span>`);
      return `<span ${attrs} style="${style}">${body}</span>`;
    }).join("");
    return `<div>${html || "<br>"}</div>`;
  }).join("");
}

// Editor -> stored text: reads the formatting from each span and writes the markers back
export function editorToText(root: HTMLElement): string {
  const lines = Array.from(root.children);
  if (!lines.length) return root.textContent ?? "";
  return lines.map((div) => {
    let out = "";
    let open: Fmt = { b: false, i: false, u: false };
    let mode = "";
    const walk = (node: Node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        const txt = node.textContent ?? "";
        if (!txt) return;
        const el = node.parentElement;
        const want: Fmt = {
          b: !!el?.dataset.b, i: !!el?.dataset.i, u: !!el?.dataset.u,
          c: el?.dataset.c || undefined, h: el?.dataset.h || undefined,
        };
        // the verse mode can sit on the span itself or on its parent (the auto verse-number span is inside)
        const host = el?.closest("[data-v],[data-n]") as HTMLElement | null;
        const wantMode = host && root.contains(host) ? (host.dataset.v ? "v" : "n") : "";
        if (mode !== wantMode) { if (mode) out += `{/${mode}}`; if (wantMode) out += `{${wantMode}}`; mode = wantMode; }
        // close what turns off, then open what turns on
        if (open.h && open.h !== want.h) { out += "{/h}"; open.h = undefined; }
        if (open.c && open.c !== want.c) { out += "{/}"; open.c = undefined; }
        if (open.u !== want.u) { out += "__"; open.u = want.u; }
        if (open.i !== want.i) { out += "~~"; open.i = want.i; }
        if (open.b !== want.b) { out += "**"; open.b = want.b; }
        if (want.c && open.c !== want.c) { out += `{${want.c.replace("#", "#")}}`; open.c = want.c; }
        if (want.h && open.h !== want.h) { out += `{h${want.h}}`; open.h = want.h; }
        out += txt;
        return;
      }
      if (node.nodeName === "BR") return;
      node.childNodes.forEach(walk);
    };
    div.childNodes.forEach(walk);
    // close everything at the end of the line
    if (open.h) out += "{/h}";
    if (open.c) out += "{/}";
    if (open.u) out += "__";
    if (open.i) out += "~~";
    if (open.b) out += "**";
    if (mode) out += `{/${mode}}`;
    return out;
  }).join("\n");
}

// Adds a space after every verse number in pasted text: "5Nau" -> "5 Nau", "55Nau" -> "55 Nau"
export function spaceVerseNumbers(text: string): string {
  // A number of 1 to 3 digits that starts a line or follows a space or punctuation, and is followed by a letter
  return text.replace(/(^|[\s.;:!?,])(\d{1,3})(?=\p{L})/gmu, "$1$2 ");
}
