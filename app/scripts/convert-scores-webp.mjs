// Converts the Nau Mpro score scans (PNG) in the public 'hymn-scores' bucket to WebP, about 60–70% smaller,
// and uploads them with a one-year cache setting so browsers stop re-checking them.
// The PNG files are left in place. After this finishes, run supabase/hymn-scores-webp.sql in the
// Supabase SQL editor so each song points at its .webp files.
//
// Run from app/:   node scripts/convert-scores-webp.mjs
// Needs in app/.env.local:  VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
// Safe to run again: files that already have a .webp copy are skipped.

import { readFileSync } from "node:fs";
import sharp from "sharp";

function env(name) {
  for (const f of [".env.local", ".env"]) {
    try {
      const line = readFileSync(f, "utf8").split("\n").find((l) => l.startsWith(name + "="));
      if (line) return line.slice(name.length + 1).trim().replace(/^["']|["']$/g, "");
    } catch { /* file missing */ }
  }
  return process.env[name] ?? "";
}

const URL_ = env("VITE_SUPABASE_URL");
const KEY = env("SUPABASE_SERVICE_ROLE_KEY");
if (!URL_ || !KEY) { console.error("Set VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in app/.env.local"); process.exit(1); }
const BUCKET = "hymn-scores";
const auth = { apikey: KEY, Authorization: `Bearer ${KEY}` };

async function list() {
  const names = [];
  for (let offset = 0; ; offset += 1000) {
    const res = await fetch(`${URL_}/storage/v1/object/list/${BUCKET}`, {
      method: "POST", headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ prefix: "", limit: 1000, offset, sortBy: { column: "name", order: "asc" } }),
    });
    if (!res.ok) throw new Error(`List failed: ${res.status} ${await res.text()}`);
    const page = await res.json();
    names.push(...page.map((f) => f.name));
    if (page.length < 1000) return names;
  }
}

const all = await list();
const have = new Set(all);
const todo = all.filter((n) => /\.png$/i.test(n) && !have.has(n.replace(/\.png$/i, ".webp")));
console.log(`${all.filter((n) => /\.png$/i.test(n)).length} PNG scores, ${todo.length} to convert`);

let before = 0, after = 0, done = 0, failed = 0;
for (const name of todo) {
  try {
    const src = await fetch(`${URL_}/storage/v1/object/public/${BUCKET}/${encodeURIComponent(name)}`);
    if (!src.ok) throw new Error(`download ${src.status}`);
    const png = Buffer.from(await src.arrayBuffer());
    // Scans are black notes on white: quality 80 keeps notes and lyrics sharp
    const webp = await sharp(png).webp({ quality: 80, effort: 5 }).toBuffer();
    const out = name.replace(/\.png$/i, ".webp");
    const up = await fetch(`${URL_}/storage/v1/object/${BUCKET}/${encodeURIComponent(out)}`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "image/webp", "Cache-Control": "max-age=31536000", "x-upsert": "true" },
      body: webp,
    });
    if (!up.ok) throw new Error(`upload ${up.status} ${await up.text()}`);
    before += png.length; after += webp.length; done++;
    if (done % 25 === 0) console.log(`${done} of ${todo.length}`);
  } catch (e) {
    failed++;
    console.error(`${name}: ${e.message}`);
  }
}
const mb = (b) => (b / 1048576).toFixed(1);
console.log(`Done: ${done} converted, ${failed} failed. ${mb(before)} MB → ${mb(after)} MB.`);
if (failed) console.log("Run the script again to retry the failed files before running the SQL.");
else console.log("Next: run supabase/hymn-scores-webp.sql in the Supabase SQL editor.");
