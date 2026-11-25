// Work the app keeps in this browser (not in the database) belongs to the account that made it. When a different
// account signs in on the same browser (or someone signs out), that work is set aside under the previous account and
// the new account's own work, if any, is put back. Nothing is deleted: signing back in brings it back.
// Device settings (theme, text size, the Nau Mpro church, the Bible reader) are not account work and stay shared.

const LAST = "app.account";            // the account whose work is in the browser now ("signed-out" when nobody)
const STASH = "app.accountStash.";     // + account id: that account's work, set aside

// Browser keys that hold one account's work: lists, drafts, recent and favourite items, notes, the projector deck
const KEYS = [
  // "Your slideshow" and items waiting for the Presentation Builder
  "slideshowAdded", "pendingBuilderItems", "pendingBuilderItem",
  // Recently added songs and readings (Presentation Builder, Program)
  "addedSongsLog", "builderHiddenRecentSongs", "addedReadingsLog", "builderHiddenRecentScriptures",
  // Unsaved drafts
  "serviceProgramDraft5", "programDraftOwner", "builderDraft", "readingDraft", "scriptureDraft", "returnToBuilder", "unsavedPages", "serviceSlidesProgram",
  "programV2Items", "programV3Items", "programSimpleLines",
  // Favourites and recently used
  "lyricsFavorites", "lyricsRecent", "readingFavourites", "readingRecent", "scriptureFavorites", "scriptureRecent",
  // The projector deck and its position, notes, the current church
  "lyricsDeck", "projectorIndex", "userNotes", "builtInNotesAdded", "church.current",
];

type Saved = { local: Record<string, string>; session: Record<string, string> };

function take(): Saved {
  const out: Saved = { local: {}, session: {} };
  for (const k of KEYS) {
    const l = localStorage.getItem(k);
    if (l !== null) { out.local[k] = l; localStorage.removeItem(k); }
    const s = sessionStorage.getItem(k);
    if (s !== null) { out.session[k] = s; sessionStorage.removeItem(k); }
  }
  return out;
}
function put(saved: Saved) {
  for (const [k, v] of Object.entries(saved.local)) localStorage.setItem(k, v);
  for (const [k, v] of Object.entries(saved.session)) sessionStorage.setItem(k, v);
}

// Make the browser hold `account`'s work. Returns true when it changed, so the page can reload and read it.
// The first time (no account recorded yet) the work already here is taken to be this account's.
export function switchAccountData(account: string): boolean {
  try {
    const prev = localStorage.getItem(LAST);
    if (prev === account) return false;
    if (prev === null) { localStorage.setItem(LAST, account); return false; }
    const mine = take();
    if (Object.keys(mine.local).length || Object.keys(mine.session).length) {
      try { localStorage.setItem(STASH + prev, JSON.stringify(mine)); }
      catch { /* storage full: the previous account's browser work is dropped rather than shown to someone else */ }
    }
    const back = localStorage.getItem(STASH + account);
    if (back) { put(JSON.parse(back) as Saved); localStorage.removeItem(STASH + account); }
    localStorage.setItem(LAST, account);
    return true;
  } catch {
    return false;   // storage blocked: nothing is kept in this browser anyway
  }
}
