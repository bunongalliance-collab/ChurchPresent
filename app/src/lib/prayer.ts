// Prayer requests (supabase/prayer-requests.sql). The congregation sends them from the Nau Mpro App without signing in
// (sendPrayerRequest); the church's team reads them on the Prayer page (#prayer), chooses who follows up and marks them
// answered. Requests for the pastors only are readable by the church's admins only: the database decides.
import { supabase } from "./supabase";

export interface PrayerRequest {
  id: string; church_id: string; name: string; body: string; pastors_only: boolean;
  source: "app" | "team"; added_by: string | null; status: "open" | "answered";
  follow_up: string | null; answered_at: string | null; created_at: string;
}

export const MAX_NAME = 60;
export const MAX_BODY = 1000;

const SETUP = "Prayer requests are not set up yet. Run supabase/prayer-requests.sql in the Supabase SQL editor.";
const notSetUp = (m: string) => /prayer_request/.test(m) && /exist|schema cache|function/i.test(m);

// A random id kept on this phone, so the database can limit how often one phone sends (5 an hour)
const DEVICE_KEY = "prayerDevice";
function deviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) { id = crypto.randomUUID(); localStorage.setItem(DEVICE_KEY, id); }
    return id;
  } catch { return ""; }
}

// Send from the Nau Mpro App. Returns an error message for the person, or null when sent.
export async function sendPrayerRequest(churchId: string, name: string, body: string, pastorsOnly: boolean): Promise<string | null> {
  if (!supabase) return "Sending needs a connection to the church's database.";
  if (!navigator.onLine) return "You're offline. Connect to the internet and send again. Your words are still here.";
  const { error } = await supabase.rpc("send_prayer_request", {
    cid: churchId, req_name: name.trim().slice(0, MAX_NAME), req_body: body.trim().slice(0, MAX_BODY), only_pastors: pastorsOnly, device_id: deviceId(),
  });
  if (!error) return null;
  const m = error.message;
  if (/send_limit/.test(m)) return "You've sent several requests in the last hour. Please wait a little and send again.";
  if (/church_limit/.test(m)) return "Many requests came in just now. Please try again in an hour, or tell a pastor in person.";
  if (/no_church/.test(m)) return "This church can't receive requests yet. Choose your church again from the song list.";
  if (/empty_request/.test(m)) return "Write what we can pray for first.";
  if (notSetUp(m)) return "Prayer requests aren't open for this church yet. Please tell a pastor in person.";
  return "It didn't send. Check your connection and try again.";
}

// The team's list for one church, newest first
export async function loadPrayerRequests(churchId: string): Promise<{ data: PrayerRequest[]; error: string | null }> {
  if (!supabase) return { data: [], error: "Saving needs the Supabase settings in app/.env.local." };
  const { data, error } = await supabase.from("prayer_requests")
    .select("id, church_id, name, body, pastors_only, source, added_by, status, follow_up, answered_at, created_at")
    .eq("church_id", churchId).order("created_at", { ascending: false }).limit(300);
  if (error) return { data: [], error: notSetUp(error.message) ? SETUP : error.message };
  return { data: (data ?? []) as PrayerRequest[], error: null };
}

// Open requests nobody follows up yet: the count on the navbar's Prayer tab
export async function countNewPrayer(churchId: string): Promise<number> {
  if (!supabase) return 0;
  const { count, error } = await supabase.from("prayer_requests").select("id", { count: "exact", head: true })
    .eq("church_id", churchId).eq("status", "open").is("follow_up", null);
  return error ? 0 : count ?? 0;
}

const friendly = (m: string) =>
  /follow_up_not_on_team/.test(m) ? "That person isn't on this church's team." : notSetUp(m) ? SETUP : m;

export async function updatePrayer(id: string, patch: Partial<Pick<PrayerRequest, "status" | "follow_up" | "pastors_only">>): Promise<string | null> {
  const { error } = await supabase!.from("prayer_requests").update(patch).eq("id", id);
  return error ? friendly(error.message) : null;
}

// A request someone shared in person, added by the team
export async function addPrayer(churchId: string, name: string, body: string, pastorsOnly: boolean): Promise<string | null> {
  const { error } = await supabase!.from("prayer_requests").insert({
    church_id: churchId, name: name.trim().slice(0, MAX_NAME), body: body.trim().slice(0, MAX_BODY), pastors_only: pastorsOnly, source: "team",
  });
  return error ? friendly(error.message) : null;
}

export async function deletePrayer(id: string): Promise<string | null> {
  const { error } = await supabase!.from("prayer_requests").delete().eq("id", id);
  return error ? friendly(error.message) : null;
}

// The link that opens the prayer form in the Nau Mpro App, set to this church (for the QR code in the program)
export const prayerLink = (churchId: string) => `${window.location.origin}/nau-mpro/?church=${encodeURIComponent(churchId)}#prayer`;
