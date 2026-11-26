// Bunong Bible reader (/nau-brah-ndu-ngoi/). Design approved from the sample in bible-pwa/sample/index.html.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { addForSlides, readForSlides, scriptureLink, watchForSlides, writeForSlides, type SlidePass } from "../lib/forSlides";
import { useReaderSync, type SyncState } from "./sync";
import { supabase } from "../lib/supabase";
import type { Session } from "@supabase/supabase-js";
import { SEARCH_LIMIT, TRANSLATION, getBook, localBooks, refreshBookNames, saveWholeBible, savedBook, savedBookCodes, searchBible, type Book, type BookText, type Chapter, type SearchResult } from "./data";
import { parseReference, tidy, versesInRange, type Found } from "./find";
import { applyPos, currentPos, readBack, readPos, writeBack, writePos, type Pos } from "./position";
import { useServiceScripture } from "./service";
import { NOTE_MAX, loadMyChurches, postShare, rememberName, rememberedName, removeShare, shareAudience, useReaderChurch, useShared, type ChurchChoice, type MyShare, type SharedData } from "./share";

// ---------- Stored on this device ----------
type Size = "s" | "m" | "l";
type Leading = "compact" | "normal" | "relaxed";
interface Mark { ref: string; text: string; at: number }          // a saved verse: reference and text as shown
interface Note extends Mark { note: string }
interface State {
  book: string; chap: number;
  hl: Record<string, 1>; saved: Record<string, Mark>; notes: Record<string, Note>;
  size: Size; leading: Leading; theme: "light" | "dark" | null;
  goScripture: boolean;                                             // phones and tablets: show the Go to Scripture button
  slideList?: Pass[];                                              // older versions kept the slide list here (moved to lib/forSlides)
}
// A passage for slides: book code, chapter, first and last verse
interface Pass { b: string; c: number; v1: number; v2: number }
const KEY = "bible.reader.v1";
const DEFAULTS: State = { book: "GEN", chap: 1, hl: {}, saved: {}, notes: {}, size: "m", leading: "normal", theme: null, goScripture: false };
function loadState(): State { try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || "{}") }; } catch { return DEFAULTS; } }
const SIZES: Record<Size, string> = { s: "1.0625rem", m: "1.25rem", l: "1.5rem" };
const LEAD: Record<Leading, number> = { compact: 1.55, normal: 1.75, relaxed: 2 };

// A verse key: BOOK|chapter|verse
const vkey = (b: string, c: number, v: number) => `${b}|${c}|${v}`;
const parseKey = (k: string) => { const [b, c, v] = k.split("|"); return { b, c: +c, v: +v }; };

// Verses next to each other become one passage: 3:1, 3:2, 3:3 and 3:7 -> 3:1-3 and 3:7.
// endOf gives a verse's last number (a verse printed as "14-15" ends at 15).
function toPasses(keys: string[], bookOrder: (b: string) => number, endOf: (k: string) => number): Pass[] {
  const sorted = [...keys].sort((x, y) => { const a = parseKey(x), b = parseKey(y); return bookOrder(a.b) - bookOrder(b.b) || a.c - b.c || a.v - b.v; });
  const out: Pass[] = [];
  for (const k of sorted) {
    const { b, c, v } = parseKey(k), last = out[out.length - 1];
    if (last && last.b === b && last.c === c && v <= last.v2 + 1) last.v2 = Math.max(last.v2, endOf(k));
    else out.push({ b, c, v1: v, v2: endOf(k) });
  }
  return out;
}
// Passages for slides wait in a list shared with the Scripture page (lib/forSlides), which picks them up when opened
const toShared = (p: Pass): SlidePass => ({ t: TRANSLATION, ...p });
const ownList = (list: SlidePass[]): Pass[] => list.filter((p) => p.t === TRANSLATION).map(({ b, c, v1, v2 }) => ({ b, c, v1, v2 }));

// ---------- Icons ----------
const PATHS: Record<string, ReactNode> = {
  home: <><path d="M4 11 12 4l8 7" /><path d="M6 10v10h12V10" /></>,
  save: <path d="M7 4h10v16l-5-4-5 4z" />,
  note: <><path d="M5 4h10l4 4v12H5z" /><path d="M9 12h6M9 16h4" /></>,
  set: <><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></>,
  search: <><circle cx="11" cy="11" r="6" /><path d="m20 20-4.5-4.5" /></>,
  down: <path d="m6 9 6 6 6-6" />,
  x: <path d="M6 6l12 12M18 6 6 18" />,
  hl: <><path d="m14 4 6 6-9 9H5v-6z" /><path d="M4 21h16" /></>,
  copy: <><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" /></>,
  l: <path d="m15 6-6 6 6 6" />,
  r: <path d="m9 6 6 6-6 6" />,
  up: <path d="m6 15 6-6 6 6" />,
  dn: <path d="m6 9 6 6 6-6" />,
  open: <><path d="M14 9V5H3v14h11v-4" /><path d="M9 12h12M17 8l4 4-4 4" /></>,
  share: <><circle cx="9" cy="8" r="3" /><path d="M3.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5" /><path d="M18 8v6M15 11h6" /></>,
  shared: <><circle cx="12" cy="8" r="3" /><path d="M7 19c0-3 2.2-5 5-5s5 2 5 5" /><circle cx="5" cy="10" r="2" /><path d="M2 17c0-2 1.3-3.3 3.5-3.3" /><circle cx="19" cy="10" r="2" /><path d="M22 17c0-2-1.3-3.3-3.5-3.3" /></>,
  send: <><path d="M12 15V4M8 8l4-4 4 4" /><path d="M5 12v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7" /></>,
  slides: <><rect x="3" y="5" width="18" height="12" rx="1.5" /><path d="M8 21h8M12 17v4M7 9h10M7 13h6" /></>,
};
const Icon = ({ n }: { n: string }) => <svg viewBox="0 0 24 24" aria-hidden="true">{PATHS[n]}</svg>;

type PanelName = "books" | "chapters" | "verses" | "saved" | "notes" | "settings" | "slides" | "search" | "share" | "shared";
interface PanelState { name: PanelName; book?: string; chap?: number; edit?: string; pass?: Pass }

export default function Bible() {
  const [s, setS] = useState<State>(loadState);
  const [books, setBooks] = useState<Book[]>(localBooks);
  const [text, setText] = useState<BookText | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Selected verses, in reading order. Tap a verse to select it; while verses are selected, tapping another adds it
  // and tapping a selected one removes it.
  const [picked, setPicked] = useState<string[]>([]);
  const [panel, setPanel] = useState<PanelState | null>(null);
  const [toast, setToast] = useState<{ m: string; open?: boolean } | null>(null);   // open: show "Open Scripture"
  const [jump, setJump] = useState<{ v1: number; v2: number } | null>(null);   // verses to scroll to and select
  // The reading position kept on this device (./position.ts), put back once its chapter is on screen
  const pending = useRef<Pos | null>(readPos());
  const [restore, setRestore] = useState(0);
  // Where the reader was before opening the service's scripture reading
  const [back, setBack] = useState<Pos | null>(readBack);
  const [reload, setReload] = useState(0);
  const toastTimer = useRef(0);

  const update = useCallback((fn: (p: State) => State) => setS((p) => fn(p)), []);
  // Highlights, saved verses and notes are also kept on the person's account when they sign in (./sync.ts)
  const sync = useReaderSync(s, update);

  // Passages waiting for the Scripture page. Kept in sync when the Scripture page adds them (and clears the list)
  const [forSlides, setForSlides] = useState<Pass[]>(() => {
    const old = loadState().slideList;
    if (old?.length) addForSlides(old.map(toShared));
    return ownList(readForSlides());
  });
  useEffect(() => watchForSlides((list) => setForSlides(ownList(list))), []);
  useEffect(() => { if (s.slideList) update((p) => { const n = { ...p }; delete n.slideList; return n; }); }, [s.slideList, update]);
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage blocked */ } }, [s]);
  useEffect(() => { refreshBookNames().then((b) => b && setBooks(b)); }, []);

  // Theme and text settings
  useEffect(() => {
    const r = document.documentElement;
    r.style.setProperty("--text-size", SIZES[s.size]);
    r.style.setProperty("--leading", String(LEAD[s.leading]));
    if (s.theme) r.dataset.theme = s.theme; else delete r.dataset.theme;
  }, [s.size, s.leading, s.theme]);

  // Load the current book
  useEffect(() => {
    let live = true;
    setError(null);
    if (text?.code !== s.book) setText(null);
    getBook(s.book).then((t) => { if (live) { setText(t); setBooks(localBooks()); } })
      .catch((e: Error) => { if (live) setError(e.message); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.book, reload]);
  useEffect(() => { const on = () => setReload((n) => n + 1); window.addEventListener("online", on); return () => window.removeEventListener("online", on); }, []);

  const book = books.find((b) => b.code === s.book) ?? books[0];
  const chapter: Chapter | undefined = text?.code === s.book ? text.chapters[s.chap] : undefined;
  const say = (m: string, open = false) => { setToast({ m, open }); window.clearTimeout(toastTimer.current); toastTimer.current = window.setTimeout(() => setToast(null), open ? 6000 : 1800); };
  const refOf = (k: string) => { const { b, c, v } = parseKey(k); const bk = books.find((x) => x.code === b); const vs = text?.code === b ? text.chapters[c]?.verses.find((x) => x.v === v) : undefined; return `${bk?.local ?? b} ${c}:${v}${vs?.end ? `–${vs.end}` : ""}`; };
  const bookOrder = (b: string) => books.findIndex((x) => x.code === b);
  const endOf = (k: string) => { const { b, c, v } = parseKey(k); return (text?.code === b ? text.chapters[c]?.verses.find((x) => x.v === v)?.end : null) ?? v; };
  const passesOf = (keys: string[]) => toPasses(keys, bookOrder, endOf);
  const sortKeys = (keys: string[]) => [...new Set(keys)].sort((x, y) => { const a = parseKey(x), b = parseKey(y); return bookOrder(a.b) - bookOrder(b.b) || a.c - b.c || a.v - b.v; });
  const tap = (k: string) => setPicked((p) => sortKeys(p.includes(k) ? p.filter((x) => x !== k) : [...p, k]));
  const textOf = (k: string) => { const { b, c, v } = parseKey(k); return (text?.code === b ? text.chapters[c]?.verses.find((x) => x.v === v)?.text : undefined) ?? s.saved[k]?.text ?? s.notes[k]?.text ?? ""; };

  const go = useCallback((b: string, c: number, v?: number, v2?: number) => {
    setPicked([]); setPanel(null);
    pending.current = null;
    setBack((old) => (old && old.book === b && old.chap === c ? null : old));
    update((p) => ({ ...p, book: b, chap: c }));
    setJump(v ? { v1: v, v2: v2 ?? v } : null);
    if (!v) window.scrollTo(0, 0);
  }, [update]);

  // A shared link (?v=BOOK.chapter.verse or .v1-v2) opens the reader at that verse, selected
  useEffect(() => {
    const m = /^([^.]+)\.(\d+)\.(\d+)(?:-(\d+))?$/.exec(new URLSearchParams(location.search).get("v") ?? "");
    if (!m) return;
    go(m[1], +m[2], +m[3], m[4] ? +m[4] : undefined);
    history.replaceState(null, "", location.pathname + location.hash);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // After a verse jump, scroll to it once the chapter is on screen
  useEffect(() => {
    if (!jump || !chapter) return;
    const found = versesInRange(chapter.verses, jump.v1, jump.v2);
    const el = found.length ? document.getElementById(`v${found[0].v}`) : null;
    if (el) {
      el.scrollIntoView({ block: "center", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
      el.focus({ preventScroll: true });
      setPicked(found.map((x) => vkey(s.book, s.chap, x.v)));
    } else window.scrollTo(0, 0);
    setJump(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jump, chapter]);

  // ---------- Reading position: remembered quietly, and put back on return or reload ----------
  const place = useRef({ book: s.book, chap: s.chap, shown: false });
  place.current = { book: s.book, chap: s.chap, shown: !!chapter };
  const here = () => currentPos(place.current.book, place.current.chap);
  const savePos = useCallback(() => {
    if (place.current.shown && !pending.current) writePos(currentPos(place.current.book, place.current.chap));
  }, []);
  useLayoutEffect(() => {
    const p = pending.current;
    if (!chapter) return;
    if (!p || p.book !== s.book || p.chap !== s.chap) { pending.current = null; savePos(); return; }
    applyPos(p);
    const at = window.scrollY;
    // Again once the fonts are in (lines can move), unless the reader has already scrolled or gone elsewhere
    void document.fonts.ready.then(() => {
      if (pending.current !== p) return;
      if (Math.abs(window.scrollY - at) < 2) applyPos(p);
      pending.current = null;
      savePos();
    });
  }, [chapter, restore, s.book, s.chap, savePos]);
  useEffect(() => {
    history.scrollRestoration = "manual";
    let t = 0;
    const later = () => { window.clearTimeout(t); t = window.setTimeout(savePos, 150); };
    const hide = () => { if (document.visibilityState === "hidden") savePos(); };
    window.addEventListener("scroll", later, { passive: true });
    window.addEventListener("pagehide", savePos);
    document.addEventListener("visibilitychange", hide);
    return () => { window.clearTimeout(t); window.removeEventListener("scroll", later); window.removeEventListener("pagehide", savePos); document.removeEventListener("visibilitychange", hide); };
  }, [savePos]);

  // ---------- The scripture reading of the church's service: a quiet nudge in the lower-right corner ----------
  useEffect(() => writeBack(back), [back]);
  const churches = useReaderChurch(sync.session?.user.id ?? null);
  const service = useServiceScripture(books, churches.church?.id ?? null);
  const shared = useShared(churches.church?.id ?? null, sync.session?.user.id ?? null);
  const openService = (f: Found) => {
    const from = here();
    go(f.book.code, f.chap, f.v1 ?? undefined, f.v2 ?? undefined);
    setBack(from);
  };
  const goBack = (to: Pos) => {
    go(to.book, to.chap);
    pending.current = to;
    setBack(null);
    setRestore((n) => n + 1);
  };
  const bookName = (code: string) => books.find((x) => x.code === code)?.local ?? code;
  // The church's newest shared verse, shown above the service reading
  const latest = shared.rows?.find((r) => books.some((b) => b.code === r.book_code));
  const latestFound: Found | null = latest ? { book: books.find((b) => b.code === latest.book_code)!, chap: latest.chapter, v1: latest.verse_from, v2: latest.verse_to } : null;
  // Hidden while verse actions or a panel are open, and each one on the passage it has just opened
  const offer = (f: Found) => !panel && !picked.length && !(back && s.book === f.book.code && s.chap === f.chap);
  const nudges = [
    ...(latestFound && offer(latestFound) ? [{ key: "shared", label: "Latest shared", found: latestFound, open: () => { shared.markSeen(); openService(latestFound); } }] : []),
    ...(service && offer(service.found) ? [{ key: "service", label: service.label, found: service.found, open: () => openService(service.found) }] : []),
  ];
  const nudgeSpace = (latestFound ? 1 : 0) + (service ? 1 : 0);   // room kept below the chapter's last buttons

  // Previous and next chapter, across books
  const step = (d: 1 | -1) => {
    const i = books.findIndex((b) => b.code === s.book);
    if (d === 1) { if (s.chap < book.chapters) go(s.book, s.chap + 1); else if (books[i + 1]) go(books[i + 1].code, 1); }
    else if (s.chap > 1) go(s.book, s.chap - 1); else if (books[i - 1]) go(books[i - 1].code, books[i - 1].chapters);
  };
  const prevLabel = s.chap > 1 ? `Chapter ${s.chap - 1}` : books[books.indexOf(book) - 1]?.local;
  const nextLabel = s.chap < book.chapters ? `Chapter ${s.chap + 1}` : books[books.indexOf(book) + 1]?.local;

  // Verse actions: Highlight, Save and Copy work on every selected verse; Note on one verse
  const allHl = picked.length > 0 && picked.every((k) => s.hl[k]);
  const allSaved = picked.length > 0 && picked.every((k) => s.saved[k]);
  const toggleHl = () => {
    const on = !allHl;
    update((p) => { const hl = { ...p.hl }; for (const k of picked) { if (on) hl[k] = 1; else delete hl[k]; } return { ...p, hl }; });
    say(on ? "Highlighted" : "Highlight removed");
  };
  const toggleSave = () => {
    const on = !allSaved;
    update((p) => { const saved = { ...p.saved }; for (const k of picked) { if (on) saved[k] = saved[k] ?? { ref: refOf(k), text: textOf(k), at: Date.now() }; else delete saved[k]; } return { ...p, saved }; });
    say(on ? (picked.length > 1 ? `${picked.length} verses saved` : "Saved") : "Removed from Saved");
  };
  const passLabel = (ps: Pass) => `${books.find((x) => x.code === ps.b)?.local ?? ps.b} ${ps.c}:${ps.v1}${ps.v2 > ps.v1 ? `–${ps.v2}` : ""}`;
  // Share with church: one passage at a time (verses next to each other in a chapter)
  const sharePicked = () => {
    const ps = passesOf(picked);
    if (ps.length === 1) setPanel({ name: "share", pass: ps[0] });
    else say("To share, select verses next to each other");
  };
  // Send the verses to anyone (messages, WhatsApp, social): the Scripture first, then a link back to this reader at that verse
  const sendPicked = async () => {
    const ps = passesOf(picked);
    if (ps.length !== 1) { say("To send, select verses next to each other"); return; }
    const p = ps[0];
    const keys = picked.filter((k) => { const { b, c, v } = parseKey(k); return b === p.b && c === p.c && v >= p.v1 && v <= p.v2; });
    const verse = keys.map((k) => textOf(k).trim()).join(" ").replace(/^[\u201C\u201D"]+|[\u201C\u201D"]+$/g, "");
    const url = `${location.origin}/v/${p.b}.${p.c}.${p.v1}${p.v2 > p.v1 ? `-${p.v2}` : ""}`;
    const words = `“${verse}”\n\n— ${passLabel(p)} · Shared from Nau Brah Ndu Ngơi`;
    const msg = `${words}\n\n${url}`;
    if (navigator.share) {
      try { await navigator.share({ text: words, url }); return; }
      catch (e) { if ((e as Error).name === "AbortError") return; }
    }
    try { await navigator.clipboard.writeText(msg); say("Verse and link copied"); }
    catch { say("Copy isn't available here"); }
  };
  // The slides icon: add the passages to the slide list in one tap. The message offers to open the Scripture page now;
  // otherwise keep reading and collecting, and open the list later from Saved.
  const addToSlides = (ps: Pass[]) => {
    const { list, saved } = addForSlides(ps.map(toShared));
    // Storage blocked: keep them for this visit only, and say so; the Open Scripture link still carries them
    if (saved) setForSlides(ownList(list));
    else setForSlides((cur) => { const have = new Set(cur.map((x) => `${x.b}.${x.c}.${x.v1}.${x.v2}`)); return [...cur, ...ps.filter((x) => !have.has(`${x.b}.${x.c}.${x.v1}.${x.v2}`))]; });
    setPicked([]);
    if (saved) { if (panel?.name !== "slides") say(`Added ${ps.length} passage${ps.length === 1 ? "" : "s"} to slides`, true); }
    else say("This browser won’t save them. Open Scripture now to use them.", true);
  };
  const moveForSlides = (i: number, d: -1 | 1) => {
    const next = forSlides.slice(); const j = i + d; if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    writeForSlides([...readForSlides().filter((p) => p.t !== TRANSLATION), ...next.map(toShared)]); setForSlides(next);
  };
  const removeForSlides = (i: number) => { const next = forSlides.filter((_, j) => j !== i); writeForSlides([...readForSlides().filter((p) => p.t !== TRANSLATION), ...next.map(toShared)]); setForSlides(next); };
  const clearForSlides = () => { writeForSlides(readForSlides().filter((p) => p.t !== TRANSLATION)); setForSlides([]); };
  const copy = async () => {
    if (!picked.length) return;
    const str = passesOf(picked).map((ps) => picked.filter((k) => { const { b, c, v } = parseKey(k); return b === ps.b && c === ps.c && v >= ps.v1 && v <= ps.v2; })
      .map((k) => `${parseKey(k).v} ${textOf(k)}`).join(" ") + ` (${passLabel(ps)})`).join("\n\n");
    try { await navigator.clipboard.writeText(str); say("Copied"); }
    catch { const t = document.createElement("textarea"); t.value = str; document.body.append(t); t.select(); try { document.execCommand("copy"); say("Copied"); } catch { say("Copy isn't available here"); } t.remove(); }
  };

  // Left and right arrows change chapter (desktop keyboards), unless a dialog or a text field has the keys
  const stepRef = useRef(step); stepRef.current = step;
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.key !== "ArrowLeft" && e.key !== "ArrowRight") || e.altKey || e.metaKey || e.ctrlKey || e.shiftKey) return;
      if ((e.target as Element).closest?.("textarea,input,.panel")) return;
      if (document.querySelector(".panel:not(.drawer)")) return;
      e.preventDefault(); stepRef.current(e.key === "ArrowLeft" ? -1 : 1);
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, []);

  // Tablet and desktop: the verse tools sit right beside the selected verses, level with the first one, just right of the
  // text. They follow while scrolling and stay on screen (clear of the bar). Phones keep them at the right edge.
  const [near, setNear] = useState(() => matchMedia(NEAR_MQ).matches);
  // Desktop: the corner button opens the For slides drawer; phones and tablets go straight to the Scripture page
  const [desk, setDesk] = useState(() => matchMedia(DESK).matches);
  useEffect(() => { const mq = matchMedia(DESK); const f = () => setDesk(mq.matches); mq.addEventListener("change", f); return () => mq.removeEventListener("change", f); }, []);
  useEffect(() => { const mq = matchMedia(NEAR_MQ); const f = () => setNear(mq.matches); mq.addEventListener("change", f); return () => mq.removeEventListener("change", f); }, []);
  // The corner button: always on desktop (For slides); on phones and tablets only when turned on in Settings
  const showGo = desk || s.goScripture;
  const toolsRef = useRef<HTMLDivElement>(null);
  const placeTools = useCallback(() => {
    const el = toolsRef.current;
    if (!el || !picked.length) return;
    const first = document.querySelector(`.v[data-k="${picked[0]}"]`), text = document.querySelector(".passage"), head = document.querySelector("header");
    if (!first || !text || !head) return;
    const r = first.getClientRects()[0] ?? first.getBoundingClientRect(), col = text.getBoundingClientRect(), hb = head.getBoundingClientRect();
    const barOnTop = hb.top < innerHeight / 2;
    const topLimit = (barOnTop ? hb.bottom : 0) + 12, bottomLimit = (barOnTop ? innerHeight : hb.top) - 12;
    // Level with the first selected line (a little above, so the verse label lines up with it); just right of the text,
    // or at the right edge when the window is too narrow for that
    const top = Math.min(Math.max(r.top - 28, topLimit), bottomLimit - el.offsetHeight);
    const left = Math.min(col.right + 16, innerWidth - el.offsetWidth - 12);
    el.style.top = `${Math.round(top)}px`;
    el.style.left = `${Math.round(left)}px`;
  }, [picked]);
  useLayoutEffect(() => {
    if (!near) return;
    placeTools();
    const later = window.setTimeout(placeTools, 260);   // again once the page has finished moving for a drawer
    window.addEventListener("scroll", placeTools, { passive: true });
    window.addEventListener("resize", placeTools);
    return () => { window.clearTimeout(later); window.removeEventListener("scroll", placeTools); window.removeEventListener("resize", placeTools); };
  }, [near, placeTools, panel, s.size, s.leading]);

  // Clear the selection on a click outside the passage, or with Escape
  useEffect(() => {
    const click = (e: MouseEvent) => { if (picked.length && !(e.target as Element).closest(".v,.actions,.panel,.scrim,.svc,.nudge")) setPicked([]); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape" && !panel && picked.length) setPicked([]); };
    document.addEventListener("click", click); document.addEventListener("keydown", key);
    return () => { document.removeEventListener("click", click); document.removeEventListener("keydown", key); };
  }, [picked, panel]);

  return (
    <>
      <header>
        <div className="wrap bar">
          <div className="sel">
            <button className="pill" onClick={() => setPanel({ name: "books" })} aria-haspopup="dialog" aria-label={`Book: ${book.local}`}><span className="bk">{book.local}</span><Icon n="down" /></button>
            <button className="pill" onClick={() => setPanel({ name: "chapters", book: s.book })} aria-haspopup="dialog" aria-label={`Chapter ${s.chap}`}><span>{s.chap}</span><Icon n="down" /></button>
          </div>
          <nav className="icons" aria-label="Reader tools">
            <button className="ib" aria-label="Search" aria-haspopup="dialog" onClick={() => setPanel({ name: "search" })}><Icon n="search" /></button>
            <button className="ib" aria-label="Home: back to the passage" onClick={() => { setPanel(null); setPicked([]); window.scrollTo({ top: 0 }); }}><Icon n="home" /></button>
            <button className="ib" aria-label="Saved verses" aria-haspopup="dialog" onClick={() => setPanel({ name: "saved" })}><Icon n="save" /></button>
            <button className="ib" aria-label={shared.unseen ? "Shared verses, new" : "Shared verses"} aria-haspopup="dialog" onClick={() => { shared.reload(); setPanel({ name: "shared" }); }}><Icon n="shared" />{shared.unseen && <span className="dot" aria-hidden="true" />}</button>
            <button className="ib" aria-label="Notes" aria-haspopup="dialog" onClick={() => setPanel({ name: "notes" })}><Icon n="note" /></button>
            <button className="ib" aria-label="Settings" aria-haspopup="dialog" onClick={() => setPanel({ name: "settings" })}><Icon n="set" /></button>
          </nav>
        </div>
      </header>

      <div className="wrap">
        <p className="title">Nau Brah Ndu Ngơi</p>
        <main className={nudgeSpace ? (nudgeSpace > 1 ? "has-nudge two" : "has-nudge") : undefined}>
          <p className="ref">{book.local} &middot; Chapter {s.chap}</p>
          {back && <button className="svc" onClick={() => goBack(back)}><Icon n="l" />Back to {bookName(back.book)} {back.chap}</button>}
          {chapter ? <Passage book={s.book} chap={s.chap} ch={chapter} s={s} picked={picked} onSelect={tap} />
            : error ? <div className="empty">
                <b>{error === "offline" ? `${book.local} isn’t saved on this device yet.` : "The passage didn’t load."}</b>
                <span>{error === "offline" ? "Connect to the internet to open it, or save the whole Bible in Settings while you’re online." : error}</span>
                <button className="btn" onClick={() => setReload((n) => n + 1)}>Try again</button>
              </div>
            : text?.code === s.book ? <div className="empty"><b>{book.local} has no chapter {s.chap}.</b></div>
            : <p className="loading" role="status">Loading {book.local}…</p>}
          <div className="pager">
            <button onClick={() => step(-1)} disabled={!prevLabel}><Icon n="l" />{prevLabel}</button>
            <button onClick={() => step(1)} disabled={!nextLabel}>{nextLabel}<Icon n="r" /></button>
          </div>
          <p className="hint keys">Use <kbd>←</kbd> <kbd>→</kbd> to change chapter.</p>
        </main>
      </div>

      {/* Floating buttons. Phones: the verse tools stack above Go to Scripture at the right edge. Tablet and desktop: the
          verse tools sit beside the selected verses (placed by placeTools), and the corner button stays in its corner.
          On phones and tablets the Go to Scripture button shows only when turned on in Settings. */}
      {(!panel || panel.name === "slides") && picked.length > 0 && near && (
        <div ref={toolsRef} className="actions near" role="toolbar" aria-label="Verse actions" aria-orientation="vertical">
            <span className="lab">{picked.length === 1 ? `v${parseKey(picked[0]).v}` : `${picked.length} verses`}</span>
            <button onClick={toggleHl} aria-pressed={allHl} aria-label="Highlight" title="Highlight"><Icon n="hl" /></button>
            <button onClick={() => setPanel({ name: "notes", edit: picked[0] })} disabled={picked.length > 1} aria-label="Note" title={picked.length > 1 ? "Note (one verse at a time)" : "Note"}><Icon n="note" /></button>
            <button onClick={toggleSave} aria-pressed={allSaved} aria-label={allSaved ? "Saved" : "Save"} title={allSaved ? "Saved" : "Save"}><Icon n="save" /></button>
            <button onClick={copy} aria-label="Copy" title="Copy"><Icon n="copy" /></button>
            <button onClick={sendPicked} aria-label="Send verse" title="Send verse"><Icon n="send" /></button>
            <button onClick={sharePicked} aria-label="Share with church" title="Share with church"><Icon n="share" /></button>
            <button className="mk-slides" onClick={() => addToSlides(passesOf(picked))} aria-label="Add to slides" title="Add to slides"><Icon n="slides" /></button>
        </div>
      )}
      {(!panel || panel.name === "slides") && (showGo || (picked.length > 0 && !near)) && (
        <div className="actions" role="toolbar" aria-label={picked.length && !near ? "Verse actions" : "Scripture slides"} aria-orientation="vertical">
          {picked.length > 0 && !near && <>
            <span className="lab">{picked.length === 1 ? `v${parseKey(picked[0]).v}` : `${picked.length} verses`}</span>
            <button onClick={toggleHl} aria-pressed={allHl} aria-label="Highlight" title="Highlight"><Icon n="hl" /></button>
            <button onClick={() => setPanel({ name: "notes", edit: picked[0] })} disabled={picked.length > 1} aria-label="Note" title={picked.length > 1 ? "Note (one verse at a time)" : "Note"}><Icon n="note" /></button>
            <button onClick={toggleSave} aria-pressed={allSaved} aria-label={allSaved ? "Saved" : "Save"} title={allSaved ? "Saved" : "Save"}><Icon n="save" /></button>
            <button onClick={copy} aria-label="Copy" title="Copy"><Icon n="copy" /></button>
            <button onClick={sendPicked} aria-label="Send verse" title="Send verse"><Icon n="send" /></button>
            <button onClick={sharePicked} aria-label="Share with church" title="Share with church"><Icon n="share" /></button>
            <button className="mk-slides" onClick={() => addToSlides(passesOf(picked))} aria-label="Add to slides" title="Add to slides"><Icon n="slides" /></button>
          </>}
          {showGo && <button className="go" aria-pressed={desk ? panel?.name === "slides" : undefined}
            onClick={() => (desk ? setPanel(panel?.name === "slides" ? null : { name: "slides" }) : openScripture(forSlides))}
            aria-label={`${desk ? "For slides" : "Go to Scripture"}${forSlides.length ? `, ${forSlides.length} passage${forSlides.length === 1 ? "" : "s"} waiting` : ""}`} title={desk ? "For slides" : "Go to Scripture"}>
            <Icon n="open" />{forSlides.length > 0 && <span className="badge" aria-hidden="true">{forSlides.length}</span>}
          </button>}
        </div>
      )}

      {nudges.length > 0 && <div className={`nudges${showGo ? " beside" : ""}`}>
        {nudges.map((n) => <button key={n.key} className="nudge" onClick={n.open}>{n.key === "shared" && <Icon n="shared" />}{n.label} &middot; {refLabel(n.found)}<Icon n="r" /></button>)}
      </div>}

      {panel && <Panels p={panel} setPanel={setPanel} books={books} s={s} update={update} sync={sync} go={go} say={say} refOf={refOf} textOf={textOf} current={text}
        churches={churches} shared={shared} clearPicked={() => setPicked([])}
        passLabel={passLabel} passesOf={passesOf} addToSlides={addToSlides} forSlides={forSlides} removeForSlides={removeForSlides} clearForSlides={clearForSlides} moveForSlides={moveForSlides} />}
      {toast && <div className={`toast${toast.open ? " act" : ""}`} role="status">{toast.m}{toast.open && <button onClick={() => { setToast(null); openScripture(forSlides); }}>Open Scripture</button>}</div>}
    </>
  );
}

// ---------- The passage: paragraphs as printed, section headings between them ----------
function Passage({ book, chap, ch, s, picked, onSelect }: { book: string; chap: number; ch: Chapter; s: State; picked: string[]; onSelect: (k: string) => void }) {
  const blocks = useMemo(() => {
    const out: ({ kind: "h"; text: string; sub: boolean } | { kind: "p"; verses: Chapter["verses"] })[] = [];
    let para: Chapter["verses"] | null = null;
    const heads = [...ch.headings].sort((a, b) => a.before - b.before || a.pos - b.pos);
    for (const v of ch.verses) {
      const hs = heads.filter((h) => h.before === v.v);
      for (const h of hs) { out.push({ kind: "h", text: h.text, sub: h.kind !== "heading" }); para = null; }
      if (!para || v.para) { para = []; out.push({ kind: "p", verses: para }); }
      para.push(v);
    }
    return out;
  }, [ch]);
  const key = (e: React.KeyboardEvent, k: string) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(k); } };
  return (
    <div className="passage">
      {blocks.map((b, i) => b.kind === "h"
        ? <h3 key={i} className={b.sub ? "sub" : undefined}>{b.text}</h3>
        : <p key={i}>{b.verses.map((v) => {
            const k = vkey(book, chap, v.v);
            const label = v.end ? `${v.v}–${v.end}` : String(v.v);
            return <span key={k}>
              <span id={`v${v.v}`} data-k={k} tabIndex={0} role="button"
                className={`v${s.hl[k] ? " hl" : ""}${picked.includes(k) ? " sel-on" : ""}`}
                aria-label={`Verse ${label}${s.saved[k] ? ", saved" : ""}${s.notes[k] ? ", has note" : ""}`}
                onClick={() => onSelect(k)} onKeyDown={(e) => key(e, k)}>
                <sup>{label}</sup>{v.text}
                {s.notes[k] && <span className="mk note" aria-hidden="true" />}
                {s.saved[k] && <span className="mk save" aria-hidden="true" />}
              </span>{" "}
            </span>;
          })}</p>)}
    </div>
  );
}

// ---------- Panels ----------
interface PanelProps {
  p: PanelState; setPanel: (p: PanelState | null) => void; books: Book[]; s: State; current: BookText | null;
  update: (fn: (p: State) => State) => void; go: (b: string, c: number, v?: number, v2?: number) => void; say: (m: string) => void;
  refOf: (k: string) => string; textOf: (k: string) => string;
  passLabel: (p: Pass) => string; passesOf: (keys: string[]) => Pass[]; addToSlides: (ps: Pass[]) => void;
  forSlides: Pass[]; removeForSlides: (i: number) => void; clearForSlides: () => void; moveForSlides: (i: number, d: -1 | 1) => void;
  sync: { session: Session | null; state: SyncState; savedAt: string | null };
  churches: ChurchChoice; shared: SharedData; clearPicked: () => void;
}
function Panels(props: PanelProps) {
  const { p, setPanel } = props;
  const close = () => setPanel(null);
  switch (p.name) {
    case "books": return <BooksPanel {...props} close={close} />;
    case "chapters": return <ChaptersPanel {...props} close={close} />;
    case "verses": return <VersesPanel {...props} close={close} />;
    case "saved": return <SavedPanel {...props} close={close} />;
    case "notes": return <NotesPanel {...props} close={close} />;
    case "settings": return <SettingsPanel {...props} close={close} />;
    case "search": return <SearchPanel {...props} close={close} />;
    case "share": return <SharePanel {...props} close={close} />;
    case "shared": return <SharedPanel {...props} close={close} />;
    case "slides": return <SlidesPanel {...props} close={close} />;
  }
}

// Shell: dims the reader, traps focus, closes with Escape, returns focus where it was
// Saved, Notes and Settings (drawer) open on the right on desktop, beside the passage, which stays visible and scrolls.
// On phones every panel is a bottom sheet over a dimmed reader.
const DESK = "(min-width: 900px)";
const NEAR_MQ = "(min-width: 768px)";
function Panel({ title, sub, wide, top, drawer: asDrawer, bodyClass, close, children }: { title: string; sub?: string; wide?: boolean; top?: boolean; drawer?: boolean; bodyClass?: string; close: () => void; children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  const [drawer] = useState(() => !!asDrawer && matchMedia(DESK).matches);
  useEffect(() => {
    const back = document.activeElement as HTMLElement | null;
    if (drawer) document.body.classList.add("drawer-open", ...(bodyClass ? [bodyClass] : [])); else document.body.style.overflow = "hidden";
    // Crossing the desktop width while open: close, so a drawer never turns into a sheet without its dimmer
    const mq = matchMedia(DESK);
    mq.addEventListener("change", close);
    return () => { document.body.classList.remove("drawer-open", ...(bodyClass ? [bodyClass] : [])); document.body.style.overflow = ""; mq.removeEventListener("change", close); back?.focus?.(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { (ref.current?.querySelector<HTMLElement>("[data-autofocus]") ?? ref.current?.querySelector<HTMLElement>(".ph .ib"))?.focus(); }, [title]);
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { e.stopPropagation(); close(); }
    if (e.key !== "Tab" || !ref.current || drawer) return;
    const f = [...ref.current.querySelectorAll<HTMLElement>("button:not(:disabled),input,select,textarea,[tabindex='0']")];
    if (!f.length) return;
    const a = f[0], z = f[f.length - 1];
    if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
    else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
  };
  return (
    <>
      {!drawer && <div className="scrim" onClick={close} />}
      <section ref={ref} className={`panel${wide ? " wide" : ""}${top ? " from-top" : ""}${drawer ? " drawer" : ""}`} role="dialog" aria-modal={!drawer} aria-labelledby="pTitle" onKeyDown={onKey}>
        <div className="ph">
          <div><h2 id="pTitle">{title}</h2>{sub && <div className="sub">{sub}</div>}</div>
          <button className="ib" aria-label="Close" onClick={close}><Icon n="x" /></button>
        </div>
        <div className="pb">{children}</div>
      </section>
    </>
  );
}

function Seg<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return <div className="seg" role="group" aria-label={label}>{options.map(([v, l]) => <button key={v} aria-pressed={value === v} onClick={() => onChange(v)}>{l}</button>)}</div>;
}

function BooksPanel({ books, s, setPanel, close }: PanelProps & { close: () => void }) {
  const [order, setOrder] = useState<"canon" | "alpha">("canon");
  const body = useRef<HTMLDivElement>(null);
  useEffect(() => { body.current?.querySelector('[aria-current="true"]')?.scrollIntoView({ block: "center" }); }, [order]);
  const list = (arr: Book[]) => <div className="books">{arr.map((b) => (
    <button key={b.code} className="book" aria-current={b.code === s.book} onClick={() => setPanel({ name: "chapters", book: b.code })}>
      <span><span className="bn">{b.local}</span>{b.local !== b.name && <span className="en">{b.name}</span>}</span><small>{b.chapters}</small>
    </button>))}</div>;
  const alpha = [...books].sort((a, b) => a.local.localeCompare(b.local, "vi"));
  return (
    <Panel title="Books" sub="Chapter count on the right" wide close={close}>
      <div ref={body}>
        <Seg label="Book order" value={order} options={[["canon", "Canonical"], ["alpha", "Alphabetical"]]} onChange={setOrder} />
        {order === "canon" ? <>
          <p className="testament">Old Testament</p>{list(books.filter((b) => b.testament === "OT"))}
          <p className="testament">New Testament</p>{list(books.filter((b) => b.testament === "NT"))}
        </> : <><p className="testament">All books</p>{list(alpha)}</>}
      </div>
    </Panel>
  );
}

function ChaptersPanel({ p, books, s, setPanel, close, go }: PanelProps & { close: () => void }) {
  const b = books.find((x) => x.code === p.book) ?? books[0];
  return (
    <Panel title={b.local} sub={b.local !== b.name ? `${b.name} · choose a chapter` : "Choose a chapter"} close={close}>
      <div className="grid" role="group" aria-label="Chapters">
        {Array.from({ length: b.chapters }, (_, i) => i + 1).map((c) => (
          <button key={c} aria-current={b.code === s.book && c === s.chap} onClick={() => setPanel({ name: "verses", book: b.code, chap: c })}>{c}</button>
        ))}
      </div>
      <div className="btns"><button className="btn" onClick={() => setPanel({ name: "books" })}>Books</button><button className="btn pri" onClick={() => go(b.code, b.code === s.book ? s.chap : 1)}>Read</button></div>
    </Panel>
  );
}

function VersesPanel({ p, books, setPanel, close, go }: PanelProps & { close: () => void }) {
  const b = books.find((x) => x.code === p.book) ?? books[0];
  const c = p.chap ?? 1;
  const [ch, setCh] = useState<Chapter | null | "error">(null);
  useEffect(() => { getBook(b.code).then((t) => setCh(t.chapters[c] ?? "error")).catch(() => setCh("error")); }, [b.code, c]);
  return (
    <Panel title={`${b.local} ${c}`} sub="Jump to a verse" close={close}>
      {ch === null ? <p className="hint" role="status">Loading verses…</p>
        : ch === "error" ? <p className="hint">The verse list needs this book on the device or an internet connection. You can still open the chapter.</p>
        : <div className="grid" role="group" aria-label="Verses">{ch.verses.map((v) => <button key={v.v} onClick={() => go(b.code, c, v.v)}>{v.end ? `${v.v}–${v.end}` : v.v}</button>)}</div>}
      <div className="btns"><button className="btn" onClick={() => setPanel({ name: "chapters", book: b.code })}>Chapters</button><button className="btn pri" onClick={() => go(b.code, c)}>Read from start</button></div>
    </Panel>
  );
}

// Open the Scripture page with these passages (it asks whether to add them to the study)
// The Scripture page picks up the waiting passages itself, however it is opened
function openScripture(list: Pass[]) { window.location.href = scriptureLink(list.map(toShared)); }

function SavedPanel(props: PanelProps & { close: () => void }) {
  const { s, update, go, close, passLabel, passesOf, addToSlides, forSlides, removeForSlides, clearForSlides } = props;
  const keys = Object.keys(s.saved).sort((a, b) => s.saved[b].at - s.saved[a].at);
  const list = forSlides;
  const sub = `${keys.length} saved verse${keys.length === 1 ? "" : "s"}${list.length ? ` · ${list.length} for slides` : ""}`;
  return (
    <Panel drawer title="Saved" sub={sub} close={close}>
      {list.length > 0 && <>
        <p className="testament">For slides ({list.length})</p>
        {list.map((ps, i) => (
          <div className="item" key={`${passLabel(ps)}-${i}`}>
            <div className="r"><b>{passLabel(ps)}</b>
              <button className="lnk" aria-label={`Remove ${passLabel(ps)} from the slide list`} onClick={() => removeForSlides(i)}>Remove</button></div>
          </div>))}
        <div className="btns">
          <button className="btn" onClick={clearForSlides}>Clear list</button>
          <button className="btn pri" onClick={() => openScripture(list)}>Open in Scripture</button>
        </div>
      </>}
      {keys.length > 0 && list.length > 0 && <p className="testament">Saved verses</p>}
      {keys.length ? <>
        {keys.map((k) => { const m = s.saved[k]; const { b, c, v } = parseKey(k); return (
          <div className="item" key={k}>
            <div className="r"><b>{m.ref}</b><span>
              <button className="lnk" onClick={() => go(b, c, v)}>Read</button>
              <button className="lnk" aria-label={`Remove ${m.ref} from Saved`} onClick={() => update((p) => { const saved = { ...p.saved }; delete saved[k]; return { ...p, saved }; })}>Remove</button>
            </span></div>
            <p>{m.text}</p>
          </div>); })}
        <div className="btns"><button className="btn" onClick={() => addToSlides(passesOf(keys))}><Icon n="slides" />Add saved verses to slides</button></div>
      </> : !list.length && <div className="none">No saved verses yet.<br />Tap a verse, then choose Save.</div>}
    </Panel>
  );
}

// For slides (desktop drawer): the passages waiting for the Scripture page, in slide order, beside the text. The verse
// tools stay usable while it is open, so passages can be added while reading; the list updates in place.
function SlidesPanel({ forSlides, passLabel, moveForSlides, removeForSlides, clearForSlides, close }: PanelProps & { close: () => void }) {
  // The first words of each passage, from the books saved on this device (or fetched once)
  const [texts, setTexts] = useState<Record<string, string>>({});
  const codes = forSlides.map((x) => `${x.b}|${x.c}|${x.v1}|${x.v2}`).join(",");
  useEffect(() => {
    let live = true;
    for (const x of forSlides) {
      const k = `${x.b}|${x.c}|${x.v1}|${x.v2}`;
      getBook(x.b).then((bk) => {
        const t = (bk.chapters[x.c]?.verses ?? []).filter((v) => (v.end ?? v.v) >= x.v1 && v.v <= x.v2).map((v) => v.text).join(" ");
        if (live) setTexts((cur) => (cur[k] === t ? cur : { ...cur, [k]: t }));
      }).catch(() => {});
    }
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codes]);
  const n = forSlides.length;
  return (
    <Panel drawer bodyClass="slides-open" title="For slides" sub={n ? `${n} passage${n === 1 ? "" : "s"} · in this order on the Scripture page` : undefined} close={close}>
      {n ? <>
        <ol className="fs-list">
          {forSlides.map((x, i) => { const label = passLabel(x); return (
            <li className="fs-item" key={`${label}-${i}`}>
              <div className="fs-main">
                <div className="r"><b>{label}</b><small className="cnt">{x.v2 - x.v1 + 1} verse{x.v2 > x.v1 ? "s" : ""}</small></div>
                <p>{texts[`${x.b}|${x.c}|${x.v1}|${x.v2}`] ?? "\u00a0"}</p>
              </div>
              <div className="fs-ctl">
                <button className="ib sm" onClick={() => moveForSlides(i, -1)} disabled={i === 0} aria-label={`Move ${label} up`}><Icon n="up" /></button>
                <button className="ib sm" onClick={() => moveForSlides(i, 1)} disabled={i === n - 1} aria-label={`Move ${label} down`}><Icon n="dn" /></button>
                <button className="ib sm" onClick={() => removeForSlides(i)} aria-label={`Remove ${label}`}><Icon n="x" /></button>
              </div>
            </li>); })}
        </ol>
        <div className="fs-foot">
          <button className="btn" onClick={clearForSlides}>Clear</button>
          <button className="btn pri" onClick={() => openScripture(forSlides)}><Icon n="open" />Open in Scripture</button>
        </div>
      </> : <div className="none">Nothing for slides yet.<br />Select verses, then tap the slides button <span className="inl"><Icon n="slides" /></span>.<br />They’ll collect here while you read.</div>}
    </Panel>
  );
}

function NotesPanel({ p, s, update, go, setPanel, close, say, refOf, textOf }: PanelProps & { close: () => void }) {
  const edit = p.edit;
  const [draft, setDraft] = useState(edit ? s.notes[edit]?.note ?? "" : "");
  const keys = Object.keys(s.notes).filter((k) => k !== edit).sort((a, b) => s.notes[b].at - s.notes[a].at);
  const total = Object.keys(s.notes).length;
  const remove = (k: string) => update((st) => { const notes = { ...st.notes }; delete notes[k]; return { ...st, notes }; });
  const saveNote = () => {
    if (!edit) return;
    const t = draft.trim();
    update((st) => { const notes = { ...st.notes }; if (t) notes[edit] = { ref: st.notes[edit]?.ref ?? refOf(edit), text: st.notes[edit]?.text ?? textOf(edit), note: t, at: Date.now() }; else delete notes[edit]; return { ...st, notes }; });
    say(t ? "Note saved" : "Note removed");
    setPanel({ name: "notes" });
  };
  return (
    <Panel drawer title="Notes" sub={`${total} note${total === 1 ? "" : "s"}`} close={close}>
      {edit && <div className="item">
        <div className="r"><b>{s.notes[edit]?.ref ?? refOf(edit)}</b></div>
        <p>{s.notes[edit]?.text ?? textOf(edit)}</p>
        <label className="sr" htmlFor="noteText">Note</label>
        <textarea id="noteText" data-autofocus value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Write a note" />
        <div className="btns">
          {s.notes[edit] && <button className="btn" onClick={() => { remove(edit); setPanel({ name: "notes" }); }}>Remove note</button>}
          <button className="btn pri" onClick={saveNote}>Save note</button>
        </div>
      </div>}
      {keys.map((k) => { const n = s.notes[k]; const { b, c, v } = parseKey(k); return (
        <div className="item" key={k}>
          <div className="r"><b>{n.ref}</b><span>
            <button className="lnk" onClick={() => go(b, c, v)}>Read</button>
            <button className="lnk" onClick={() => setPanel({ name: "notes", edit: k })}>Edit</button>
            <button className="lnk" aria-label={`Remove note on ${n.ref}`} onClick={() => remove(k)}>Remove</button>
          </span></div>
          <p>{n.text}</p>
          <div className="note">{n.note}</div>
        </div>); })}
      {!edit && !keys.length && <div className="none">No notes yet.<br />Tap a verse, then choose Note.</div>}
    </Panel>
  );
}

// "Nau Ntơm 1:1–2", or "Nau Mprơ Ơm 23" for a whole chapter
const refLabel = ({ book, chap, v1, v2 }: Found) => `${book.local} ${chap}${v1 === null ? "" : `:${v1}${v2 === 999 ? " onwards" : v2! > v1 ? `–${v2}` : ""}`}`;

// Search: a reference ("Nau Ntơm 1:1", "John 3:16") opens that passage; anything else is looked for in the text
function SearchPanel({ books, go, close }: PanelProps & { close: () => void }) {
  const [q, setQ] = useState("");
  const [result, setResult] = useState<(SearchResult & { q: string }) | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const run = useRef(0);   // only the latest search may show its result
  const refs = parseReference(q, books);
  const open = (f: Found) => go(f.book.code, f.chap, f.v1 ?? undefined, f.v2 ?? undefined);
  const type = (v: string) => { setQ(v); run.current++; setResult(null); setBusy(false); setFailed(false); };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (refs.length) { if (refs.length === 1) open(refs[0]); return; }
    const phrase = tidy(q);
    if (phrase.length < 2) return;
    const n = ++run.current;
    setBusy(true); setFailed(false);
    try { const r = await searchBible(phrase, books); if (n === run.current) setResult({ ...r, q: phrase }); }
    catch { if (n === run.current) setFailed(true); }
    if (n === run.current) setBusy(false);
  };
  const name = (code: string) => books.find((x) => x.code === code)?.local ?? code;
  return (
    <Panel title="Search" sub="A reference, or words from a verse" wide top close={close}>
      <form className="search-form" role="search" onSubmit={submit}>
        <label className="sr" htmlFor="searchText">Search the Bible</label>
        <input id="searchText" data-autofocus type="search" enterKeyHint="search" autoComplete="off" autoCapitalize="off" spellCheck={false}
          placeholder="John 3:16, or brah ndu" value={q} onChange={(e) => type(e.target.value)} />
        <button type="submit" className="btn pri">Search</button>
      </form>
      {refs.map((f) => <button key={f.book.code} className="hit" onClick={() => open(f)}><b>{refLabel(f)}</b><span>Open this passage</span></button>)}
      {busy && <p className="hint" role="status">Searching…</p>}
      {failed && <p className="hint" role="alert">The search didn’t finish. Try again.</p>}
      {result && !refs.length && <>
        <p className="hint" role="status">
          {result.hits.length ? (result.more ? `First ${SEARCH_LIMIT} verses with “${result.q}”. Add more words to narrow it.` : `${result.hits.length} verse${result.hits.length === 1 ? "" : "s"} with “${result.q}”`) : `No verse has “${result.q}”. Check the spelling and accents.`}
          {result.searched !== null && ` Searched only the ${result.searched} book${result.searched === 1 ? "" : "s"} saved on this device.`}
        </p>
        {result.hits.map((h) => <button key={`${h.b}|${h.c}|${h.v}`} className="hit" onClick={() => go(h.b, h.c, h.v)}>
          <b>{name(h.b)} {h.c}:{h.v}{h.end ? `–${h.end}` : ""}</b><span className="tx">{h.text}</span></button>)}
      </>}
    </Panel>
  );
}

function ChurchSelect({ id, label, none, value, list, onChange }: { id: string; label: string; none: string; value: ChurchChoice["church"]; list: ChurchChoice["list"]; onChange: (c: ChurchChoice["church"]) => void }) {
  // The chosen church stays listed when the list couldn't load (offline)
  const all = value && !list?.some((c) => c.id === value.id) ? [value, ...(list ?? [])] : list ?? [];
  return (
    <>
      <label className="sr" htmlFor={id}>{label}</label>
      <select id={id} className="select" value={value?.id ?? ""} onChange={(e) => onChange(all.find((c) => c.id === e.target.value) ?? null)}>
        <option value="">{all.length ? none : "Needs a connection"}</option>
        {all.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
    </>
  );
}

// Share with church: shows which church will see the verse before anything is posted
function SharePanel({ p, sync, churches, shared, passLabel, textOf, say, clearPicked, close }: PanelProps & { close: () => void }) {
  const pass = p.pass!;
  const uid = sync.session?.user.id ?? null;
  // Only a church the person belongs to can be shared to
  const [mine, setMine] = useState<{ uid: string; list: ChurchChoice["list"]; error: string | null } | null>(null);
  const [again, setAgain] = useState(0);
  useEffect(() => {
    if (!uid) return;
    let live = true;
    void loadMyChurches().then((r) => { if (live) setMine({ uid, list: "churches" in r ? r.churches : null, error: "error" in r ? r.error : null }); });
    return () => { live = false; };
  }, [uid, again]);
  const own = mine && mine.uid === uid ? mine : null;
  const [picked, setPicked] = useState<ChurchChoice["church"] | undefined>(undefined);   // undefined: not changed here
  const audience = picked === undefined ? shareAudience(churches.church, own?.list ?? []) : picked;
  const [typed, setTyped] = useState<string | null>(null);
  const meta = sync.session?.user.user_metadata as { full_name?: string; name?: string } | undefined;
  const name = typed ?? ((uid && rememberedName(uid)) || meta?.full_name || meta?.name || "");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  // The words as they were selected (the first verse's number is enough to find each)
  const words = Array.from({ length: pass.v2 - pass.v1 + 1 }, (_, i) => textOf(vkey(pass.b, pass.c, pass.v1 + i))).filter(Boolean).join(" ");
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uid || busy) return;
    if (!audience) { setMsg("Choose the church that will see this."); return; }
    if (!name.trim()) { setMsg("Add your name, so people know who shared it."); return; }
    if (!navigator.onLine) { setMsg("You’re offline. Connect to share."); return; }
    setBusy(true); setMsg(null);
    const error = await postShare({ church_id: audience.id, sharer_name: name.trim(), book_code: pass.b, chapter: pass.c, verse_from: pass.v1, verse_to: pass.v2, note: note.trim() });
    setBusy(false);
    if (error) { setMsg(error); return; }
    rememberName(uid, name.trim());
    shared.reload(); clearPicked(); close(); say(`Shared with ${audience.name}`);
  };
  return (
    <Panel title="Share with church" sub={passLabel(pass)} top close={close}>
      <div className="item"><p className="clip">{words}</p></div>
      {!sync.session ? <Backup sync={sync} title="Sign in to share" intro="Only people who belong to a church can share. Signing in also keeps a copy of your highlights, saved verses and notes on your account." />
        : !own ? <p className="hint" role="status">Checking your church…</p>
        : own.error ? <div className="none" role="alert">{own.error}<div className="btns mid"><button className="btn" onClick={() => { setMine(null); setAgain((n) => n + 1); }}>Try again</button></div></div>
        : !own.list?.length ? <div className="none">Only people who belong to a church can share.<br />Ask a church admin to add you on the Team page.</div>
        : <form className="share-form" onSubmit={submit}>
          <span className="k" aria-hidden="true">Church</span>
          <ChurchSelect id="share-church" label="Church that will see this" none="Choose a church" value={audience} list={own.list} onChange={setPicked} />
          {churches.church && !own.list.some((c) => c.id === churches.church!.id) && <p className="hint">You don’t belong to {churches.church.name}, so you can’t share to it.</p>}
          {audience && <p className="hint">Anyone who opens this Bible and chooses <b>{audience.name}</b> will see the verse, your name and your note.</p>}
          <label className="k" htmlFor="share-name">Your name</label>
          <input id="share-name" value={name} maxLength={60} onChange={(e) => setTyped(e.target.value)} autoComplete="name" />
          <label className="k" htmlFor="share-note">Note (optional)</label>
          <textarea id="share-note" value={note} maxLength={NOTE_MAX} onChange={(e) => setNote(e.target.value)} />
          {msg && <p className="hint" role="alert">{msg}</p>}
          <div className="btns"><button type="button" className="btn" onClick={close}>Cancel</button><button type="submit" className="btn pri" disabled={busy || !audience}>{busy ? "Sharing…" : "Share"}</button></div>
        </form>}
    </Panel>
  );
}

function SharedPanel(props: PanelProps & { close: () => void }) {
  return <Panel drawer title="Shared verses" sub={props.churches.church?.name} close={props.close}><SharedList {...props} /></Panel>;
}

// The church's shared verses, newest first, and what you shared yourself
function SharedList({ churches, shared, books, go, sync, passLabel, say }: PanelProps) {
  const church = churches.church;
  const signedIn = !!sync.session;
  const [view, setView] = useState<"church" | "me">("church");
  const mineView = signedIn && view === "me";
  const rows: (MyShare & { mine?: boolean; can_remove?: boolean })[] | null = mineView
    ? shared.mine
    : church && shared.rows ? shared.rows.map((r) => ({ ...r, church_id: church.id })) : null;
  const error = mineView ? shared.mineError : shared.error;
  // Looking at the church's list is what clears the "new" dot
  const { markSeen } = shared;
  useEffect(() => { if (!mineView) markSeen(); }, [mineView, markSeen]);
  // The first words of each verse, from the books saved on this device (or fetched once)
  const [texts, setTexts] = useState<Record<string, BookText>>({});
  const codes = [...new Set(rows?.map((r) => r.book_code))].filter((c) => books.some((b) => b.code === c)).join(",");
  useEffect(() => {
    let live = true;
    for (const code of codes ? codes.split(",") : []) void getBook(code).then((t) => { if (live) setTexts((cur) => ({ ...cur, [code]: t })); }).catch(() => {});
    return () => { live = false; };
  }, [codes]);
  const churchName = (id: string) => churches.list?.find((c) => c.id === id)?.name ?? "a church";
  const remove = async (r: MyShare) => {
    if (!window.confirm(`Remove this shared verse from ${churchName(r.church_id)}?`)) return;
    const failed = await removeShare(r.id);
    if (failed) say(failed); else shared.drop(r.id);
  };
  const list = () => {
    if (!mineView && !church) return <>
      <div className="none">Choose your church to see the verses shared with it.</div>
      <ChurchSelect id="shared-church" label="Your church" none="Choose a church" value={null} list={churches.list} onChange={churches.choose} />
    </>;
    if (!rows) return error
      ? <div className="none" role="alert">{error}<div className="btns mid"><button className="btn" onClick={shared.reload}>Try again</button></div></div>
      : <p className="hint" role="status">Loading shared verses…</p>;
    const known = rows.filter((r) => books.some((b) => b.code === r.book_code));
    if (!known.length) return mineView ? <div className="none">You haven’t shared any verses yet.</div>
      : <div className="none">Nothing shared yet.<br />Select verses, then tap the share button <span className="inl"><Icon n="share" /></span>.</div>;
    return <>{known.map((r) => {
      const label = passLabel({ b: r.book_code, c: r.chapter, v1: r.verse_from, v2: r.verse_to });
      const words = versesInRange(texts[r.book_code]?.chapters[r.chapter]?.verses ?? [], r.verse_from, r.verse_to).map((v) => v.text).join(" ");
      const when = new Date(r.created_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
      return (
        <div className="shared" key={r.id}>
          <button className="hit" onClick={() => go(r.book_code, r.chapter, r.verse_from, r.verse_to)}>
            <b>{label}</b>
            {words && <span className="tx two">{words}</span>}
            {r.note && <span className="nt">{r.note}</span>}
            <span>{mineView ? `To ${churchName(r.church_id)}` : r.mine ? <strong>You</strong> : r.sharer_name} · {when}</span>
          </button>
          {(mineView || r.can_remove) && <button className="lnk" aria-label={`Remove ${label} shared by ${mineView || r.mine ? "you" : r.sharer_name}`} onClick={() => void remove(r)}>Remove</button>}
        </div>);
    })}</>;
  };
  return <>
    {signedIn && <div className="views"><Seg label="Whose shares" value={view} options={[["church", "From church"], ["me", "Shared by me"]]} onChange={setView} /></div>}
    {list()}
  </>;
}

// Settings: keep highlights, saved verses and notes on your account (sign in), so they survive a new phone
function Backup({ sync, title = "Backup", intro = "Highlights, saved verses and notes are kept on this phone. Sign in to keep a copy on your account too." }: { sync: PanelProps["sync"]; title?: string; intro?: string }) {
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const signIn = async (create: boolean) => {
    if (!supabase) return;
    if (!email.trim() || pass.length < 6) { setMsg("Enter your email and a password of at least 6 characters."); return; }
    const creds = { email: email.trim(), password: pass };
    const { data, error } = create ? await supabase.auth.signUp(creds) : await supabase.auth.signInWithPassword(creds);
    if (error) { setMsg(/invalid login/i.test(error.message) ? "That email and password don’t match. Check them and try again." : "Signing in didn’t work. Check the connection and try again."); return; }
    if (create && !data.session) { setMsg("Account made. Check your email to confirm it, then sign in here."); return; }
    setPass(""); setMsg(null); setOpen(false);
  };
  if (!supabase) return null;
  const when = sync.savedAt ? new Date(sync.savedAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "";
  if (sync.session) {
    const line = sync.state === "syncing" ? "Saving to your account…"
      : sync.state === "offline" ? "Offline. Changes stay on this device and are saved when you’re back online."
      : sync.state === "missing" ? "Backup isn’t switched on yet. Ask the person who looks after the app."
      : sync.state === "error" ? "Couldn’t save to your account just now. It will try again."
      : `Saved to your account${when ? ` · ${when}` : ""}. Sign in on another phone to see them there.`;
    return (
      <div className="row"><div><div className="k">Backup</div><div className="d">{sync.session.user.email}<br />{line}</div></div>
        <button className="btn" onClick={() => void supabase?.auth.signOut()}>Sign out</button></div>
    );
  }
  return (
    <div className="row backup"><div><div className="k">{title}</div><div className="d">{intro}</div></div>
      {!open ? <button className="btn" onClick={() => setOpen(true)}>Sign in</button> : (
        <form className="backup-form" onSubmit={(e) => { e.preventDefault(); void signIn(false); }}>
          <label className="sr" htmlFor="bk-email">Email</label>
          <input id="bk-email" type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          <label className="sr" htmlFor="bk-pass">Password</label>
          <input id="bk-pass" type="password" placeholder="Password (6+ characters)" value={pass} onChange={(e) => setPass(e.target.value)} autoComplete="current-password" />
          <div className="backup-acts">
            <button type="submit" className="btn pri">Sign in</button>
            <button type="button" className="btn" onClick={() => void signIn(true)}>Create account</button>
          </div>
          {msg && <p className="hint" role="alert">{msg}</p>}
        </form>
      )}
    </div>
  );
}

function SettingsPanel({ s, update, close, sync, books, current, churches }: PanelProps & { close: () => void }) {
  const dark = s.theme ? s.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
  const [saved, setSaved] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // Whether the open book is one of the saved ones (checked again as books arrive)
  const [hereSaved, setHereSaved] = useState<boolean | null>(null);
  useEffect(() => { void savedBook(s.book).then((b) => setHereSaved(!!b)); }, [s.book, saved, current]);
  const stop = useRef(false);
  useEffect(() => { savedBookCodes().then((c) => setSaved(c.length)); return () => { stop.current = true; }; }, []);
  const download = async () => {
    setBusy(true); setErr(null); stop.current = false;
    try { await saveWholeBible((d) => setSaved(d), () => stop.current); }
    catch (e) { setErr((e as Error).message === "offline" ? "You’re offline. Connect and try again; books already saved stay saved." : (e as Error).message); }
    setBusy(false);
  };
  return (
    <Panel drawer title="Settings" close={close}>
      <div className="row"><div><div className="k">Appearance</div><div className="d">{s.theme ? "Set here" : "Following your device"}</div></div>
        <Seg label="Appearance" value={dark ? "dark" : "light"} options={[["light", "Light"], ["dark", "Dark"]]} onChange={(v) => update((p) => ({ ...p, theme: v }))} /></div>
      <div className="row"><div className="k">Text size</div>
        <Seg label="Text size" value={s.size} options={[["s", "Small"], ["m", "Medium"], ["l", "Large"]]} onChange={(v) => update((p) => ({ ...p, size: v }))} /></div>
      <div className="row"><div className="k">Line spacing</div>
        <Seg label="Line spacing" value={s.leading} options={[["compact", "Compact"], ["normal", "Normal"], ["relaxed", "Relaxed"]]} onChange={(v) => update((p) => ({ ...p, leading: v }))} /></div>
      {!matchMedia(DESK).matches && <div className="row"><div><div className="k">Go to Scripture button</div><div className="d">The round button for slides</div></div>
        <Seg label="Go to Scripture button" value={s.goScripture ? "show" : "hide"} options={[["show", "Show"], ["hide", "Hide"]]} onChange={(v) => update((p) => ({ ...p, goScripture: v === "show" }))} /></div>}
      <div className="row"><div><div className="k">Your church</div><div className="d">For the service reading and shared verses. Nau Mpro on this browser uses the same choice.</div></div>
        <ChurchSelect id="set-church" label="Your church" none="No church" value={churches.church} list={churches.list} onChange={churches.choose} /></div>
      <div className="row"><div><div className="k">Offline reading</div>
        <div className="d">{saved === null ? "Checking…" : saved >= 66 ? "The whole Bible is saved on this device." : `${saved} of 66 books saved on this device.`}
          {saved !== null && saved < 66 && hereSaved !== null && <><br />{books.find((x) => x.code === s.book)?.local} (open now) is {hereSaved ? "saved" : "not saved yet"}.</>}{err && <><br />{err}</>}</div></div>
        {saved !== null && saved < 66 && (busy
          ? <button className="btn" onClick={() => { stop.current = true; }}>Stop</button>
          : <button className="btn pri" onClick={download}>Save all</button>)}
      </div>
      {busy && <progress className="prog" max={66} value={saved ?? 0} aria-label="Books saved" />}
      <Backup sync={sync} />
      <p className="hint">Books you open are saved automatically. Nau Brah Ndu Ngơi: the Bunong Bible (Vietnam dialect).</p>
    </Panel>
  );
}
