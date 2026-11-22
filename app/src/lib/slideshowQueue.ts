// "Added this session": everything put in the presentation with Add to Presentation on the Lyric, Readings and
// Scripture pages, in order. Kept for the browser tab's session, so "Your slideshow" shows what was added on any
// page, not only the page that is open. (Songs and studies wait in the Builder's Recent lists; readings wait in
// the pending list below, which the Builder adds when it opens.)

export type AddedKind = "song" | "reading" | "scripture";
export interface AddedEntry { id: string; label: string; kind: AddedKind }

const KEY = "slideshowAdded";
// Readings waiting for the Builder (it adds every one of them when it opens)
export const PENDING_READINGS_KEY = "pendingBuilderItems";

export function readAdded(): AddedEntry[] {
  try { return JSON.parse(sessionStorage.getItem(KEY) || "[]") as AddedEntry[]; } catch { return []; }
}

export function recordAdded(entry: AddedEntry) {
  try {
    const list = readAdded().filter((x) => x.id !== entry.id);
    sessionStorage.setItem(KEY, JSON.stringify([...list, entry].slice(-50)));
  } catch { /* storage blocked */ }
}

export function queueReading(item: unknown) {
  try {
    const list = JSON.parse(sessionStorage.getItem(PENDING_READINGS_KEY) || "[]") as unknown[];
    sessionStorage.setItem(PENDING_READINGS_KEY, JSON.stringify([...list, item]));
  } catch { /* storage blocked */ }
}

// The waiting readings, removed from the list as they are taken
export function takeQueuedReadings<T>(): T[] {
  try {
    const list = JSON.parse(sessionStorage.getItem(PENDING_READINGS_KEY) || "[]") as T[];
    sessionStorage.removeItem(PENDING_READINGS_KEY);
    return list;
  } catch { return []; }
}
