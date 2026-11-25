import { supabase } from "./supabase";
import { subKind, type Lines } from "./orderLines";
import { parseItems } from "./servicePresentation";

// "Today's service" for the Nau Mpro App: the Program's order of worship, published by the team
// (Program page → Publish to Nau Mpro App) and read by the congregation without signing in. Each service belongs to a
// church; the app asks once which church (readerChurch) and shows that church's service.
// Table: published_services (supabase/published-services.sql).

export interface PubSub { text: string; songId?: string; kind: "song" | "scripture" | "reading" | "text"; body?: string } // body: the passage or reading text
export interface PubItem { name: string; subs: PubSub[] }
export interface PublishedService { serviceDate: string; title: string; dateLabel: string; items: PubItem[]; updated: string }

const CACHE_KEY = "readerTodayService";

// The church whose service the Nau Mpro App shows, chosen once on this device. "none" = the person chose "Not now".
const CHURCH_KEY = "readerChurch";
export interface ReaderChurch { id: string; name: string }
export function readerChurch(): ReaderChurch | "none" | null {
  try { const s = localStorage.getItem(CHURCH_KEY); return s === "none" ? "none" : s ? (JSON.parse(s) as ReaderChurch) : null; } catch { return null; }
}
export function setReaderChurch(c: ReaderChurch | "none" | null) {
  try {
    if (c === null) localStorage.removeItem(CHURCH_KEY);
    else localStorage.setItem(CHURCH_KEY, c === "none" ? "none" : JSON.stringify(c));
    localStorage.removeItem(CACHE_KEY);
  } catch { /* storage blocked: asked again next time */ }
}
// The churches to choose from (accepted churches, readable without signing in)
export async function loadChurchList(): Promise<ReaderChurch[] | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("church_names");
  if (error) return null;
  return ((data ?? []) as ReaderChurch[]).sort((a, b) => a.name.localeCompare(b.name));
}

// The order of worship as the congregation sees it: item names and their songs, passages and readings.
// The reader is public, so people's names are left out, and so are free-text lines (prelude, prayers, message and the
// rest), where names are often typed. The database drops them too (supabase/privacy-fixes.sql).
// bodyFor gives the text of a passage or reading, so the app can open it like a song.
export function toPublishedItems(lines: Lines, bodyFor: (kind: PubSub["kind"], text: string) => string | undefined = () => undefined): PubItem[] {
  return parseItems(lines).map((it) => {
    const kind = subKind(it.name);
    return {
      name: it.name,
      subs: (kind === "text" ? [] : it.subs).map((s) => {
        const body = kind === "scripture" || kind === "reading" ? bodyFor(kind, s.text)?.trim() : undefined;
        return { text: s.text, kind, ...(s.line.songId ? { songId: s.line.songId } : {}), ...(body ? { body } : {}) };
      }),
    };
  });
}

// The congregation's list: items that name a song, choir song, reading or passage. Empty items and the rest
// (prelude, prayers, offering, message) are left out.
export const followAlong = (items: PubItem[]): PubItem[] =>
  items.map((it) => ({ ...it, subs: it.subs.filter((x) => x.kind !== "text" && x.text.trim()) })).filter((it) => it.subs.length > 0);

// Reading text from the Readings page, matched by "number. title" or title
async function readingBodies(lines: Lines): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  if (!supabase) return out;
  const wanted = parseItems(lines).filter((it) => subKind(it.name) === "reading").flatMap((it) => it.subs.map((x) => x.text));
  if (!wanted.length) return out;
  const { data } = await supabase.from("readings").select("number, title, content");
  const norm = (t: string) => t.normalize("NFC").toLowerCase().replace(/\s+/g, " ").trim();
  for (const w of wanted) {
    const m = w.match(/^\s*(\d+)\s*[.)\-:]?\s*(.*)$/);
    const row = (data ?? []).find((r) => m ? String(r.number ?? "") === m[1] && (!m[2] || norm(r.title ?? "") === norm(m[2])) : norm(r.title ?? "") === norm(w));
    if (row?.content) out[w] = String(row.content);
  }
  return out;
}

const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// Which service to show: the next one from today on, else the most recent one if it was in the last 6 days
export function pickService<T extends { serviceDate: string }>(rows: T[], today = new Date()): T | null {
  const t = isoDay(today);
  const ahead = rows.filter((r) => r.serviceDate >= t).sort((a, b) => a.serviceDate.localeCompare(b.serviceDate));
  if (ahead.length) return ahead[0];
  const weekAgo = new Date(today); weekAgo.setDate(weekAgo.getDate() - 6);
  const recent = rows.filter((r) => r.serviceDate >= isoDay(weekAgo)).sort((a, b) => b.serviceDate.localeCompare(a.serviceDate));
  return recent[0] ?? null;
}

// Publish (or update) the service for its date. Needs a signed-in team member.
// passages: scripture text by reference, from the saved studies
export async function publishService(p: { ownerId: string; churchId: string | null; serviceDate: string; title: string; dateLabel: string; lines: Lines; passages: Record<string, string> }): Promise<string | null> {
  if (!supabase) return "No database settings.";
  if (!p.churchId) return "Publishing is for a church. Join or start one on the Team page, then publish again.";
  const readings = await readingBodies(p.lines);
  const { error } = await supabase.from("published_services").upsert({
    owner_id: p.ownerId, church_id: p.churchId, service_date: p.serviceDate, title: p.title, date_label: p.dateLabel,
    items: toPublishedItems(p.lines, (kind, text) => (kind === "scripture" ? p.passages[text] : readings[text])), updated_at: new Date().toISOString(),
  }, { onConflict: "church_id,service_date" });
  if (!error) return null;
  if (/published_services/.test(error.message) && /exist|schema cache/i.test(error.message)) return "The published services table is not set up yet. Run supabase/published-services.sql in the Supabase SQL editor.";
  // Only the church's admins may publish (supabase/churches-services.sql)
  if (/row-level security/i.test(error.message)) return "Only this church's admins can publish to the Nau Mpro App. Ask an admin to publish it, or to make you an admin on the Team page.";
  return error.message;
}

function readCache(): PublishedService | null {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) || "null"); } catch { return null; }
}

// The service for the reader: the latest from the database, kept on the device so it opens offline
// today: the day to pick the service for (the Bible reader passes the church's date)
export async function loadTodayService(churchId: string | null, today = new Date()): Promise<PublishedService | null> {
  if (!churchId) return null;
  const cached = readCache();
  const fromCache = cached ? pickService([cached], today) : null;
  if (!supabase) return fromCache;
  try {
    const since = new Date(today); since.setDate(since.getDate() - 6);
    const { data, error } = await supabase.from("published_services")
      .select("service_date, title, date_label, items, updated_at")
      .eq("church_id", churchId).gte("service_date", isoDay(since)).order("service_date").limit(20);
    if (error) return fromCache;
    const rows: PublishedService[] = (data ?? []).map((r) => ({
      serviceDate: r.service_date, title: r.title ?? "", dateLabel: r.date_label ?? "",
      items: Array.isArray(r.items) ? (r.items as PubItem[]) : [], updated: r.updated_at ?? "",
    }));
    const pick = pickService(rows, today);
    try { if (pick) localStorage.setItem(CACHE_KEY, JSON.stringify(pick)); else localStorage.removeItem(CACHE_KEY); } catch { /* storage blocked */ }
    return pick;
  } catch {
    return fromCache;
  }
}
