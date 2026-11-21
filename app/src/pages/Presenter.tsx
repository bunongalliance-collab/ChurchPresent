import { useEffect, useMemo, useState } from "react";
import { openAudience, renderStage, LOGO_KEY, type DeckItem, type ProjDeck } from "./Projector";

// The presenter window: what the person running the slides sees on their own screen.
// The audience window (the projector, a TV or any second screen) follows the commands sent from here.
export interface PresenterState { index: number; blackout: boolean; waiting: boolean; logo: boolean; clear: boolean }

const TIMER_KEY = "presenterTimerStart";

// The order of worship for the side list. Decks without one (a single song, a scripture study) are one item.
function itemsOf(deck: ProjDeck): DeckItem[] {
  if (deck.outline?.length) return deck.outline;
  return [{ title: "Slides", first: 0, count: deck.slides.length }];
}

const slideText = (deck: ProjDeck, i: number) => {
  const sl = deck.slides[i];
  const rows = sl.segs ? sl.segs.map((l) => l.map((s) => s.text).join("")) : sl.rows ?? [];
  return rows.join(" ").replace(/[\u0001-\u0003]/g, "").trim();
};

const two = (n: number) => String(n).padStart(2, "0");
function elapsed(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h ? `${h}:${two(m)}:${two(s % 60)}` : `${m}:${two(s % 60)}`;
}

export default function Presenter({ deck, state, connected, send }: {
  deck: ProjDeck; state: PresenterState; connected: boolean; send: (cmd: string, arg?: number) => void;
}) {
  const { index, blackout, waiting, logo, clear } = state;
  const total = deck.slides.length;
  const items = useMemo(() => itemsOf(deck), [deck]);
  const at = Math.max(0, items.findIndex((it) => index >= it.first && index < it.first + it.count));
  const item = items[at];
  const nextItem = items[at + 1];

  // Clock and service timer. The timer keeps running through a refresh of this window.
  const [now, setNow] = useState(() => Date.now());
  const [start, setStart] = useState(() => {
    const v = parseInt(sessionStorage.getItem(TIMER_KEY) || "", 10);
    return Number.isNaN(v) ? Date.now() : v;
  });
  useEffect(() => { try { sessionStorage.setItem(TIMER_KEY, String(start)); } catch { /* storage blocked */ } }, [start]);
  useEffect(() => { const t = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(t); }, []);

  // The logo shown on the Logo screen: an image chosen on this computer, kept in this browser
  const [hasLogo, setHasLogo] = useState(() => { try { return !!localStorage.getItem(LOGO_KEY); } catch { return false; } });
  function chooseLogo(file: File | undefined) {
    if (!file) return;
    const r = new FileReader();
    r.onload = () => {
      try { localStorage.setItem(LOGO_KEY, String(r.result)); setHasLogo(true); } catch { alert("That image is too large to keep. Try a smaller one (under 2 MB)."); }
    };
    r.readAsDataURL(file);
  }

  const screen = blackout ? "Black screen" : logo ? "Logo screen" : waiting ? "Welcome screen" : clear ? "Text cleared" : "";

  return (
    <div className="prv">
      <header className="prv-head">
        <strong className="prv-brand">Presenter</strong>
        <span className={`prv-conn${connected ? " on" : ""}`}>
          <span className="prv-dot" aria-hidden="true" />{connected ? "Screen connected" : "Screen not connected"}
        </span>
        {!connected && (
          <span className="prv-open">
            <button type="button" className="secondary small" onClick={() => openAudience(true)}>Show on second screen</button>
            <button type="button" className="secondary small" onClick={() => openAudience(false)}>Open screen window</button>
          </span>
        )}
        <span className="prv-grow" />
        <span className="prv-time">
          <span className="prv-tl">Service time</span>
          <span className="prv-tv">{elapsed(now - start)}</span>
          <button type="button" className="secondary small" onClick={() => setStart(Date.now())}>Reset</button>
        </span>
        <span className="prv-time">
          <span className="prv-tl">Clock</span>
          <span className="prv-tv">{new Date(now).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>
        </span>
      </header>

      <nav className="prv-side" aria-label="Order of worship">
        <p className="prv-cap">Order of worship</p>
        <ol className="prv-items">
          {items.map((it, i) => (
            <li key={i}>
              <button type="button" className={`prv-item${i === at ? " current" : i < at ? " done" : ""}`} aria-current={i === at ? "true" : undefined} onClick={() => send("goto", it.first)}>
                <span className="prv-item-t">{it.title}</span>
                <span className="prv-item-n">{i === at ? `${index - it.first + 1} of ${it.count}` : `${it.count} slide${it.count === 1 ? "" : "s"}`}</span>
              </button>
            </li>
          ))}
        </ol>
      </nav>

      <main className="prv-main">
        <div className="prv-stages">
          <section className="prv-now" aria-label="On screen now">
            <p className="prv-cap"><span className="prv-live">● On screen</span> Slide {index + 1} of {total}{screen ? ` · ${screen}` : ""}</p>
            <div className={`prv-frame live${screen ? " hidden-out" : ""}`}>{renderStage(deck.slides[index], deck, " in-pres")}</div>
          </section>
          <section className="prv-next" aria-label="Next slide">
            <p className="prv-cap">Next{index + 1 < total ? ` · slide ${index + 2}` : ""}</p>
            <div className="prv-frame">{index + 1 < total ? renderStage(deck.slides[index + 1], deck, " in-pres") : <div className="pres-end">End of presentation</div>}</div>
            {nextItem && <p className="prv-after"><span className="prv-cap">After this item</span>{nextItem.title}</p>}
          </section>
        </div>

        <section className="prv-thumbs-wrap" aria-label={`Slides in ${item?.title ?? "this item"}`}>
          <p className="prv-cap">{item?.title}</p>
          <ol className="prv-thumbs">
            {item && Array.from({ length: item.count }, (_, k) => item.first + k).map((i) => (
              <li key={i}>
                <button type="button" className={`prv-thumb${i === index ? " current" : ""}`} aria-current={i === index ? "true" : undefined} aria-label={`Slide ${i + 1}`} onClick={() => send("goto", i)}>
                  {renderStage(deck.slides[i], deck, " in-pres")}
                  <span className="prv-thumb-n">{i + 1}</span>
                </button>
                <span className="prv-thumb-t">{slideText(deck, i).slice(0, 50)}</span>
              </li>
            ))}
          </ol>
        </section>
      </main>

      <footer className="prv-foot">
        <button type="button" className="secondary prv-big" onClick={() => send("prev")} disabled={index === 0}>← Previous</button>
        <button type="button" className="primary prv-big prv-nextbtn" onClick={() => send("next")} disabled={index >= total - 1}>Next →</button>
        <span className="prv-grow" />
        <button type="button" className={`secondary prv-mode${blackout ? " on" : ""}`} aria-pressed={blackout} onClick={() => send("blackout")}>Black screen (B)</button>
        <button type="button" className={`secondary prv-mode${logo ? " on" : ""}`} aria-pressed={logo} onClick={() => send("logo")} title={hasLogo ? undefined : "Choose a logo image below; until then the church name shows"}>Logo screen (L)</button>
        <button type="button" className={`secondary prv-mode${waiting ? " on" : ""}`} aria-pressed={waiting} onClick={() => send("waiting")}>Welcome screen (W)</button>
        <button type="button" className={`secondary prv-mode${clear ? " on" : ""}`} aria-pressed={clear} onClick={() => send("clear")}>Clear text (C)</button>
        <label className="prv-logo-pick">
          {hasLogo ? "Change logo" : "Choose logo"}
          <input type="file" accept="image/*" onChange={(e) => chooseLogo(e.target.files?.[0])} />
        </label>
      </footer>
      <section className="prv-keys" aria-label="Shortcut keys">
        <span className="prv-keys-h">Shortcut keys</span>
        <span className="prv-key"><kbd>→</kbd><kbd>Space</kbd><kbd>Enter</kbd><kbd>Page Down</kbd> Next</span>
        <span className="prv-key"><kbd>←</kbd><kbd>Page Up</kbd> Previous</span>
        <span className="prv-key"><kbd>Home</kbd> First slide</span>
        <span className="prv-key"><kbd>End</kbd> Last slide</span>
        <span className="prv-key"><kbd>B</kbd><kbd>.</kbd> Black screen</span>
        <span className="prv-key"><kbd>L</kbd> Logo</span>
        <span className="prv-key"><kbd>W</kbd> Welcome</span>
        <span className="prv-key"><kbd>C</kbd> Clear text</span>
        <span className="prv-key"><kbd>Scroll</kbd> Next / previous</span>
        <span className="prv-key prv-key-note">A clicker works too. On the screen window: <kbd>F</kbd> full screen, <kbd>Esc</kbd> exit.</span>
      </section>
    </div>
  );
}
