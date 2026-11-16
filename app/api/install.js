// Vercel serverless function: counts an install of the Nau Mpro app (no sign-in).
// Called by the reader: POST /api/install with { installId, how }.
// SUPABASE_SERVICE_ROLE_KEY (server only, never VITE_) saves the row; browsers cannot write the table directly.
import { recordInstall } from "./_install-core.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method not allowed" });
    return;
  }
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = null; } }
  const { status, body: out } = await recordInstall({
    headers: req.headers,
    body,
    supabaseUrl: process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  });
  if (out === null) res.status(status).end();
  else res.status(status).json(out);
}
