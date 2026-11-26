// Vercel serverless function: the 1200 x 630 card image for a shared verse (/api/verse-card?v=JHN.3.16-17).
import { cardPng, fetchVerse, parseRef } from "./_verse-core.js";

export default async function handler(req, res) {
  const r = parseRef(req.query.v, req.query.t);
  const verse = r && await fetchVerse(r, process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY).catch(() => null);
  if (!verse?.found) { res.status(404).end(); return; }
  res.setHeader("Content-Type", "image/png");
  res.setHeader("Cache-Control", "public, s-maxage=604800, stale-while-revalidate=2592000");
  res.status(200).send(cardPng(verse));
}
