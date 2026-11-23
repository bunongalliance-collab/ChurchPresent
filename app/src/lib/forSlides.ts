// Passages waiting to become Scripture slides ("For slides"), shared by the Bible reader (/bible/) and the Scripture page.
// Both pages run on the same site, so they share this browser storage: the Bible reader adds passages, and the Scripture
// page picks them up whenever it is opened (from the Bible reader, the navbar or a new tab) and clears them once added.

export const FOR_SLIDES_KEY = "bible.forSlides";
const CHANGED = "forslides-changed";

// A passage: database translation, book code, chapter, first and last verse
export interface SlidePass { t: string; b: string; c: number; v1: number; v2: number }

export const passCode = (p: SlidePass) => `${p.t}:${p.b}.${p.c}.${p.v1}${p.v2 > p.v1 ? `-${p.v2}` : ""}`;

export function readForSlides(): SlidePass[] {
  try {
    const list = JSON.parse(localStorage.getItem(FOR_SLIDES_KEY) || "[]");
    return Array.isArray(list) ? list.filter((p) => p && typeof p.b === "string" && p.c > 0 && p.v1 > 0 && p.v2 >= p.v1) : [];
  } catch { return []; }
}

// Returns false when this browser would not save it (private browsing, storage turned off or full)
export function writeForSlides(list: SlidePass[]): boolean {
  let ok = true;
  try {
    if (list.length) localStorage.setItem(FOR_SLIDES_KEY, JSON.stringify(list));
    else localStorage.removeItem(FOR_SLIDES_KEY);
    ok = localStorage.getItem(FOR_SLIDES_KEY) === (list.length ? JSON.stringify(list) : null);
  } catch { ok = false; }
  // The storage event only reaches other tabs; tell this page too (e.g. the navbar count)
  window.dispatchEvent(new Event(CHANGED));
  return ok;
}

// Add passages, skipping ones already waiting. Returns the new list, and whether it was saved on this device.
export function addForSlides(add: SlidePass[]): { list: SlidePass[]; saved: boolean } {
  const cur = readForSlides();
  const have = new Set(cur.map(passCode));
  const next = [...cur, ...add.filter((p) => !have.has(passCode(p)))];
  return { list: next, saved: writeForSlides(next) };
}

// The Scripture page in the main app (with the navbar) with the passages in it. The passages travel in the link as well as in storage, because
// an iPhone home-screen app keeps its own storage and may not share the list with Safari or another home-screen app.
export function scriptureLink(list: SlidePass[]): string {
  const byT = new Map<string, string[]>();
  for (const p of list) byT.set(p.t, [...(byT.get(p.t) ?? []), `${p.b}.${p.c}.${p.v1}${p.v2 > p.v1 ? `-${p.v2}` : ""}`]);
  const first = [...byT.entries()][0];   // one translation per link (the Bunong Bible today)
  return first ? `/?add=${first[0]}:${first[1].slice(0, 50).join(",")}#scripture` : "/#scripture";
}

// Two Scripture tabs open with empty studies: only the first to claim the list adds it, so slides are not doubled
const LOCK_KEY = "bible.forSlides.lock";
export function claimForSlides(): boolean {
  try {
    const at = Number(localStorage.getItem(LOCK_KEY) || 0);
    if (Date.now() - at < 8000) return false;
    localStorage.setItem(LOCK_KEY, String(Date.now()));
    return true;
  } catch { return true; }
}
export function releaseForSlides(): void { try { localStorage.removeItem(LOCK_KEY); } catch { /* storage blocked */ } }

// Call fn when the list changes in another tab or page (the storage event), or when this page comes back into view
export function watchForSlides(fn: (list: SlidePass[]) => void): () => void {
  const onStorage = (e: StorageEvent) => { if (e.key === FOR_SLIDES_KEY || e.key === null) fn(readForSlides()); };
  const onShow = () => { if (document.visibilityState === "visible") fn(readForSlides()); };
  const onChange = () => fn(readForSlides());
  window.addEventListener("storage", onStorage);
  window.addEventListener(CHANGED, onChange);
  document.addEventListener("visibilitychange", onShow);
  window.addEventListener("pageshow", onShow);
  return () => { window.removeEventListener("storage", onStorage); window.removeEventListener(CHANGED, onChange); document.removeEventListener("visibilitychange", onShow); window.removeEventListener("pageshow", onShow); };
}
