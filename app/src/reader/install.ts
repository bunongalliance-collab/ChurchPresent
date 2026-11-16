// Installing the Nau Mpro app, and counting installs (no sign-in).
// Counted once per device: when Chrome, Edge or Samsung Internet report the install, or the first time the app
// opens from the home screen (iPhone and iPad give no install event, so that first launch is how they count).

const ID_KEY = "nmInstallId";        // random id for this device (sent with the count, nothing else)
const SENT_KEY = "nmInstallCounted"; // the server has this device
const DONE_KEY = "nmInstalled";      // the app is installed: never offer it again in this browser
const SNOOZE_KEY = "nmInstallSnooze"; // "Not now": ask again after this time
export const SNOOZE_DAYS = 14;

const get = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const set = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* storage blocked */ } };

// Opened as the installed app (from the home screen), not in a browser tab
export function isStandalone(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia("(display-mode: standalone)").matches || window.matchMedia("(display-mode: fullscreen)").matches || nav.standalone === true;
}
// iPhone and iPad (iPadOS reports itself as a Mac with touch): installed through Share › Add to Home Screen
export function isIOS(): boolean {
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

// Facebook, Messenger and Instagram open links in their own browser, which cannot install apps
export function inAppBrowser(): "facebook" | "instagram" | null {
  const ua = navigator.userAgent;
  if (/Instagram/i.test(ua)) return "instagram";
  if (/FBAN|FBAV|FB_IAB|FBIOS|FB4A|MessengerForiOS|Messenger|\[FB/i.test(ua)) return "facebook";
  return null;
}
export const isAndroid = () => /Android/i.test(navigator.userAgent);

// Android: an intent link opens this page in Chrome (or the phone's browser if Chrome is missing)
export function chromeIntentUrl(href = window.location.href): string {
  const u = new URL(href);
  return `intent://${u.host}${u.pathname}${u.search}${u.hash}#Intent;scheme=${u.protocol.replace(":", "")};package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(href)};end`;
}

function deviceId(): string {
  let id = get(ID_KEY);
  if (!id) {
    id = (crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`);
    set(ID_KEY, id);
  }
  return id;
}

export const markInstalled = () => set(DONE_KEY, "1");
export const wasInstalled = () => get(DONE_KEY) === "1";
export const snooze = () => set(SNOOZE_KEY, String(Date.now() + SNOOZE_DAYS * 86_400_000));
export const snoozed = () => Number(get(SNOOZE_KEY) || 0) > Date.now();

// Tell the server once; if it fails (offline), try again next time the app opens
export async function countInstall(how: "home screen" | "browser prompt") {
  markInstalled();
  if (get(SENT_KEY)) return;
  try {
    const r = await fetch("/api/install", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ installId: deviceId(), how }),
    });
    if (r.ok) set(SENT_KEY, "1");
  } catch { /* offline: next launch tries again */ }
}

// Call once when the reader starts
let started = false;
export function startInstallTracking() {
  if (started) return;
  started = true;
  if (isStandalone()) void countInstall("home screen");
  window.addEventListener("appinstalled", () => void countInstall("browser prompt"));
}
