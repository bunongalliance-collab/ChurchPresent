// Is there work on the Lyric, Readings or Scripture page that would be lost by opening something else, or by closing
// the tab? Compares what is on the page with the saved copy; something never saved counts once it has content.
import { useEffect } from "react";
import { toast } from "./toast";

// The same text for the same data, whatever order the fields come in (the database reorders them)
const stable = (v: unknown): string => JSON.stringify(v, (_k, x: unknown) =>
  x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : 1))) : x);
const differs = (a: string | null | undefined, b: string) => (a ?? "").trim() !== b.trim();
// Only the formatting the saved copy holds: opening it leaves the other settings as they were
const lookDiffers = (saved: object | undefined, now: object) =>
  Object.entries(saved ?? {}).some(([k, v]) => stable((now as Record<string, unknown>)[k]) !== stable(v));

interface Song { title: string; number: string; lyrics?: string; look?: object }
export function songDirty(saved: Song | null, f: { title: string; number: string; lyrics: string; look: object }): boolean {
  if (!saved) return !!(f.lyrics.trim() || f.title.trim());
  return (saved.lyrics ?? "") !== f.lyrics || differs(saved.title, f.title) || differs(saved.number, f.number) || lookDiffers(saved.look, f.look);
}

interface Reading { title: string; number: string; subtitle: string; categoryId: string | null; content: string; look?: object }
export function readingDirty(saved: Reading | null, f: Omit<Reading, "categoryId" | "look"> & { categoryId: string; look: object }): boolean {
  if (!saved) return !!(f.content.trim() || f.title.trim());
  return saved.content !== f.content || differs(saved.title, f.title) || differs(saved.number, f.number) || differs(saved.subtitle, f.subtitle)
    || (saved.categoryId ?? "") !== f.categoryId || lookDiffers(saved.look, f.look);
}

interface Study { title: string; slides: { title: string; text: string }[]; look: object }
const NEW_NAME = "Scripture study";
const STARTER_TITLES = ["", "Custom slide", "Questions"];
export function studyDirty(saved: Study | null, f: Study): boolean {
  if (!saved) return differs(NEW_NAME, f.title) && !!f.title.trim() || f.slides.some((s) => s.text.trim() || !STARTER_TITLES.includes(s.title.trim()));
  return differs(saved.title, f.title) || stable(saved.slides) !== stable(f.slides) || lookDiffers(saved.look, f.look);
}

// ---------- Wording ----------
type Page = "song" | "reading" | "study";
const LABEL: Record<Page, string> = { song: "Lyric", reading: "Reading", study: "Scripture" };
const WHERE: Record<Page, string> = { song: "Press Save Song on the Lyric page.", reading: "Press Save Reading on the Readings page.", study: "Press Save Study on the Scripture page." };
// "Lyric “5. Jingle Bell”", or just "Lyric" when it has no name yet
const named = (page: Page, name?: string | boolean) => (typeof name === "string" && name.trim() ? `${LABEL[page]} “${name.trim()}”` : LABEL[page]);
export const discardQuestion = (page: Page, name?: string) =>
  `Your ${named(page, name)} wasn’t saved.\n\nPress Cancel to go back and save it, or OK to discard your changes.`;

// True when it is fine to go on: nothing would be lost, or the person chose to discard it
export const mayDiscard = (dirty: boolean, page: Page, name?: string) => !dirty || window.confirm(discardQuestion(page, name));

// ---------- Closing the tab ----------
// Which pages hold unsaved work, with its name. Kept with the drafts (this tab only), so it still counts after moving
// to another page.
type Flags = Partial<Record<Page, string | boolean>>;
const KEY = "unsavedPages";
const flags = (): Flags => { try { return JSON.parse(sessionStorage.getItem(KEY) || "{}") ?? {}; } catch { return {}; } };
export function setUnsaved(page: Page, dirty: boolean, name?: string) { try { sessionStorage.setItem(KEY, JSON.stringify({ ...flags(), [page]: dirty && (name?.trim() || true) })); } catch { /* storage blocked */ } }
export const anyUnsaved = () => Object.values(flags()).some(Boolean);
export function unsavedNotice(now: Flags): string {
  const pages = (Object.keys(LABEL) as Page[]).filter((p) => now[p]);
  if (!pages.length) return "";
  if (pages.length === 1) return `Your ${named(pages[0], now[pages[0]])} wasn’t saved. ${WHERE[pages[0]]}`;
  const list = pages.map((p) => named(p, now[p]));
  return `Your ${list.slice(0, -1).join(", ")} and ${list[list.length - 1]} weren’t saved. Save each one before closing.`;
}

// The browser shows its own "Leave site?" box (apps may not change its words). If the person stays, a message then
// says what wasn't saved. It also appears on reload.
if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", (e) => {
    if (!anyUnsaved()) return;
    e.preventDefault();
    e.returnValue = "";
    window.setTimeout(() => toast(unsavedNotice(flags()), true), 500);   // runs only if the page is still open
  });
}

// A page reports whether it has unsaved work; null while the saved copy isn't loaded yet (the last answer stands)
export function useUnsaved(page: Page, dirty: boolean | null, name?: string) {
  useEffect(() => { if (dirty !== null) setUnsaved(page, dirty, name); }, [page, dirty, name]);
}
