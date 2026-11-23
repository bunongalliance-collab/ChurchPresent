import { Fragment, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { DndContext, PointerSensor, KeyboardSensor, useSensor, useSensors, closestCenter, useDraggable, useDroppable, type DragEndEvent } from "@dnd-kit/core";
import { STAGES } from "../lib/programPdf";
import { ITEMS, groupEnd, subKind, type Line, type Lines } from "../lib/orderLines";
// A suggestion: date sorts newest first; id is the saved song, reading or study; recent puts it under "Recent"
export type Option = { value: string; label?: string; date?: string; id?: string; recent?: boolean };

// The Order of Worship as a table on the Program page: Item · Song, passage or reading · Who · ⋯
// It edits the order lines (level 0 item, level 1 sub-item, level 2 people under a sub-item), so the
// PDF, publishing and Service Slides read them unchanged. Items drag to reorder (also between stages); sub-items
// move with Move up / Move down in the row's menu.

const uid = () => Math.random().toString(36).slice(2, 9);
type Kind = ReturnType<typeof subKind>;
const field = { song: "songId", reading: "readingId", scripture: "studyId" } as const;

// One row of the table: an item with no sub-items yet, or one sub-item of an item
interface TRow { s: number; item: number; sub: number | null; first: boolean; people: number[] }

function rowsOf(s: number, list: Line[]): TRow[] {
  const out: TRow[] = [];
  for (let i = 0; i < list.length; i++) {
    if (list[i].level !== 0) continue;
    const end = groupEnd(list, i);
    const subs: number[] = [];
    for (let k = i + 1; k < end; k++) if (list[k].level === 1) subs.push(k);
    if (!subs.length) { out.push({ s, item: i, sub: null, first: true, people: [] }); continue; }
    subs.forEach((k, n) => {
      const people: number[] = [];
      for (let m = k + 1; m < end && list[m].level > 1; m++) people.push(m);
      out.push({ s, item: i, sub: k, first: n === 0, people });
    });
  }
  return out;
}

// A text cell with suggestions that open on focus (songs, passages, readings, names). Typing narrows the list.
function Cell({ value, onChange, onPick, options, placeholder, label, groups }: {
  value: string; onChange: (v: string) => void; onPick?: (o: Option) => void; options?: Option[];
  placeholder: string; label: string; groups?: [string, string];
}) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState(false);
  const [hi, setHi] = useState(-1);
  const q = typed ? value.trim().toLowerCase() : "";
  const sorted = options ? [...options.filter((o) => o.recent), ...options.filter((o) => !o.recent).sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))] : [];
  const shown = (q ? sorted.filter((o) => `${o.label ?? ""} ${o.value}`.toLowerCase().includes(q)) : sorted).slice(0, 60);
  const hasRecent = shown.some((o) => o.recent);
  const pick = (o: Option) => { (onPick ?? ((x: Option) => onChange(x.value)))(o); setOpen(false); setTyped(false); setHi(-1); };
  const onKey = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (!open || !shown.length) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => Math.min(shown.length - 1, h + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(0, h - 1)); }
    else if (e.key === "Enter" && hi >= 0) { e.preventDefault(); pick(shown[hi]); }
    else if (e.key === "Escape") setOpen(false);
  };
  return (
    <span className="ot-cellwrap">
      <input className="ot-cell" value={value} placeholder={placeholder} aria-label={label}
        role={options ? "combobox" : undefined} aria-expanded={options ? open && shown.length > 0 : undefined} aria-autocomplete={options ? "list" : undefined}
        onFocus={() => setOpen(true)} onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        onChange={(e) => { setTyped(true); setOpen(true); setHi(-1); onChange(e.target.value); }} onKeyDown={onKey} />
      {options && open && shown.length > 0 && (
        <ul className="ot-list" role="listbox" aria-label={`${label} choices`}>
          {shown.map((o, n) => (
            <Fragment key={(o.id ?? "") + o.value + n}>
              {hasRecent && groups && (n === 0 || !!shown[n - 1].recent !== !!o.recent) && <li className="ot-list-group" aria-hidden="true">{o.recent ? groups[0] : groups[1]}</li>}
              <li role="option" aria-selected={n === hi}>
                <button type="button" className={n === hi ? "hi" : ""} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(o)}>{o.label ?? o.value}</button>
              </li>
            </Fragment>
          ))}
        </ul>
      )}
    </span>
  );
}

function ItemRow({ id, data, className, children }: { id: string; data: { s: number; i: number }; className: string; children: ReactNode }) {
  const drop = useDroppable({ id: `drop-${id}`, data });
  return <div ref={drop.setNodeRef} className={`${className}${drop.isOver ? " over" : ""}`} role="row">{children}</div>;
}
function Grip({ id, data, label }: { id: string; data: { s: number; i: number }; label: string }) {
  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({ id: `drag-${id}`, data });
  return (
    <button type="button" ref={setNodeRef} className={`ot-grip${isDragging ? " dragging" : ""}`} aria-label={label} style={{ touchAction: "none" }} {...attributes} {...listeners}>
      <svg viewBox="0 0 10 16" aria-hidden="true"><circle cx="2" cy="2" r="1.5" /><circle cx="8" cy="2" r="1.5" /><circle cx="2" cy="8" r="1.5" /><circle cx="8" cy="8" r="1.5" /><circle cx="2" cy="14" r="1.5" /><circle cx="8" cy="14" r="1.5" /></svg>
    </button>
  );
}
function StageEnd({ s, children }: { s: number; children: ReactNode }) {
  const drop = useDroppable({ id: `stage-end-${s}`, data: { s, i: -1 } });
  return <div ref={drop.setNodeRef} className={`ot-add${drop.isOver ? " over" : ""}`}>{children}</div>;
}

export default function OrderTable({ lines, setLines, songOptions = [], passageOptions = [], readingOptions = [], personOptions = [] }: {
  lines: Lines; setLines: React.Dispatch<React.SetStateAction<Lines>>;
  songOptions?: Option[]; passageOptions?: Option[]; readingOptions?: Option[]; personOptions?: Option[];
}) {
  const [menu, setMenu] = useState<string | null>(null);        // the open ⋯ menu (row key)
  const [adding, setAdding] = useState<number | null>(null);    // the stage whose Add item picker is open
  const [focusId, setFocusId] = useState<string | null>(null);  // a new line to focus
  const root = useRef<HTMLDivElement>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor));

  useEffect(() => {
    if (!menu && adding === null) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !(e.target as Element).closest(".ot-menu, .ot-more, .ot-picker, .ot-addbtn")) { setMenu(null); setAdding(null); }
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", close); };
  }, [menu, adding]);
  useEffect(() => {
    if (!focusId) return;
    root.current?.querySelector<HTMLInputElement>(`[data-line="${focusId}"] input`)?.focus();
    setFocusId(null);
  }, [focusId, lines]);

  const setStage = (s: number, next: Line[]) => setLines((cur) => ({ ...cur, [s]: next }));
  const list = (s: number) => lines[s] ?? [];
  const edit = (s: number, i: number, patch: Partial<Line>) => setStage(s, list(s).map((x, k) => (k === i ? { ...x, ...patch } : x)));

  // Song, passage or reading cell. Typing clears the link to a saved song; picking sets it.
  function setSub(r: TRow, text: string, link?: { kind: Kind; id?: string }) {
    const l = list(r.s);
    const linkPatch = { songId: undefined, readingId: undefined, studyId: undefined, ...(link?.id && link.kind !== "text" ? { [field[link.kind]]: link.id } : {}) };
    if (r.sub !== null) { edit(r.s, r.sub, { text, ...linkPatch }); return; }
    const next = l.slice();
    next.splice(r.item + 1, 0, { id: uid(), level: 1, text, ...linkPatch });
    setStage(r.s, next);
  }
  // Who: names separated by commas, kept as one line each under the sub-item
  function setWho(r: TRow, value: string) {
    const l = list(r.s).slice();
    let sub = r.sub;
    if (sub === null) { l.splice(r.item + 1, 0, { id: uid(), level: 1, text: "" }); sub = r.item + 1; }
    const end = groupEnd(l, sub);
    const old = l.slice(sub + 1, end);
    const names = value.split(",");
    const people = names.map((n, k) => ({ id: old[k]?.id ?? uid(), level: 2, text: k < names.length - 1 ? n.trim() : n.replace(/^\s+/, "") }));
    const keep = value.trim() ? people : [];
    setStage(r.s, [...l.slice(0, sub + 1), ...keep, ...l.slice(end)]);
  }
  function addSub(r: TRow) {
    const l = list(r.s);
    const end = groupEnd(l, r.item);
    const line = { id: uid(), level: 1, text: "" };
    setStage(r.s, [...l.slice(0, end), line, ...l.slice(end)]);
    setFocusId(line.id);
    setMenu(null);
  }
  function removeRow(r: TRow) {
    const l = list(r.s);
    const [a, b] = r.first && (r.sub === null || rowsOf(r.s, l).filter((x) => x.item === r.item).length === 1) ? [r.item, groupEnd(l, r.item)] : [r.sub!, groupEnd(l, r.sub!)];
    setStage(r.s, [...l.slice(0, a), ...l.slice(b)]);
    setMenu(null);
  }
  const removeItem = (r: TRow) => { const l = list(r.s); setStage(r.s, [...l.slice(0, r.item), ...l.slice(groupEnd(l, r.item))]); setMenu(null); };
  // Move a sub-item (with its people) above or below its neighbour within the same item
  function moveSub(r: TRow, dir: -1 | 1) {
    if (r.sub === null) return;
    const l = list(r.s);
    const subs = rowsOf(r.s, l).filter((x) => x.item === r.item && x.sub !== null).map((x) => x.sub!);
    const at = subs.indexOf(r.sub);
    const other = subs[at + dir];
    if (other === undefined) return;
    const [a1, b1] = [Math.min(r.sub, other), groupEnd(l, Math.min(r.sub, other))];
    const [a2, b2] = [Math.max(r.sub, other), groupEnd(l, Math.max(r.sub, other))];
    setStage(r.s, [...l.slice(0, a1), ...l.slice(a2, b2), ...l.slice(b1, a2), ...l.slice(a1, b1), ...l.slice(b2)]);
    setMenu(null);
  }
  // Move an item (with everything under it) one place up or down; at the edge of a stage it moves to the next stage
  function moveItem(r: TRow, dir: -1 | 1) {
    const l = list(r.s);
    const block = l.slice(r.item, groupEnd(l, r.item));
    const rest = [...l.slice(0, r.item), ...l.slice(groupEnd(l, r.item))];
    const starts = rest.map((x, k) => (x.level === 0 ? k : -1)).filter((k) => k >= 0);
    const pos = starts.filter((k) => k < r.item).length;   // this item's index among the items
    const target = pos + dir;
    if (target < 0 || target > starts.length) {
      const s2 = r.s + dir;
      if (s2 < 0 || s2 >= STAGES.length) return;
      const t = list(s2);
      setLines((cur) => ({ ...cur, [r.s]: rest, [s2]: dir < 0 ? [...t, ...block] : [...block, ...t] }));
    } else {
      const at = target >= starts.length ? rest.length : starts[target];
      const ins = dir > 0 && target < starts.length ? groupEnd(rest, starts[target]) : at;
      setStage(r.s, [...rest.slice(0, ins), ...block, ...rest.slice(ins)]);
    }
    setMenu(null);
  }
  function addItem(s: number, name: string) {
    const item = { id: uid(), level: 0, text: name };
    setStage(s, [...list(s), item]);
    setAdding(null);
    setFocusId(item.id);
  }
  function onDragEnd(e: DragEndEvent) {
    const from = e.active.data.current as { s: number; i: number } | undefined;
    const to = e.over?.data.current as { s: number; i: number } | undefined;
    if (!from || !to || (from.s === to.s && from.i === to.i)) return;
    const src = list(from.s);
    const block = src.slice(from.i, groupEnd(src, from.i));
    setLines((cur) => {
      const next = { ...cur, [from.s]: [...src.slice(0, from.i), ...src.slice(groupEnd(src, from.i))] };
      const tgt = next[to.s] ?? [];
      let at = to.i < 0 ? tgt.length : to.i;
      if (to.i >= 0 && from.s === to.s && to.i > from.i) at = groupEnd(src, to.i) - block.length;   // dropping lower: after that item
      return { ...next, [to.s]: [...tgt.slice(0, at), ...block, ...tgt.slice(at)] };
    });
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <div className="ot" ref={root} role="table" aria-label="Order of worship">
        <div className="ot-head" role="row">
          <span role="columnheader"><span className="ot-sr">Move</span></span>
          <span role="columnheader">Item</span>
          <span role="columnheader">Song, passage or reading</span>
          <span role="columnheader">Who</span>
          <span role="columnheader"><span className="ot-sr">More</span></span>
        </div>
        {STAGES.map((stage, s) => {
          const l = list(s);
          const rows = rowsOf(s, l);
          const stageName = stage.charAt(0) + stage.slice(1).toLowerCase();
          return (
            <div className="ot-stage" key={s} role="rowgroup" aria-label={stageName}>
              <div className="ot-stage-name" role="row"><span role="cell">{stageName}</span></div>
              {rows.map((r) => {
                const item = l[r.item];
                const sub = r.sub !== null ? l[r.sub] : null;
                const kind = subKind(item.text);
                const key = sub ? sub.id : item.id;
                const opts = kind === "song" ? songOptions : kind === "scripture" ? passageOptions : kind === "reading" ? readingOptions : undefined;
                const groups: [string, string] | undefined = kind === "song" ? ["Recent songs", "All songs"] : kind === "scripture" ? ["Recent scriptures", "All scriptures"] : kind === "reading" ? ["Recent readings", "All readings"] : undefined;
                const subPh = kind === "song" ? "Choose a song" : kind === "scripture" ? "Choose a passage" : kind === "reading" ? "Choose a reading" : "Details (optional)";
                const who = r.people.map((k) => l[k].text).join(", ");
                const siblings = rows.filter((x) => x.item === r.item && x.sub !== null);
                const subAt = r.sub !== null ? siblings.findIndex((x) => x.sub === r.sub) : -1;
                return (
                  <ItemRow key={key} id={item.id + (r.first ? "" : key)} data={{ s, i: r.item }} className={`ot-row${r.first ? " first" : " more-row"}`}>
                    <span role="cell" className="ot-gripcell">{r.first && <Grip id={item.id} data={{ s, i: r.item }} label={`Drag ${item.text || "item"} to move it`} />}</span>
                    <span role="cell" data-line={item.id}>
                      {r.first
                        ? <input className="ot-cell ot-item" value={item.text} placeholder="Item name" aria-label={`Item in ${stageName}`} onChange={(e) => edit(s, r.item, { text: e.target.value })} />
                        : <span className="ot-cont" aria-hidden="true">↳</span>}
                    </span>
                    <span role="cell" data-line={sub?.id}>
                      <Cell value={sub?.text ?? ""} placeholder={subPh} label={`${item.text || "Item"}: song, passage or reading`} options={opts} groups={groups}
                        onChange={(v) => setSub(r, v)} onPick={(o) => setSub(r, o.value, { kind, id: o.id })} />
                    </span>
                    <span role="cell">
                      <Cell value={who} placeholder="Who" label={`${item.text || "Item"}: who leads`} options={personOptions}
                        onChange={(v) => setWho(r, v)} onPick={(o) => { const parts = who.split(","); parts[parts.length - 1] = parts.length > 1 ? ` ${o.value}` : o.value; setWho(r, parts.join(",")); }} />
                    </span>
                    <span role="cell" className="ot-morecell">
                      <button type="button" className="ot-more" aria-label={`More for ${item.text || "this item"}`} aria-haspopup="menu" aria-expanded={menu === key} onClick={() => setMenu(menu === key ? null : key)}>⋯</button>
                      {menu === key && (
                        <div className="ot-menu" role="menu">
                          <button role="menuitem" onClick={() => addSub(r)}>{kind === "song" ? "Add another song" : kind === "scripture" ? "Add another passage" : kind === "reading" ? "Add another reading" : "Add another line"}</button>
                          {r.first && <button role="menuitem" onClick={() => moveItem(r, -1)}>Move item up</button>}
                          {r.first && <button role="menuitem" onClick={() => moveItem(r, 1)}>Move item down</button>}
                          {!r.first && subAt > 0 && <button role="menuitem" onClick={() => moveSub(r, -1)}>Move this line up</button>}
                          {r.sub !== null && subAt < siblings.length - 1 && subAt >= 0 && <button role="menuitem" onClick={() => moveSub(r, 1)}>Move this line down</button>}
                          {r.sub !== null && siblings.length > 1 && <button role="menuitem" className="danger" onClick={() => removeRow(r)}>Remove this line</button>}
                          <button role="menuitem" className="danger" onClick={() => removeItem(r)}>Remove {item.text || "item"}</button>
                        </div>
                      )}
                    </span>
                  </ItemRow>
                );
              })}
              <StageEnd s={s}>
                <button type="button" className="ot-addbtn" aria-expanded={adding === s} onClick={() => setAdding(adding === s ? null : s)}>+ Add an item</button>
                {adding === s && (
                  <div className="ot-picker" role="menu" aria-label={`Add an item to ${stageName}`}>
                    {ITEMS.map((n) => <button key={n} role="menuitem" onClick={() => addItem(s, n)}>{n}</button>)}
                    <button role="menuitem" className="ot-other" onClick={() => addItem(s, "")}>Something else…</button>
                  </div>
                )}
              </StageEnd>
            </div>
          );
        })}
      </div>
    </DndContext>
  );
}
