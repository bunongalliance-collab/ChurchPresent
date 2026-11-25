// Where the reader is, kept on this device: the book, chapter and place on the page. The place is the first verse in
// view and how far down the screen it is, so it holds when lines move (fonts, text size, a turned phone).
export interface Pos { book: string; chap: number; v: string | null; off: number; y: number }

const KEY = "bible.reader.pos.v1";
const BACK_KEY = "bible.reader.back";   // this visit only
const read = (store: () => Storage, key: string): Pos | null => {
  try { const p = JSON.parse(store().getItem(key) || "null") as Pos | null; return p && typeof p.book === "string" && p.chap > 0 ? p : null; } catch { return null; }
};
export const readPos = () => read(() => localStorage, KEY);
export const writePos = (p: Pos) => { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* storage blocked */ } };
export const readBack = () => read(() => sessionStorage, BACK_KEY);
export const writeBack = (p: Pos | null) => { try { if (p) sessionStorage.setItem(BACK_KEY, JSON.stringify(p)); else sessionStorage.removeItem(BACK_KEY); } catch { /* storage blocked */ } };

// The position on screen now. At the very top there is no verse to hold on to.
export function currentPos(book: string, chap: number): Pos {
  const y = Math.round(window.scrollY);
  const head = document.querySelector("header")?.getBoundingClientRect();
  const clear = head && head.top < innerHeight / 2 ? head.bottom : 0;   // the bar is on top on desktop
  const el = y > 0 ? [...document.querySelectorAll<HTMLElement>(".passage .v")].find((x) => x.getBoundingClientRect().bottom > clear) : undefined;
  return { book, chap, y, v: el?.id ?? null, off: el ? Math.round(el.getBoundingClientRect().top) : 0 };
}

export function applyPos(p: Pos) {
  const el = p.v ? document.getElementById(p.v) : null;
  const top = el ? window.scrollY + el.getBoundingClientRect().top - p.off : p.y;
  window.scrollTo({ top, behavior: "instant" });
}
