import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import {
  DndContext, PointerSensor, useSensor, useSensors, pointerWithin, useDraggable, useDroppable,
  type CollisionDetection, type DragEndEvent, type DragOverEvent, type DragStartEvent,
} from "@dnd-kit/core";
import { STAGES } from "../lib/programPdf";
import { ITEMS, blockOf, groupEnd, ownerOf, subKind, type Line, type Lines } from "../lib/orderLines";

// The Order of Worship editor: stage cards, typed lines (item, sub-item, nested item), drag to reorder.
// Used by the Program page and the Program Builder page. It only edits `lines`; the parent saves them.
// Dragging uses dnd-kit (mouse, pen and touch). The move rules are in dropAt.

const uid = () => Math.random().toString(36).slice(2, 9);

type DragData = { s: number; i: number | null };

// Prefer a line under the pointer; fall back to a stage card (drop at the end of the stage)
const preferLines: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  const rows = hits.filter((h) => args.droppableContainers.find((c) => c.id === h.id)?.data.current?.i != null);
  return rows.length ? rows : hits;
};

// Is the dragged block's centre in the lower half of the line under it?
function isAfter(active: DragStartEvent["active"] | DragEndEvent["active"], over: DragOverEvent["over"] | DragEndEvent["over"]): boolean {
  const a = active.rect.current.translated ?? active.rect.current.initial;
  if (!a || !over) return false;
  return a.top + a.height / 2 > over.rect.top + over.rect.height / 2;
}

function Grip({ id, data, title, stageName, index }: { id: string; data: DragData; title: string; stageName: string; index: number }) {
  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({ id, data });
  return (
    <span
      ref={setNodeRef}
      className={`ps-grip${isDragging ? " dragging" : ""}`}
      title={title}
      aria-label={`Drag ${stageName} line ${index + 1} to reorder`}
      style={{ touchAction: "none" }}
      {...attributes}
      {...listeners}
    >⠿</span>
  );
}

export type Option = { value: string; label?: string; date?: string };   // date: ISO time, used to sort newest first

// A text box with a dropdown. Empty or unchanged text shows the whole list; typing narrows it.
// (The browser's own suggestion list only narrows to what is typed, so it can't show everything.)
function SuggestInput({ value, onChange, onBlur, onKeyDown, options, placeholder, ariaLabel }: {
  value: string;
  onChange: (v: string) => void;
  onBlur: () => void;
  onKeyDown: (e: ReactKeyboardEvent<HTMLInputElement>) => void;
  options: Option[];
  placeholder: string;
  ariaLabel: string;
}) {
  const [typed, setTyped] = useState(false);   // the user has typed since the box was opened
  const [open, setOpen] = useState(true);
  const q = typed ? value.trim().toLowerCase() : "";
  // Newest first, by date; items without a date go last
  const sorted = [...options].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
  const shown = q ? sorted.filter((o) => `${o.label ?? ""} ${o.value}`.toLowerCase().includes(q)) : sorted;
  return (
    <span className="ps-suggest-wrap">
      <input
        className="ps-edit"
        autoFocus
        value={value}
        placeholder={placeholder}
        aria-label={ariaLabel}
        onChange={(e) => { setTyped(true); setOpen(true); onChange(e.target.value); }}
        onFocus={() => setOpen(true)}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
      />
      {open && shown.length > 0 && (
        <ul className="ps-suggest-list" role="listbox" aria-label={`${ariaLabel} options`}>
          {shown.map((o) => (
            <li key={o.value + (o.label ?? "")}>
              {/* mousedown keeps the box focused, so the click reaches the option before the box closes */}
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => { onChange(o.value); setOpen(false); setTyped(false); }}
              >
                {o.label ?? o.value}
              </button>
            </li>
          ))}
        </ul>
      )}
    </span>
  );
}

function LineRow({ id, data, className, children }: { id: string; data: DragData; className: string; children: ReactNode }) {
  const { setNodeRef } = useDroppable({ id, data });
  return <div ref={setNodeRef} className={className}>{children}</div>;
}

function StageCard({ id, s, children, ...rest }: { id: string; s: number; children: ReactNode } & React.HTMLAttributes<HTMLElement>) {
  const { setNodeRef } = useDroppable({ id, data: { s, i: null } satisfies DragData });
  return <section ref={setNodeRef} className="ps-card" {...rest}>{children}</section>;
}

export default function OrderEditor({ lines, setLines, songOptions = [], passageOptions = [], personOptions = [] }: {
  lines: Lines;
  setLines: React.Dispatch<React.SetStateAction<Lines>>;
  songOptions?: Option[];
  passageOptions?: Option[];
  personOptions?: Option[];
}) {
  const [menuStage, setMenuStage] = useState<number | null>(null);   // the Add item picker
  const [openMenu, setOpenMenu] = useState<string | null>(null);     // the ⋯ menu of one line (line id)
  const [editing, setEditing] = useState<string | null>(null);       // the line being edited (line id)
  // Drag and drop: the line being dragged, and the line and side where it would land
  const dragRef = useRef<{ s: number; i: number } | null>(null);
  const [mark, setMark] = useState<{ id: string; after: boolean } | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  // Close the ⋯ menu when the user clicks anywhere else
  useEffect(() => {
    if (!openMenu) return;
    const close = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest(".ps-menu, .ps-more")) setOpenMenu(null); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [openMenu]);

  const setStage = (s: number, next: Line[]) => setLines((cur) => ({ ...cur, [s]: next }));

  function addItem(s: number, item: string) {
    const list = lines[s] ?? [];
    const sub = { id: uid(), level: 1, text: "" };
    setStage(s, [...list, { id: uid(), level: 0, text: item }, sub]);
    setMenuStage(null);
    setEditing(sub.id);
  }

  // Add a sub-item at the end of an item's group, or a nested item at the end of a sub-item's group
  function addAfterGroup(s: number, i: number, level: 1 | 2) {
    const list = lines[s] ?? [];
    let j = i + 1;
    while (j < list.length && list[j].level > list[i].level) j++;
    const line = { id: uid(), level, text: "" };
    const next = list.slice();
    next.splice(j, 0, line);
    setStage(s, next);
    setEditing(line.id);
    setOpenMenu(null);
  }

  // Drop the dragged block at line t of stage s, before or after that line.
  // Items can move between stages. Sub-items stay under their own item, and people under their own sub-item.
  function dropAt(s: number, t: number | null, after: boolean) {
    const d = dragRef.current;
    dragRef.current = null;
    setMark(null);
    if (!d) return;
    const src = lines[d.s] ?? [];
    const tgt = lines[s] ?? [];
    const [a, b] = blockOf(src, d.i);
    const level = src[d.i].level;
    let ins: number;
    if (t === null || t >= tgt.length) {
      if (level !== 0) return;               // only items can go to the end of a stage
      ins = tgt.length;
    } else if (level === 0) {
      const start = ownerOf(tgt, t);        // the item this line belongs to
      ins = after ? groupEnd(tgt, start) : start;
    } else if (level === 1) {
      if (d.s !== s) return;
      const parent = ownerOf(src, d.i);      // the item the sub-item belongs to
      if (t <= parent || t >= groupEnd(src, parent)) return;
      // A sub-item target is its own start; a person target starts at its sub-item
      const start = tgt[t].level === 1 ? t : ownerOf(tgt, t);
      ins = after ? groupEnd(tgt, start) : start;
    } else {
      if (d.s !== s) return;
      const sub = ownerOf(src, d.i);
      if (t <= sub || t >= groupEnd(src, sub)) return;
      const tStart = ownerOf(tgt, t);
      if (tgt[t].level !== 2) return;
      ins = after ? t + 1 : t;
      if (tStart !== sub) return;
    }
    if (d.s === s) {
      if (ins >= a && ins <= b) return;     // dropped onto itself
      const rest = [...src.slice(0, a), ...src.slice(b)];
      const at = ins > b ? ins - (b - a) : ins;
      setStage(s, [...rest.slice(0, at), ...src.slice(a, b), ...rest.slice(at)]);
    } else {
      const block = src.slice(a, b);
      setLines((cur) => ({
        ...cur,
        [d.s]: [...src.slice(0, a), ...src.slice(b)],
        [s]: [...tgt.slice(0, ins), ...block, ...tgt.slice(ins)],
      }));
    }
    setOpenMenu(null);
  }

  function onDragStart(e: DragStartEvent) {
    const d = e.active.data.current as DragData | undefined;
    dragRef.current = d && d.i != null ? { s: d.s, i: d.i } : null;
  }

  function onDragOver(e: DragOverEvent) {
    const over = e.over?.data.current as DragData | undefined;
    if (!e.over || !over || over.i == null) { setMark(null); return; }
    setMark({ id: String(e.over.id), after: isAfter(e.active, e.over) });
  }

  function onDragEnd(e: DragEndEvent) {
    const over = e.over?.data.current as DragData | undefined;
    if (!e.over || !over) { dragRef.current = null; setMark(null); return; }
    if (over.i == null) { dropAt(over.s, null, false); return; }
    dropAt(over.s, over.i, isAfter(e.active, e.over));
  }

  function removeLine(s: number, i: number) {
    const list = lines[s] ?? [];
    const ln = list[i];
    // Removing an item removes its sub-items and their nested items too
    let j = i + 1;
    if (ln.level === 0) while (j < list.length && list[j].level > 0) j++;
    if (ln.level === 1) while (j < list.length && list[j].level > 1) j++;
    setStage(s, [...list.slice(0, i), ...list.slice(j)]);
    setOpenMenu(null);
  }

  function onEditKey(s: number, i: number, e: ReactKeyboardEvent<HTMLInputElement>) {
    const list = lines[s] ?? [];
    const ln = list[i];
    if (e.key === "Enter") {
      e.preventDefault();
      // Enter adds the next line: a sub-item under an item, a nested item under a sub-item
      addAfterGroup(s, i, ln.level === 0 ? 1 : 2);
    } else if (e.key === "Escape") {
      setEditing(null);
    } else if (e.key === "Backspace" && ln.text === "") {
      e.preventDefault();
      removeLine(s, i);
    }
  }

  return (
    <DndContext sensors={sensors} collisionDetection={preferLines} onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd} onDragCancel={() => { dragRef.current = null; setMark(null); }}>
          <div className="ps-doc">
            {STAGES.map((stageName, s) => {
              const list = lines[s] ?? [];
              const itemAbove = (i: number) => { for (let k = i; k >= 0; k--) if (list[k].level === 0) return list[k].text; return ""; };
              return (
                <StageCard id={`stage-${s}`} s={s} key={s}>
                  <div className="ps-card-head">
                    <span className="ps-stage-name">{stageName}</span>
                  </div>
                  {list.map((ln, i) => {
                    const isEditing = editing === ln.id;
                    const kind = ln.level === 1 ? subKind(itemAbove(i)) : "text";
                    const hasChildren = ln.level === 0 ? list[i + 1]?.level === 1 : ln.level === 1 ? list[i + 1]?.level === 2 : false;
                    const menuOpen = openMenu === ln.id;
                    const markClass = mark && mark.id === ln.id ? (mark.after ? " over-after" : " over-before") : "";
                    return (
                      <LineRow
                        key={ln.id}
                        id={ln.id}
                        data={{ s, i }}
                        className={`ps-line l${ln.level}${markClass}`}
                      >
                        <Grip id={`grip-${ln.id}`} data={{ s, i }} title="Drag to move with its sub-items" stageName={stageName} index={i} />
                        {isEditing ? (() => {
                          const options: Option[] | null = ln.level === 1 ? (kind === "song" ? songOptions : kind === "scripture" ? passageOptions : null) : ln.level === 2 ? personOptions : null;
                          const placeholder = ln.level === 0 ? "Item" : ln.level === 1 ? (kind === "song" ? "Song name and number" : kind === "scripture" ? "Passage" : "What it is") : "Who is responsible";
                          const ariaLabel = `${stageName} line ${i + 1}`;
                          const onChange = (v: string) => setStage(s, list.map((x, k) => (k === i ? { ...x, text: v } : x)));
                          const onBlur = () => setEditing((cur) => (cur === ln.id ? null : cur));
                          const onKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => onEditKey(s, i, e);
                          if (options) return <SuggestInput value={ln.text} onChange={onChange} onBlur={onBlur} onKeyDown={onKeyDown} options={options} placeholder={placeholder} ariaLabel={ariaLabel} />;
                          return (
                            <input
                              className="ps-edit"
                              autoFocus
                              value={ln.text}
                              placeholder={placeholder}
                              aria-label={ariaLabel}
                              onChange={(e) => onChange(e.target.value)}
                              onBlur={onBlur}
                              onKeyDown={onKeyDown}
                            />
                          );
                        })() : (
                          <button
                            className={`ps-text${ln.text ? "" : " empty"}`}
                            onClick={() => { setEditing(ln.id); setOpenMenu(null); }}
                            aria-label={`Edit ${ln.text || "empty line"}`}
                          >
                            {ln.level === 1 && kind === "song" && ln.text ? "♪ " : ""}
                            {ln.text || (ln.level === 0 ? "Item" : ln.level === 1 ? "What it is" : "Who")}
                          </button>
                        )}

                        <button className="ps-more" aria-label="More" aria-expanded={menuOpen} onClick={() => setOpenMenu(menuOpen ? null : ln.id)}>⋯</button>
                        {menuOpen && (
                          <div className="ps-menu" role="menu">
                            {ln.level === 0 && <button onClick={() => addAfterGroup(s, i, 1)}>Add sub-item</button>}
                            {ln.level === 1 && <button onClick={() => addAfterGroup(s, i, 2)}>Add person</button>}
                            <button onClick={() => { setEditing(ln.id); setOpenMenu(null); }}>Edit</button>
                            <button className="danger" onClick={() => removeLine(s, i)}>Remove{ln.level === 0 ? " item" : ""}</button>
                          </div>
                        )}
                        {/* Empty slot: shown only when the next level is still missing */}
                        {!hasChildren && ln.level < 2 && (
                          <button className="ps-slot" onClick={() => addAfterGroup(s, i, ln.level === 0 ? 1 : 2)}>
                            {ln.level === 0 ? "+ Add sub-item" : "+ Add person"}
                          </button>
                        )}
                      </LineRow>
                    );
                  })}

                  {/* Empty slots: only when the next level is missing */}
                  {menuStage === s ? (
                    <div className="ps-picker">
                      <div className="ps-picker-title">Choose an item</div>
                      {ITEMS.map((n) => <button key={n} className="ps-cat" onClick={() => addItem(s, n)}>{n}</button>)}
                      <div className="ps-picker-foot"><button onClick={() => setMenuStage(null)}>Cancel</button></div>
                    </div>
                  ) : (
                    <button className="ps-add" onClick={() => setMenuStage(s)}>+ Add item</button>
                  )}
                </StageCard>
              );
            })}
          </div>
    </DndContext>
  );
}
