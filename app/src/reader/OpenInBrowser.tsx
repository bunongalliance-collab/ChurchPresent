import { useEffect, useRef, useState } from "react";
import { chromeIntentUrl, inAppBrowser, isAndroid, isIOS } from "./install";

// When the reader opens inside Facebook, Messenger or Instagram (their in-app browser cannot install apps):
// Android tries to switch to Chrome by itself once per visit, with a button as backup.
// iPhone and iPad have no reliable automatic switch, so the box shows the "⋯ › Open in browser" steps
// and a button to copy the link. Shown in the middle of the page, in place of the install offer.

const TRIED_KEY = "nmOpenedInChrome";   // per visit (sessionStorage), so a failed switch does not repeat
const HIDE_KEY = "nmStayInApp";         // "Keep reading here", for this visit

const sGet = (k: string) => { try { return sessionStorage.getItem(k); } catch { return null; } };
const sSet = (k: string) => { try { sessionStorage.setItem(k, "1"); } catch { /* storage blocked */ } };

export default function OpenInBrowser() {
  const app = inAppBrowser();
  const android = isAndroid();
  const [show, setShow] = useState(() => !!app && !sGet(HIDE_KEY));
  const [copied, setCopied] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  // Android: try Chrome once, straight away
  useEffect(() => {
    if (!app || !android || sGet(TRIED_KEY)) return;
    sSet(TRIED_KEY);
    window.location.href = chromeIntentUrl();
  }, [app, android]);

  useEffect(() => { if (show) box.current?.querySelector<HTMLElement>(".nm-install-go")?.focus(); }, [show]);

  if (!app || !show) return null;
  const name = app === "instagram" ? "Instagram" : "Facebook";
  const stay = () => { sSet(HIDE_KEY); setShow(false); };
  async function copy() {
    try { await navigator.clipboard.writeText(window.location.href); setCopied(true); }
    catch { window.prompt?.("Copy this link:", window.location.href); }
  }

  return (
    <div className="nm-install-wrap" onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); stay(); } }}>
      <div className="nm-install-scrim" onClick={stay} />
      <div ref={box} className="nm-install" role="dialog" aria-modal="true" aria-labelledby="nm-open-h" aria-describedby="nm-open-d">
        <img className="nm-install-icon" src="/nau-mpro/icon-192.png" alt="" width="64" height="64" />
        <h2 id="nm-open-h">Open in your browser</h2>
        <p id="nm-open-d">You opened Nau Mpro inside {name}. To install the hymn book on your phone, open it in {android ? "Chrome" : "Safari"}.</p>
        {android ? (
          <div className="nm-install-actions">
            <a className="nm-install-go nm-install-link" href={chromeIntentUrl()}>Open in Chrome</a>
            <button className="nm-install-later" onClick={stay}>Keep reading here</button>
          </div>
        ) : (
          <>
            <ol className="nm-install-steps">
              <li>Tap <b>⋯</b> {isIOS() ? "at the top or bottom of the screen" : "in the corner"}.</li>
              <li>Choose <b>Open in {isIOS() ? "Safari" : "browser"}</b> (or <b>Open in external browser</b>).</li>
            </ol>
            <div className="nm-install-actions">
              <button className="nm-install-go" onClick={() => void copy()}>{copied ? "Link copied: paste it in Safari" : "Copy link"}</button>
              <button className="nm-install-later" onClick={stay}>Keep reading here</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
