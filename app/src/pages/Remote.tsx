import { useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { remoteChannel, type RemoteState } from "../lib/remote";

// The phone remote (#remote:<code>): opened by scanning the QR code in the presenter's Phone remote panel.
// It sends the same commands as the presenter's buttons to the screen window, over the internet.

const codeFromHash = () => (window.location.hash.split(":")[1] || "").toUpperCase().replace(/[^A-Z2-9]/g, "");

export default function Remote() {
  const code = codeFromHash();
  const [state, setState] = useState<RemoteState | null>(null);
  const [seenAt, setSeenAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [showList, setShowList] = useState(false);
  const chRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    const sb = supabase;
    if (!sb || code.length !== 8) return;
    const ch = sb.channel(remoteChannel(code), { config: { broadcast: { self: false } } });
    ch.on("broadcast", { event: "state" }, ({ payload }) => { setState(payload as RemoteState); setSeenAt(Date.now()); });
    const hello = () => void ch.send({ type: "broadcast", event: "hello", payload: {} });
    ch.subscribe((status) => { if (status === "SUBSCRIBED") hello(); });
    chRef.current = ch;
    // Ask every 3 seconds, so the screen window knows a phone is here and the phone knows the screen is there
    const t = window.setInterval(() => { hello(); setNow(Date.now()); }, 3000);
    return () => { window.clearInterval(t); chRef.current = null; void sb.removeChannel(ch); };
  }, [code]);

  // Keep the phone awake while it is the remote (where the browser allows it)
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } };
    const get = () => { nav.wakeLock?.request("screen").then((l) => { lock = l; }).catch(() => {}); };
    get();
    const onVis = () => { if (document.visibilityState === "visible") get(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { document.removeEventListener("visibilitychange", onVis); void lock?.release(); };
  }, []);

  const send = (cmd: string, index?: number) => {
    void chRef.current?.send({ type: "broadcast", event: "cmd", payload: { cmd, index } });
    if (navigator.vibrate) navigator.vibrate(15);
  };

  const connected = !!state && now - seenAt < 9000;
  if (!supabase) return <div className="rm"><p className="rm-msg">The phone remote needs the app's database settings.</p></div>;
  if (code.length !== 8) return <div className="rm"><p className="rm-msg">This link is missing its pairing code. Scan the QR code in the presenter's Phone remote panel again.</p></div>;

  const at = state ? Math.max(0, state.items.findIndex((it) => state.index >= it.first && state.index < it.first + it.count)) : 0;
  const item = state?.items[at];
  const mode = state ? (state.blackout ? "Black screen" : state.logo ? "Logo screen" : state.waiting ? "Welcome screen" : state.clear ? "Text cleared" : "") : "";
  const toggle = (on: boolean | undefined, cmd: string, label: string, key: string) => (
    <button type="button" className={`rm-mode${on ? " on" : ""}`} aria-pressed={!!on} onClick={() => send(cmd)} disabled={!connected} aria-keyshortcuts={key}>{label}</button>
  );

  return (
    <div className="rm">
      <header className="rm-head">
        <strong>Phone remote</strong>
        <span className={`rm-conn${connected ? " on" : ""}`}><span className="rm-dot" aria-hidden="true" />{connected ? "Connected to the screen" : "Looking for the screen…"}</span>
      </header>

      {!connected && (
        <p className="rm-help">Keep the screen window open on the computer, with internet on both. If this takes long, scan the QR code again: the code may have been changed.</p>
      )}

      {state && (
        <section className="rm-now" aria-live="polite">
          <p className="rm-cap">{item?.title ?? "Slides"} · slide {state.index + 1} of {state.total}{mode ? ` · ${mode}` : ""}</p>
          <p className="rm-text">{state.now || "(no words on this slide)"}</p>
          {state.next && <p className="rm-next"><span>Next</span>{state.next}</p>}
        </section>
      )}

      {state && state.items.length > 1 && (
        <section className="rm-items">
          <button type="button" className="rm-list-toggle" aria-expanded={showList} onClick={() => setShowList((v) => !v)}>
            {showList ? "Hide the order of worship" : "Jump to an item"}
          </button>
          {showList && (
            <ol>
              {state.items.map((it, i) => (
                <li key={i}>
                  <button type="button" className={`rm-item${i === at ? " current" : ""}`} aria-current={i === at ? "true" : undefined} onClick={() => send("goto", it.first)} disabled={!connected}>
                    <span>{it.title}</span><small>{it.count} slide{it.count === 1 ? "" : "s"}</small>
                  </button>
                </li>
              ))}
            </ol>
          )}
        </section>
      )}
      {/* Controls sit at the bottom, where a thumb reaches them; Next is the largest */}
      <div className="rm-controls">
        <div className="rm-modes">
          {toggle(state?.blackout, "blackout", "Black screen", "B")}
          {toggle(state?.logo, "logo", "Logo", "L")}
          {toggle(state?.waiting, "waiting", "Welcome", "W")}
          {toggle(state?.clear, "clear", "Clear text", "C")}
        </div>
        <div className="rm-move">
          <button type="button" className="rm-prev" onClick={() => send("prev")} disabled={!connected || (state?.index ?? 0) === 0} aria-label="Previous slide">‹ Previous</button>
          <button type="button" className="rm-nextbtn" onClick={() => send("next")} disabled={!connected || !state || state.index >= state.total - 1} aria-label="Next slide">Next ›</button>
        </div>
      </div>
    </div>
  );
}
