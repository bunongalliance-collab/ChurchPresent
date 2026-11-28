// The Pastor tag (supabase/pastors.sql): team members marked Pastor on the Team page get the Pastor page (#pastor) and
// the prayer requests marked "Only the pastors". With no pastor in a church, those requests go to its admins.
// One small shared store for the current church, read by the navbar, the Pastor page, the Prayer page and the Team page.
import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import { useChurch } from "./church";

export interface PastorState {
  ready: boolean;
  isPastor: boolean;   // the signed-in person is marked Pastor in the current church
  anyPastor: boolean;  // someone in the current church is marked Pastor
  access: boolean;     // reads "Only the pastors" requests: a pastor, or an admin when there is no pastor
  missing: boolean;    // pastors.sql not run yet
}

let state: PastorState = { ready: false, isPastor: false, anyPastor: false, access: false, missing: false };
let forKey = "";   // the church, person and role the state belongs to
const listeners = new Set<() => void>();
const set = (s: PastorState) => { state = s; listeners.forEach((f) => f()); };

async function load(cid: string, uid: string, admin: boolean) {
  if (!supabase) return;
  const key = `${cid}|${uid}|${admin}`;
  const { data, error } = await supabase.from("church_members").select("user_id, is_pastor").eq("church_id", cid);
  if (key !== forKey) return;   // the church changed while this was loading
  if (error) { set({ ready: true, isPastor: false, anyPastor: false, access: admin, missing: /is_pastor/.test(error.message) }); return; }
  const rows = (data ?? []) as { user_id: string; is_pastor: boolean }[];
  const isPastor = rows.some((r) => r.user_id === uid && r.is_pastor);
  const anyPastor = rows.some((r) => r.is_pastor);
  set({ ready: true, isPastor, anyPastor, access: isPastor || (admin && !anyPastor), missing: false });
}

let last: { cid: string; uid: string; admin: boolean } | null = null;
// After the Team page changes a tag
export function reloadPastors() { if (last) void load(last.cid, last.uid, last.admin); }

export function usePastor(): PastorState {
  const church = useChurch();
  const cid = church.current?.status === "active" ? church.current.id : "";
  const uid = church.session?.user.id ?? "";
  const admin = church.current?.role === "admin";
  const [, tick] = useState(0);
  useEffect(() => {
    const f = () => tick((n) => n + 1);
    listeners.add(f);
    return () => { listeners.delete(f); };
  }, []);
  useEffect(() => {
    const key = `${cid}|${uid}|${admin}`;
    if (!cid || !uid) { forKey = ""; if (state.ready !== church.ready || state.isPastor || state.access) set({ ready: church.ready, isPastor: false, anyPastor: false, access: false, missing: false }); return; }
    if (forKey === key) return;
    forKey = key;
    last = { cid, uid, admin };
    void load(cid, uid, admin);
  }, [cid, uid, admin, church.ready]);
  return state;
}

export async function setPastor(cid: string, uid: string, on: boolean): Promise<string | null> {
  const { error } = await supabase!.from("church_members").update({ is_pastor: on }).eq("church_id", cid).eq("user_id", uid);
  if (!error) return null;
  return /is_pastor/.test(error.message) ? "The Pastor tag is not set up yet. Run supabase/pastors.sql in the Supabase SQL editor." : error.message;
}
