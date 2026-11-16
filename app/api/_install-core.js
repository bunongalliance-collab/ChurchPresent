// Shared by the Vercel function (api/install.js) and the Vite dev stand-in (vite.config.ts).
// Records one install of the Nau Mpro app: no sign-in, one row per device (the device's random install id).
// Files starting with "_" in api/ are not routes on Vercel.
import { deviceName } from "./_visit-core.js";

const header = (headers, name) => {
  const v = headers[name];
  return Array.isArray(v) ? v[0] : (v || "");
};
const decode = (v) => { try { return decodeURIComponent(v); } catch { return v; } };

// A random id made by the browser: letters, digits and dashes only
export const validInstallId = (id) => typeof id === "string" && /^[a-z0-9-]{8,64}$/i.test(id);
const HOW = new Set(["home screen", "browser prompt"]);

// body: { installId, how }. Returns { status, body }.
export async function recordInstall({ headers, body, supabaseUrl, serviceKey, fetchImpl = fetch }) {
  if (!supabaseUrl) return { status: 500, body: { error: "Supabase settings are missing on the server" } };
  if (!serviceKey) {
    console.warn("install: skipped, SUPABASE_SERVICE_ROLE_KEY is not set on the server");
    return { status: 204, body: null };
  }
  const installId = body?.installId;
  if (!validInstallId(installId)) return { status: 400, body: { error: "installId is missing or not valid" } };
  const row = {
    install_id: installId,
    app: "nau-mpro",
    how: HOW.has(body?.how) ? body.how : "",
    device: deviceName(header(headers, "user-agent")),
    city: decode(header(headers, "x-vercel-ip-city")),
    region: decode(header(headers, "x-vercel-ip-country-region")),
    country: header(headers, "x-vercel-ip-country"),
  };
  try {
    // The same device again (a repeat or a retry) is ignored by the unique install_id
    const r = await fetchImpl(`${supabaseUrl}/rest/v1/app_installs?on_conflict=install_id`, {
      method: "POST",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
        Prefer: "resolution=ignore-duplicates,return=minimal",
      },
      body: JSON.stringify(row),
    });
    if (!r.ok) return { status: r.status, body: { error: await r.text() } };
    return { status: 204, body: null };
  } catch {
    return { status: 502, body: { error: "could not reach Supabase" } };
  }
}
