import { isIgnoredMarker, labelOf } from "../lib/slides";
import { parseRich } from "../lib/richtext";

// Lyrics for reading: sections with their labels, using the same label rules as the slides
// ([Verse 1], Verse 2, Chorus, v1, c2, bridge 1…). Formatting marks (bold, colours) are removed.

export interface Section { label: string; chorus: boolean; lines: string[] }

const LABEL_NAMES: Record<string, string> = { V: "Verse", B: "Bridge", PC: "Pre-chorus", I: "Intro", O: "Outro", T: "Tag", E: "Ending" };

// "V1" → "Verse 1", "B" → "Bridge", "Chorus" stays "Chorus"
export function labelName(short: string): string {
  if (short === "Chorus") return "Chorus";
  const m = short.match(/^([A-Z]+)(\d*)$/);
  if (!m) return short;
  const word = LABEL_NAMES[m[1]] ?? m[1];
  return m[2] ? `${word} ${m[2]}` : word;
}

const plain = (line: string) => parseRich(line).map((s) => s.text).join("");

// A blank line or a label starts a new section. "Plõ mpro" markers only separate verses and are not shown.
export function toSections(lyrics: string): Section[] {
  const out: Section[] = [];
  let cur: Section | null = null;
  const finish = () => {
    if (cur && cur.lines.length) out.push(cur);
    cur = null;
  };
  for (const raw of lyrics.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trim();
    if (!line || isIgnoredMarker(line)) { finish(); continue; }
    const lab = labelOf(line);
    if (lab) {
      finish();
      cur = { label: labelName(lab), chorus: lab === "Chorus", lines: [] };
      continue;
    }
    const text = plain(line).trim();
    if (!text) continue;
    if (!cur) cur = { label: "", chorus: false, lines: [] };
    (cur as Section).lines.push(text);
  }
  finish();
  return out;
}

// Search that ignores accents and case, so "gap tam" finds "GÂP TÂM" and "yesu" finds "Yê-Su"
export function fold(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "").replace(/[đĐ]/g, "d").toLowerCase().replace(/[-–—]/g, " ").replace(/\s+/g, " ").trim();
}
