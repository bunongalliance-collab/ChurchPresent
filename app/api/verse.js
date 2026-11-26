// Vercel serverless function: the shared verse link (/v/JHN.3.16-17, rewritten here in vercel.json).
// Answers with the Open Graph tags for link previews and sends people on to the Bible reader at that verse.
import { fetchVerse, originOf, parseRef, verseHtml } from "./_verse-core.js";

export default async function handler(req, res) {
  const origin = originOf(req.headers);
  const r = parseRef(req.query.v, req.query.t);
  if (!r) { res.redirect(302, `${origin}/nau-brah-ndu-ngoi/`); return; }
  const verse = await fetchVerse(r, process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY).catch(() => null);
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, s-maxage=86400, stale-while-revalidate=604800");
  res.status(200).send(verseHtml({ origin, r, verse }));
}
