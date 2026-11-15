// The Order of Worship as typed lines (item, sub-item, nested item), and how they become PDF rows.
// Shared by the Program page and the Program Builder page.
import { STAGES } from "./programPdf";
import type { Row } from "../pages/Program";

export interface Line { id: string; level: number; text: string }
export type Lines = Record<number, Line[]>;

export const ITEMS = [
  "Prelude", "Welcome & Call to Worship", "Opening Song", "Opening Prayer", "Songs of Praise", "Children Choir",
  "Youth Choir", "Prayer for the Offering", "Offering", "Announcements", "Sok Nh'hor", "Scripture Reading", "Reading",
  "Message", "Response & Prayer", "Closing Song", "Closing Prayer",
];
export const emptyLines = (): Lines => Object.fromEntries(STAGES.map((_, s) => [s, [] as Line[]]));

// Drag helpers. An item moves with its sub-items and their people; a sub-item moves with its people.
// The line that owns line i: its item for a sub-item, its sub-item for a person (itself for an item).
export function ownerOf(list: Line[], i: number): number {
  const target = list[i].level - 1;
  let k = i;
  while (k > 0 && list[k].level > target && target >= 0) k--;
  return k;
}
// The first line after a group: the next line at the same or a higher level
export function groupEnd(list: Line[], start: number): number {
  let j = start + 1;
  while (j < list.length && list[j].level > list[start].level) j++;
  return j;
}
// The block a line moves with: an item and its sub-items, a sub-item and its people, or a person alone
export function blockOf(list: Line[], i: number): [number, number] {
  return [i, groupEnd(list, i)];
}

// What kind of sub-item an item takes: songs, passages, or free text
export function subKind(item: string): "song" | "scripture" | "reading" | "text" {
  if (/scripture/i.test(item)) return "scripture";
  if (/^reading$/i.test(item.trim())) return "reading";
  if (/song|praise|choir/i.test(item)) return "song";
  return "text";
}

// Lines → rows for the PDF builder: item line, then its sub-items and nested sub-items beneath it
export function toRows(lines: Lines, passages: Record<string, string>): Row[] {
  const rows: Row[] = [];
  STAGES.forEach((_, s) => {
    let cur: Row | null = null;
    (lines[s] ?? []).forEach((ln) => {
      const text = ln.text.trim();
      if (!text) return;
      if (ln.level === 0 || !cur) {
        cur = { id: ln.id, item: text, kind: "custom", detail: "", led: "", text: "", names: [], stage: s, lines: [] };
        rows.push(cur);
        return;
      }
      cur.lines = [...(cur.lines ?? []), { text, level: ln.level }];
    });
  });
  rows.forEach((r) => {
    if (subKind(r.item) === "scripture" && r.lines?.length) {
      r.kind = "scripture";
      r.ref = r.lines[0].text;
      r.text = passages[r.ref] ?? "";
    }
  });
  return rows;
}

// Program rows (the older editor's format) → lines, so existing services keep their order when they open here
export function rowsToLines(rows: Row[]): Lines {
  const out: Lines = emptyLines();
  const id = () => Math.random().toString(36).slice(2, 9);
  for (const r of rows) {
    if (!r.item.trim()) continue;
    const s = Math.min(Math.max(r.stage ?? 0, 0), STAGES.length - 1);
    out[s].push({ id: id(), level: 0, text: r.item });
    if (r.kind === "scripture" && r.detail.trim()) out[s].push({ id: id(), level: 1, text: r.detail.trim() });
    else if (r.detail.trim()) out[s].push({ id: id(), level: 1, text: r.detail.trim() });
    if (r.led.trim()) out[s].push({ id: id(), level: 2, text: r.led.trim() });
    for (const n of r.names.filter((x) => x.trim())) out[s].push({ id: id(), level: 2, text: n.trim() });
  }
  return out;
}
