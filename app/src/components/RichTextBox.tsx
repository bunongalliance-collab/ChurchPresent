import { useEffect, useLayoutEffect, useRef } from "react";
import { editorHtml, editorToText, markerToVisible, spaceVerseNumbers, visibleToMarker } from "../lib/richeditor";

// The formatted text box: type or paste, select text to format it. Formatting markers are hidden
// (the text shows as formatted), the same box the Scripture page uses.
// Selection helpers for the formatted editor (offsets are visible-text offsets)
function blockOf(el: HTMLElement, node: Node): Node {
  let n: Node = node;
  while (n.parentNode && n.parentNode !== el) n = n.parentNode;
  return n;
}
function visibleOffset(el: HTMLElement, node: Node, off: number): number {
  if (node === el) {
    return Array.from(el.children).slice(0, off).reduce((v, d) => v + (d.textContent ?? "").length + 1, 0);
  }
  const block = blockOf(el, node);
  let v = 0;
  for (const d of Array.from(el.children)) {
    if (d === block) break;
    v += (d.textContent ?? "").length + 1;
  }
  const r = document.createRange();
  r.setStart(block, 0);
  r.setEnd(node, off);
  return v + r.toString().length;
}
function locate(el: HTMLElement, v: number): { node: Node; off: number } {
  let rest = v;
  const blocks = Array.from(el.children);
  for (const d of blocks) {
    const len = (d.textContent ?? "").length;
    if (rest <= len) {
      const w = document.createTreeWalker(d, NodeFilter.SHOW_TEXT);
      let n = w.nextNode();
      let r = rest;
      while (n) {
        const tl = n.textContent?.length ?? 0;
        if (r <= tl) return { node: n, off: r };
        r -= tl;
        n = w.nextNode();
      }
      return { node: d, off: d.childNodes.length };
    }
    rest -= len + 1;
  }
  const last = blocks[blocks.length - 1];
  return last ? { node: last, off: last.childNodes.length } : { node: el, off: 0 };
}
// Puts the caret or selection back at the given stored-text offsets after a formatting change
export function setTextSelection(el: HTMLElement, text: string, start: number, end: number) {
  const a = locate(el, markerToVisible(text, start));
  const b = locate(el, markerToVisible(text, end));
  const r = document.createRange();
  r.setStart(a.node, a.off);
  r.setEnd(b.node, b.off);
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(r);
}

// The formatted text editor. It shows the formatting and hides the markers; the stored text keeps them.
export function VerseTextBox({ id, value, onChange, onSelect, numbers = true }: { id: string; value: string; onChange: (v: string) => void; onSelect: (start: number, end: number) => void; numbers?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const last = useRef<string>("\u0000");
  // Undo/redo history for this text box (typing and every formatting change). Typing within
  // a short pause is one step. Formatting replaces the box's HTML, so the browser's own undo can't be used.
  const hist = useRef<{ past: string[]; future: string[]; cur: string; at: number }>({ past: [], future: [], cur: value, at: 0 });
  useEffect(() => {
    const h = hist.current;
    if (value === h.cur) return;
    const now = Date.now();
    const typing = value === last.current && now - h.at < 800 && h.past.length > 0;
    if (!typing) { h.past.push(h.cur); if (h.past.length > 200) h.past.shift(); }
    h.future = [];
    h.cur = value;
    h.at = value === last.current ? now : 0;
  }, [value]);
  const step = (back: boolean) => {
    const h = hist.current;
    const from = back ? h.past : h.future;
    const to = back ? h.future : h.past;
    const v = from.pop();
    if (v === undefined) return;
    to.push(h.cur);
    h.cur = v;
    h.at = 0;
    onChange(v);
  };
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && value !== last.current) {
      el.innerHTML = editorHtml(value, numbers);
      last.current = value;
    }
  }, [value]);
  useEffect(() => {
    const onSel = () => {
      const el = ref.current;
      const sel = window.getSelection();
      if (!el || !sel || sel.rangeCount === 0 || !sel.anchorNode || !el.contains(sel.anchorNode)) return;
      const a = visibleOffset(el, sel.anchorNode, sel.anchorOffset);
      const b = sel.focusNode ? visibleOffset(el, sel.focusNode, sel.focusOffset) : a;
      const s1 = visibleToMarker(last.current, Math.min(a, b));
      const s2 = visibleToMarker(last.current, Math.max(a, b));
      onSelect(s1, s2);
    };
    document.addEventListener("selectionchange", onSel);
    return () => document.removeEventListener("selectionchange", onSel);
  }, [onSelect]);
  return (
    <div
      id={id}
      ref={ref}
      className="vtb-edit"
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      onInput={() => {
        const el = ref.current;
        if (!el) return;
        const t = editorToText(el);
        last.current = t;
        onChange(t);
      }}
      onKeyDown={(e) => {
        if (!(e.metaKey || e.ctrlKey)) return;
        const k = e.key.toLowerCase();
        if (k === "z") { e.preventDefault(); step(!e.shiftKey); }
        else if (k === "y") { e.preventDefault(); step(false); }
      }}
      onPaste={(e) => {
        e.preventDefault();
        document.execCommand("insertText", false, numbers ? spaceVerseNumbers(e.clipboardData.getData("text/plain")) : e.clipboardData.getData("text/plain"));
      }}
    />
  );
}

