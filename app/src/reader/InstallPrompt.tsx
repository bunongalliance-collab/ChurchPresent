import { useEffect, useRef, useState } from "react";
import { inAppBrowser, isAndroid, isIOS, isStandalone, markInstalled, snooze, snoozed, wasInstalled } from "./install";

// The install offer, centred on the page when the reader opens in a browser.
// Not shown by itself in the installed app, after the app was installed in this browser, or for 14 days after
// "Not now". The Install button in the top bar opens it at any time (event "nm-open-install").
// - Chrome, Edge, Samsung Internet: an Install app button (the browser's own install), once the browser allows it.
//   Chrome holds that back until the visitor has used the page a little, so on Android the box first shows the
//   menu steps and switches to the button when it arrives.
// - iPhone and iPad: the Share › Add to Home Screen steps.

interface InstallEvent extends Event { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> }
type Kind = "button" | "ios" | "menu";

export const OPEN_INSTALL_EVENT = "nm-open-install";
const SHOW_DELAY_MS = 1200;
const ANDROID_WAIT_MS = 2500;   // how long to wait for Chrome's install signal before showing the menu steps

const samsung = () => /SamsungBrowser/i.test(navigator.userAgent);

export default function InstallPrompt() {
  const [kind, setKind] = useState<Kind | null>(null);
  const deferred = useRef<InstallEvent | null>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let timer = 0;
    const auto = !(isStandalone() || wasInstalled() || snoozed() || inAppBrowser());
    const onPrompt = (e: Event) => {
      e.preventDefault();   // keep the browser's own mini bar away; our box asks instead
      deferred.current = e as InstallEvent;
      // Showing the menu steps already (or opened by hand): switch to the real button
      setKind((k) => (k ? "button" : k));
      if (auto) { window.clearTimeout(timer); timer = window.setTimeout(() => setKind((k) => k ?? "button"), SHOW_DELAY_MS); }
    };
    const onInstalled = () => setKind(null);
    // The top bar's Install button: open now, whatever was chosen before
    const onOpen = () => setKind(deferred.current ? "button" : isIOS() ? "ios" : "menu");
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    window.addEventListener(OPEN_INSTALL_EVENT, onOpen);
    if (auto && isIOS()) timer = window.setTimeout(() => setKind("ios"), SHOW_DELAY_MS);
    else if (auto && isAndroid()) timer = window.setTimeout(() => setKind((k) => k ?? (deferred.current ? "button" : "menu")), ANDROID_WAIT_MS);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
      window.removeEventListener(OPEN_INSTALL_EVENT, onOpen);
    };
  }, []);

  useEffect(() => { if (kind) box.current?.querySelector<HTMLElement>(".nm-install-go")?.focus(); }, [kind]);

  if (!kind) return null;

  const later = () => { snooze(); setKind(null); };
  async function install() {
    const e = deferred.current;
    if (!e) return;
    await e.prompt();
    const { outcome } = await e.userChoice;
    deferred.current = null;
    if (outcome === "accepted") markInstalled(); else snooze();
    setKind(null);
  }
  // iPhone, iPad and the menu steps: the browser never says when the app is added, so the person tells us
  const added = () => { markInstalled(); setKind(null); };

  return (
    <div className="nm-install-wrap" onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); later(); } }}>
      <div className="nm-install-scrim" onClick={later} />
      <div ref={box} className="nm-install" role="dialog" aria-modal="true" aria-labelledby="nm-install-h" aria-describedby="nm-install-d">
        <img className="nm-install-icon" src="/nau-mpro/icon-192.png" alt="" width="64" height="64" />
        <h2 id="nm-install-h">Install Nau Mpro</h2>
        <p id="nm-install-d">Keep the hymn book on your home screen. It opens full screen and works without internet.</p>
        {kind === "ios" && (
          <ol className="nm-install-steps">
            <li>Tap <b>Share</b> <ShareIcon /> in the browser bar.</li>
            <li>Choose <b>Add to Home Screen</b>.</li>
            <li>Tap <b>Add</b>.</li>
          </ol>
        )}
        {kind === "menu" && (
          samsung() ? (
            <ol className="nm-install-steps">
              <li>Tap the menu <b>≡</b> at the bottom.</li>
              <li>Choose <b>Add page to</b>, then <b>Home screen</b>.</li>
            </ol>
          ) : (
            <ol className="nm-install-steps">
              <li>Tap the menu <b>⋮</b> at the top right.</li>
              <li>Choose <b>Install app</b> or <b>Add to Home screen</b>.</li>
              <li>Tap <b>Install</b>.</li>
            </ol>
          )
        )}
        <div className="nm-install-actions">
          {kind === "button"
            ? <button className="nm-install-go" onClick={() => void install()}>Install app</button>
            : <button className="nm-install-go" onClick={added}>I added it</button>}
          <button className="nm-install-later" onClick={later}>Not now</button>
        </div>
      </div>
    </div>
  );
}

function ShareIcon() {
  return (
    <svg className="nm-share-icon" viewBox="0 0 16 20" aria-label="(square with an arrow pointing up)" role="img">
      <path d="M8 1v11M4.5 4.5 8 1l3.5 3.5M5 8H2.5v10.5h11V8H11" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
