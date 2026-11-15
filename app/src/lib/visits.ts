import { supabase } from "./supabase";

// Where the app is opened from: one visit per browser session.
// Signed in: recorded with the account. Not signed in: recorded as an anonymous visitor (the server also limits
// anonymous visits to one per IP address every 30 minutes).
// The server function (api/visit.js) reads the IP address, location and device; the browser sends only the sign-in token, if any.

const flagKey = (who: string) => `visitLogged:${who}`;

async function logVisit(who: string, token?: string) {
  try {
    if (sessionStorage.getItem(flagKey(who))) return;
    sessionStorage.setItem(flagKey(who), "1");   // set first, so two events don't record twice
  } catch {
    return;   // storage blocked: skip rather than record on every page load
  }
  try {
    const r = await fetch("/api/visit", { method: "POST", headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (!r.ok) throw new Error(String(r.status));
  } catch {
    // Offline or not set up yet: try again next time the app opens
    try { sessionStorage.removeItem(flagKey(who)); } catch { /* ignore */ }
  }
}

let started = false;
export function startVisitLogging() {
  if (started) return;
  started = true;
  if (!supabase) return;
  supabase.auth.getSession().then(({ data }) => {
    const s = data.session;
    if (s) void logVisit(s.user.id, s.access_token);
    else void logVisit("anonymous");
  });
  supabase.auth.onAuthStateChange((event, s) => {
    if (s && event === "SIGNED_IN") void logVisit(s.user.id, s.access_token);
  });
}
