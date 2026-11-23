// Passages waiting to become Scripture slides ("For slides"), shared by the Bible reader (/bible/) and the Scripture page.
// Both pages run on the same site, so they share this browser storage: the Bible reader adds passages, and the Scripture
// page picks them up whenever it is opened (from the Bible reader, the navbar or a new tab) and clears them once added.

export const FOR_SLIDES_KEY = "bible.forSlides";

// A passage: database translation, book code, chapter, first and last verse
export interface SlidePass { t: string; b: string; c: number; v1: number; v2: number }

export const passCode = (p: SlidePass) => `${p.t}:${p.b}.${p.c}.${p.v1}${p.v2 > p.v1 ? `-${p.v2}` : ""}`;

export function readForSlides(): SlidePass[] {
  try {
    const list = JSON.parse(localStorage.getItem(FOR_SLIDES_KEY) || "[]");
    return Array.isArray(list) ? list.filter((p) => p && typeof p.b === "string" && p.c > 0 && p.v1 > 0 && p.v2 >= p.v1) : [];
  } catch { return []; }
}

export function writeForSlides(list: SlidePass[]): void {
  try {
    if (list.length) localStorage.setItem(FOR_SLIDES_KEY, JSON.stringify(list));
    else localStorage.removeItem(FOR_SLIDES_KEY);
  } catch { /* storage blocked */ }
}

// Add passages, skipping ones already waiting. Returns the new list.
export function addForSlides(add: SlidePass[]): SlidePass[] {
  const cur = readForSlides();
  const have = new Set(cur.map(passCode));
  const next = [...cur, ...add.filter((p) => !have.has(passCode(p)))];
  writeForSlides(next);
  return next;
}

// Call fn when the list changes in another tab or page (the storage event), or when this page comes back into view
export function watchForSlides(fn: (list: SlidePass[]) => void): () => void {
  const onStorage = (e: StorageEvent) => { if (e.key === FOR_SLIDES_KEY || e.key === null) fn(readForSlides()); };
  const onShow = () => { if (document.visibilityState === "visible") fn(readForSlides()); };
  window.addEventListener("storage", onStorage);
  document.addEventListener("visibilitychange", onShow);
  window.addEventListener("pageshow", onShow);
  return () => { window.removeEventListener("storage", onStorage); document.removeEventListener("visibilitychange", onShow); window.removeEventListener("pageshow", onShow); };
}
