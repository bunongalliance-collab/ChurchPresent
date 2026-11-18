// Score images for offline use. They go into the same "hymn-scores" cache the service worker reads
// (vite.config.ts, CacheFirst), so a saved score shows with no connection.

export const SCORE_CACHE = "hymn-scores";

const hasCaches = () => typeof caches !== "undefined";

// How many of these score links are already saved on this device
export async function countSaved(urls: string[]): Promise<number> {
  if (!hasCaches() || !urls.length) return 0;
  try {
    const cache = await caches.open(SCORE_CACHE);
    const keys = new Set((await cache.keys()).map((r) => r.url));
    return urls.filter((u) => keys.has(u)).length;
  } catch {
    return 0;
  }
}

// Ask the browser not to clear saved songs and scores when the device runs low on space
export async function keepStorage(): Promise<void> {
  try { await navigator.storage?.persist?.(); } catch { /* not supported */ }
}

// Save every score not saved yet, a few at a time. onProgress gets the number saved so far.
// Stops early when signal is aborted. Returns how many failed (no connection, missing file).
export async function saveAll(urls: string[], onProgress: (saved: number) => void, signal: AbortSignal): Promise<number> {
  if (!hasCaches()) return urls.length;
  const cache = await caches.open(SCORE_CACHE);
  const have = new Set((await cache.keys()).map((r) => r.url));
  let saved = urls.filter((u) => have.has(u)).length;
  let failed = 0;
  onProgress(saved);
  const todo = urls.filter((u) => !have.has(u));
  let i = 0;
  async function worker() {
    while (i < todo.length && !signal.aborted) {
      const url = todo[i++];
      try {
        const res = await fetch(url, { signal });
        if (!res.ok) throw new Error(String(res.status));
        await cache.put(url, res);
        saved++;
        onProgress(saved);
      } catch {
        if (!signal.aborted) failed++;
      }
    }
  }
  await Promise.all([worker(), worker(), worker(), worker()]);
  return failed;
}

// Warm the next and previous songs' scores so they show at once when swiping
export function prefetch(urls: string[]): void {
  for (const u of urls) { const img = new Image(); img.decoding = "async"; img.src = u; }
}
