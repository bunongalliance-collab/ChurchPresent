// Team notifications (supabase/notifications.sql): the database writes them when someone asks to join, is added,
// changes role, is removed, or a new church waits. This loads the signed-in person's latest ones, checks again every
// minute and when the page comes back into view, and marks them as read.
import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase";
import { useChurch } from "./church";

export type Kind = "join_request" | "added" | "role" | "removed" | "church_waiting" | "program_new" | "published" | "republish" | "library_changed";
export interface Note {
  id: string; kind: Kind; church_id: string | null; actor_email: string; created_at: string; read_at: string | null;
  data: {
    church_name?: string; role?: string; request_user_id?: string; email?: string;
    resolved?: "accepted" | "declined" | "withdrawn" | "republished"; resolved_by?: string;
    service_date?: string;                                                   // programs: the Sunday
    item_kind?: "song" | "reading"; item_title?: string; change?: "update" | "delete"; program_id?: string;
  };
}

let notes: Note[] = [];
let missing = false;   // notifications.sql not run yet
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((f) => f());

async function load() {
  if (!supabase) return;
  const { data: s } = await supabase.auth.getSession();
  if (!s.session) { notes = []; emit(); return; }
  const { data, error } = await supabase.from("notifications")
    .select("id, kind, church_id, actor_email, created_at, read_at, data").order("created_at", { ascending: false }).limit(30);
  if (error) { missing = /notifications/.test(error.message) && /exist|schema cache/i.test(error.message); return; }
  notes = (data ?? []) as Note[];
  emit();
}

let started = false;
function start() {
  if (started || !supabase) return;
  started = true;
  void load();
  window.setInterval(() => { if (document.visibilityState === "visible") void load(); }, 60000);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") void load(); });
  supabase.auth.onAuthStateChange((e) => { if (e === "SIGNED_IN" || e === "SIGNED_OUT") void load(); });
}

export function useNotifications() {
  const church = useChurch();
  const [, tick] = useState(0);
  useEffect(() => {
    start();
    const f = () => tick((n) => n + 1);
    listeners.add(f);
    return () => { listeners.delete(f); };
  }, []);
  // A new session (sign in) reloads
  useEffect(() => { if (church.ready) void load(); }, [church.ready, church.session?.user.id]);

  const markRead = useCallback(async (ids: string[]) => {
    if (!supabase || !ids.length) return;
    const now = new Date().toISOString();
    notes = notes.map((n) => (ids.includes(n.id) && !n.read_at ? { ...n, read_at: now } : n));
    emit();
    await supabase.from("notifications").update({ read_at: now }).in("id", ids);
  }, []);

  return { notes, unread: notes.filter((n) => !n.read_at).length, missing, reload: load, markRead };
}

// The words for a notification. Names are emails until the app has display names.
export const who = (email: string) => email || "Someone";
// "Sun, Nov 29" for a program's date
export const sunday = (iso?: string) => (iso ? new Date(iso + "T12:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }) : "a Sunday");
export const roleWord = (r?: string) => (r === "admin" ? "an admin" : "an editor");
