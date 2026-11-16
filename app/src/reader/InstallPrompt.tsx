import { useEffect, useRef, useState } from "react";
import { inAppBrowser, isIOS, isStandalone, markInstalled, snooze, snoozed, wasInstalled } from "./install";

// The install offer, centred on the page when the reader opens in a browser.
// Not shown in the installed app, after the app was installed in this browser, or for 14 days after "Not now".
// Chrome, Edge and Samsung Internet: an Install button (the browser's own install). iPhone and iPad: the
// Share › Add to Home Screen steps. Browsers that cannot install apps (Firefox on a computer) see nothing.

interface InstallEvent extends Event { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> }

const SHOW_DELAY_MS = 1200;

export default function InstallPrompt() {
  const [kind, setKind] = useState<"button" | "ios" | null>(null);
  const deferred = useRef<InstallEvent | null>(null);
  const firstBtn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // Inside Facebook, Messenger or Instagram the "Open in your browser" box shows instead
    if (isStandalone() || wasInstalled() || snoozed() || inAppBrowser()) return;
    let timer = 0;
    const onPrompt = (e: Event) => {
      e.preventDefault();   // keep the browser's own mini bar away; our box asks instead
      deferred.current = e as InstallEvent;
      timer = window.setTimeout(() => setKind("button"), SHOW_DELAY_MS);
    };
    const onInstalled = () => setKind(null);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    if (isIOS()) timer = window.setTimeout(() => setKind("ios"), SHOW_DELAY_MS);
    return () => { window.clearTimeout(timer); window.removeEventListener("beforeinstallprompt", onPrompt); window.removeEventListener("appinstalled", onInstalled); };
  }, []);

  useEffect(() => { if (kind) firstBtn.current?.focus(); }, [kind]);

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
  // iPhone and iPad: Safari never says when the app is added, so the person tells us
  const added = () => { markInstalled(); setKind(null); };

  return (
    <div className="nm-install-wrap" onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); later(); } }}>
      <div className="nm-install-scrim" onClick={later} />
      <div className="nm-install" role="dialog" aria-modal="true" aria-labelledby="nm-install-h" aria-describedby="nm-install-d">
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
        <div className="nm-install-actions">
          {kind === "button"
            ? <button ref={firstBtn} className="nm-install-go" onClick={() => void install()}>Install app</button>
            : <button ref={firstBtn} className="nm-install-go" onClick={added}>I added it</button>}
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
