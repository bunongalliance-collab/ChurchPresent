// Shared by the Vercel function (api/visit.js) and the Vite dev stand-in (vite.config.ts).
// Records one visit for the signed-in user: IP address, approximate location and device.
// The browser cannot see its own public IP, so this runs on the server and reads the request headers.
// Files starting with "_" in api/ are not routes on Vercel.

// A short device name from the user agent, for example "iPhone · Safari" or "Windows · Chrome"
export function deviceName(ua) {
  const s = String(ua || "");
  const os = /iPhone/.test(s) ? "iPhone"
    : /iPad/.test(s) ? "iPad"
    : /Android/.test(s) ? (/Mobile/.test(s) ? "Android phone" : "Android tablet")
    : /Macintosh|Mac OS X/.test(s) ? "Mac"
    : /Windows/.test(s) ? "Windows"
    : /CrOS/.test(s) ? "Chromebook"
    : /Linux/.test(s) ? "Linux"
    : "Unknown device";
  const browser = /Edg\//.test(s) ? "Edge"
    : /OPR\/|Opera/.test(s) ? "Opera"
    : /SamsungBrowser/.test(s) ? "Samsung Internet"
    : /Firefox|FxiOS/.test(s) ? "Firefox"
    : /Chrome|CriOS/.test(s) ? "Chrome"
    : /Safari/.test(s) ? "Safari"
    : "Browser";
  return `${os} · ${browser}`;
}

// The email inside the user's access token (the token itself is checked by Supabase on insert)
function emailFromToken(token) {
  try {
    const part = token.split(".")[1];
    const json = Buffer.from(part.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    return String(JSON.parse(json).email || "");
  } catch {
    return "";
  }
}

const header = (headers, name) => {
  const v = headers[name];
  return Array.isArray(v) ? v[0] : (v || "");
};
const decode = (v) => { try { return decodeURIComponent(v); } catch { return v; } };

// Anonymous visitors: at most one visit per IP address in this many minutes
export const ANON_WINDOW_MINUTES = 30;

// headers: the incoming request headers (lower-case names). Returns { status, body }.
// With a sign-in token the visit is saved as that user (row-level security checks it).
// Without one it is saved as an anonymous visit with the server-only service key, at most once per IP per window.
export async function recordVisit({ headers, supabaseUrl, anonKey, serviceKey, fetchImpl = fetch }) {
  const auth = header(headers, "authorization");
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!supabaseUrl || !anonKey) return { status: 500, body: { error: "Supabase settings are missing on the server" } };
  if (!token && !serviceKey) {
    // Not set up for anonymous visits yet: skip quietly (warn in the server log, not the visitor's browser)
    console.warn("visit: anonymous visit skipped, SUPABASE_SERVICE_ROLE_KEY is not set on the server");
    return { status: 204, body: null };
  }

  const forwarded = header(headers, "x-forwarded-for");
  const ip = (forwarded.split(",")[0] || header(headers, "x-real-ip") || "").trim();
  const ua = header(headers, "user-agent");

  // Anonymous: skip if this IP was already recorded recently (stops repeat and fake visits filling the table)
  if (!token) {
    const since = new Date(Date.now() - ANON_WINDOW_MINUTES * 60_000).toISOString();
    try {
      const q = `${supabaseUrl}/rest/v1/app_visits?select=id&user_id=is.null&ip=eq.${encodeURIComponent(ip)}&created_at=gte.${encodeURIComponent(since)}&limit=1`;
      const r = await fetchImpl(q, { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } });
      if (r.ok && (await r.json()).length) return { status: 204, body: null };
    } catch {
      return { status: 502, body: { error: "could not reach Supabase" } };
    }
  }

  const row = {
    email: token ? emailFromToken(token) : "",
    ip,
    city: decode(header(headers, "x-vercel-ip-city")),
    region: decode(header(headers, "x-vercel-ip-country-region")),
    country: header(headers, "x-vercel-ip-country"),
    device: deviceName(ua),
    user_agent: ua.slice(0, 400),
  };
  try {
    const r = await fetchImpl(`${supabaseUrl}/rest/v1/app_visits`, {
      method: "POST",
      headers: {
        apikey: token ? anonKey : serviceKey,
        Authorization: `Bearer ${token || serviceKey}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify(row),
    });
    if (!r.ok) return { status: r.status, body: { error: await r.text() } };
    return { status: 204, body: null };
  } catch {
    return { status: 502, body: { error: "could not reach Supabase" } };
  }
}
