// Bunong Bible reader (/bible/). Design approved from the sample in bible-pwa/sample/index.html.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { getBook, localBooks, refreshBookNames, saveWholeBible, savedBookCodes, type Book, type BookText, type Chapter } from "./data";

// ---------- Stored on this device ----------
type Size = "s" | "m" | "l";
type Leading = "compact" | "normal" | "relaxed";
interface Mark { ref: string; text: string; at: number }          // a saved verse: reference and text as shown
interface Note extends Mark { note: string }
interface State {
  book: string; chap: number;
  hl: Record<string, 1>; saved: Record<string, Mark>; notes: Record<string, Note>;
  size: Size; leading: Leading; theme: "light" | "dark" | null;
}
const KEY = "bible.reader.v1";
const DEFAULTS: State = { book: "GEN", chap: 1, hl: {}, saved: {}, notes: {}, size: "m", leading: "normal", theme: null };
function loadState(): State { try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || "{}") }; } catch { return DEFAULTS; } }
const SIZES: Record<Size, string> = { s: "1.0625rem", m: "1.25rem", l: "1.5rem" };
const LEAD: Record<Leading, number> = { compact: 1.55, normal: 1.75, relaxed: 2 };

// A verse key: BOOK|chapter|verse
const vkey = (b: string, c: number, v: number) => `${b}|${c}|${v}`;
const parseKey = (k: string) => { const [b, c, v] = k.split("|"); return { b, c: +c, v: +v }; };

// ---------- Icons ----------
const PATHS: Record<string, ReactNode> = {
  home: <><path d="M4 11 12 4l8 7" /><path d="M6 10v10h12V10" /></>,
  save: <path d="M7 4h10v16l-5-4-5 4z" />,
  note: <><path d="M5 4h10l4 4v12H5z" /><path d="M9 12h6M9 16h4" /></>,
  set: <><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></>,
  down: <path d="m6 9 6 6 6-6" />,
  x: <path d="M6 6l12 12M18 6 6 18" />,
  hl: <><path d="m14 4 6 6-9 9H5v-6z" /><path d="M4 21h16" /></>,
  copy: <><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" /></>,
  l: <path d="m15 6-6 6 6 6" />,
  r: <path d="m9 6 6 6-6 6" />,
};
const Icon = ({ n }: { n: string }) => <svg viewBox="0 0 24 24" aria-hidden="true">{PATHS[n]}</svg>;

type PanelName = "books" | "chapters" | "verses" | "saved" | "notes" | "settings";
interface PanelState { name: PanelName; book?: string; chap?: number; edit?: string }

export default function Bible() {
  const [s, setS] = useState<State>(loadState);
  const [books, setBooks] = useState<Book[]>(localBooks);
  const [text, setText] = useState<BookText | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [panel, setPanel] = useState<PanelState | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [jump, setJump] = useState<number | null>(null);
  const [reload, setReload] = useState(0);
  const toastTimer = useRef(0);

  const update = useCallback((fn: (p: State) => State) => setS((p) => fn(p)), []);
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
  const say = (m: string) => { setToast(m); window.clearTimeout(toastTimer.current); toastTimer.current = window.setTimeout(() => setToast(null), 1800); };
  const refOf = (k: string) => { const { b, c, v } = parseKey(k); const bk = books.find((x) => x.code === b); const vs = text?.code === b ? text.chapters[c]?.verses.find((x) => x.v === v) : undefined; return `${bk?.local ?? b} ${c}:${v}${vs?.end ? `–${vs.end}` : ""}`; };
  const textOf = (k: string) => { const { b, c, v } = parseKey(k); return (text?.code === b ? text.chapters[c]?.verses.find((x) => x.v === v)?.text : undefined) ?? s.saved[k]?.text ?? s.notes[k]?.text ?? ""; };

  const go = useCallback((b: string, c: number, v?: number) => {
    setSel(null); setPanel(null);
    update((p) => ({ ...p, book: b, chap: c }));
    if (v) setJump(v); else window.scrollTo(0, 0);
  }, [update]);

  // After a verse jump, scroll to it once the chapter is on screen
  useEffect(() => {
    if (!jump || !chapter) return;
    const el = document.getElementById(`v${jump}`);
    if (el) {
      el.scrollIntoView({ block: "center", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
      el.focus({ preventScroll: true });
      setSel(el.dataset.k ?? null);
    }
    setJump(null);
  }, [jump, chapter]);

  // Previous and next chapter, across books
  const step = (d: 1 | -1) => {
    const i = books.findIndex((b) => b.code === s.book);
    if (d === 1) { if (s.chap < book.chapters) go(s.book, s.chap + 1); else if (books[i + 1]) go(books[i + 1].code, 1); }
    else if (s.chap > 1) go(s.book, s.chap - 1); else if (books[i - 1]) go(books[i - 1].code, books[i - 1].chapters);
  };
  const prevLabel = s.chap > 1 ? `Chapter ${s.chap - 1}` : books[books.indexOf(book) - 1]?.local;
  const nextLabel = s.chap < book.chapters ? `Chapter ${s.chap + 1}` : books[books.indexOf(book) + 1]?.local;

  // Verse actions
  const toggleHl = () => { if (!sel) return; const on = !s.hl[sel]; update((p) => { const hl = { ...p.hl }; if (on) hl[sel] = 1; else delete hl[sel]; return { ...p, hl }; }); say(on ? "Highlighted" : "Highlight removed"); };
  const toggleSave = () => { if (!sel) return; const on = !s.saved[sel]; update((p) => { const saved = { ...p.saved }; if (on) saved[sel] = { ref: refOf(sel), text: textOf(sel), at: Date.now() }; else delete saved[sel]; return { ...p, saved }; }); say(on ? "Saved" : "Removed from Saved"); };
  const copy = async () => {
    if (!sel) return;
    const str = `${textOf(sel)} (${refOf(sel)})`;
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

  // Clear the selection on a click outside the passage, or with Escape
  useEffect(() => {
    const click = (e: MouseEvent) => { if (sel && !(e.target as Element).closest(".v,.actions,.panel,.scrim")) setSel(null); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape" && !panel && sel) setSel(null); };
    document.addEventListener("click", click); document.addEventListener("keydown", key);
    return () => { document.removeEventListener("click", click); document.removeEventListener("keydown", key); };
  }, [sel, panel]);

  return (
    <>
      <header>
        <div className="wrap bar">
          <div className="sel">
            <button className="pill" onClick={() => setPanel({ name: "books" })} aria-haspopup="dialog" aria-label={`Book: ${book.local}`}><span className="bk">{book.local}</span><Icon n="down" /></button>
            <button className="pill" onClick={() => setPanel({ name: "chapters", book: s.book })} aria-haspopup="dialog" aria-label={`Chapter ${s.chap}`}><span>{s.chap}</span><Icon n="down" /></button>
          </div>
          <nav className="icons" aria-label="Reader tools">
            <button className="ib" aria-label="Home: back to the passage" onClick={() => { setPanel(null); setSel(null); window.scrollTo({ top: 0 }); }}><Icon n="home" /></button>
            <button className="ib" aria-label="Saved verses" aria-haspopup="dialog" onClick={() => setPanel({ name: "saved" })}><Icon n="save" /></button>
            <button className="ib" aria-label="Notes" aria-haspopup="dialog" onClick={() => setPanel({ name: "notes" })}><Icon n="note" /></button>
            <button className="ib" aria-label="Settings" aria-haspopup="dialog" onClick={() => setPanel({ name: "settings" })}><Icon n="set" /></button>
          </nav>
        </div>
      </header>

      <div className="wrap">
        <p className="title">Scripture</p>
        <main>
          <p className="ref">{book.local} &middot; Chapter {s.chap}</p>
          {chapter ? <Passage book={s.book} chap={s.chap} ch={chapter} s={s} sel={sel} onSelect={(k) => setSel((p) => (p === k ? null : k))} />
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

      {sel && !panel && (
        <div className="actions" role="toolbar" aria-label="Verse actions" aria-orientation="vertical">
          <span className="lab">v{parseKey(sel).v}</span>
          <button onClick={toggleHl} aria-pressed={!!s.hl[sel]} aria-label="Highlight" title="Highlight"><Icon n="hl" /></button>
          <button onClick={() => setPanel({ name: "notes", edit: sel })} aria-label="Note" title="Note"><Icon n="note" /></button>
          <button onClick={toggleSave} aria-pressed={!!s.saved[sel]} aria-label={s.saved[sel] ? "Saved" : "Save"} title={s.saved[sel] ? "Saved" : "Save"}><Icon n="save" /></button>
          <button onClick={copy} aria-label="Copy" title="Copy"><Icon n="copy" /></button>
        </div>
      )}

      {panel && <Panels p={panel} setPanel={setPanel} books={books} s={s} update={update} go={go} say={say} refOf={refOf} textOf={textOf} current={text} />}
      {toast && <div className="toast" role="status">{toast}</div>}
    </>
  );
}

// ---------- The passage: paragraphs as printed, section headings between them ----------
function Passage({ book, chap, ch, s, sel, onSelect }: { book: string; chap: number; ch: Chapter; s: State; sel: string | null; onSelect: (k: string) => void }) {
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
                className={`v${s.hl[k] ? " hl" : ""}${sel === k ? " sel-on" : ""}`}
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
  update: (fn: (p: State) => State) => void; go: (b: string, c: number, v?: number) => void; say: (m: string) => void;
  refOf: (k: string) => string; textOf: (k: string) => string;
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
  }
}

// Shell: dims the reader, traps focus, closes with Escape, returns focus where it was
// Saved, Notes and Settings (drawer) open on the right on desktop, beside the passage, which stays visible and scrolls.
// On phones every panel is a bottom sheet over a dimmed reader.
const DESK = "(min-width: 900px)";
function Panel({ title, sub, wide, drawer: asDrawer, close, children }: { title: string; sub?: string; wide?: boolean; drawer?: boolean; close: () => void; children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  const [drawer] = useState(() => !!asDrawer && matchMedia(DESK).matches);
  useEffect(() => {
    const back = document.activeElement as HTMLElement | null;
    if (drawer) document.body.classList.add("drawer-open"); else document.body.style.overflow = "hidden";
    // Crossing the desktop width while open: close, so a drawer never turns into a sheet without its dimmer
    const mq = matchMedia(DESK);
    mq.addEventListener("change", close);
    return () => { document.body.classList.remove("drawer-open"); document.body.style.overflow = ""; mq.removeEventListener("change", close); back?.focus?.(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { (ref.current?.querySelector<HTMLElement>("[data-autofocus]") ?? ref.current?.querySelector<HTMLElement>(".ph .ib"))?.focus(); }, [title]);
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { e.stopPropagation(); close(); }
    if (e.key !== "Tab" || !ref.current || drawer) return;
    const f = [...ref.current.querySelectorAll<HTMLElement>("button:not(:disabled),textarea,[tabindex='0']")];
    if (!f.length) return;
    const a = f[0], z = f[f.length - 1];
    if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
    else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
  };
  return (
    <>
      {!drawer && <div className="scrim" onClick={close} />}
      <section ref={ref} className={`panel${wide ? " wide" : ""}${drawer ? " drawer" : ""}`} role="dialog" aria-modal={!drawer} aria-labelledby="pTitle" onKeyDown={onKey}>
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

function SavedPanel({ s, update, go, close }: PanelProps & { close: () => void }) {
  const keys = Object.keys(s.saved).sort((a, b) => s.saved[b].at - s.saved[a].at);
  return (
    <Panel drawer title="Saved" sub={`${keys.length} saved verse${keys.length === 1 ? "" : "s"}`} close={close}>
      {keys.length ? keys.map((k) => { const m = s.saved[k]; const { b, c, v } = parseKey(k); return (
        <div className="item" key={k}>
          <div className="r"><b>{m.ref}</b><span>
            <button className="lnk" onClick={() => go(b, c, v)}>Read</button>
            <button className="lnk" aria-label={`Remove ${m.ref} from Saved`} onClick={() => update((p) => { const saved = { ...p.saved }; delete saved[k]; return { ...p, saved }; })}>Remove</button>
          </span></div>
          <p>{m.text}</p>
        </div>); })
        : <div className="none">No saved verses yet.<br />Tap a verse, then choose Save.</div>}
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

function SettingsPanel({ s, update, close }: PanelProps & { close: () => void }) {
  const dark = s.theme ? s.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
  const [saved, setSaved] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
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
      <div className="row"><div><div className="k">Offline reading</div>
        <div className="d">{saved === null ? "Checking…" : saved >= 66 ? "The whole Bible is saved on this device." : `${saved} of 66 books saved on this device.`}{err && <><br />{err}</>}</div></div>
        {saved !== null && saved < 66 && (busy
          ? <button className="btn" onClick={() => { stop.current = true; }}>Stop</button>
          : <button className="btn pri" onClick={download}>Save all</button>)}
      </div>
      {busy && <progress className="prog" max={66} value={saved ?? 0} aria-label="Books saved" />}
      <p className="hint">Books you open are saved automatically. Bunong Bible (Vietnam dialect).</p>
    </Panel>
  );
}
