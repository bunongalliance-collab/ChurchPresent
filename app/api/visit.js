// Vercel serverless function: records where a signed-in user opened the app from.
// Called by the app: POST /api/visit, with the user's access token when signed in, without one for anonymous visitors.
// SUPABASE_SERVICE_ROLE_KEY (server only, never VITE_) is needed for anonymous visits.
import { recordVisit } from "./_visit-core.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method not allowed" });
    return;
  }
  const { status, body } = await recordVisit({
    headers: req.headers,
    supabaseUrl: process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
    anonKey: process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY,
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  });
  if (body === null) res.status(status).end();
  else res.status(status).json(body);
}
