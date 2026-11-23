// Churches, teams and roles (supabase/churches.sql). One small shared store: the signed-in account, the churches it
// belongs to, and which one is current. The navbar switcher and the Team page both read it.
import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";

export type Role = "admin" | "editor";
export interface Church { id: string; name: string; status: "waiting" | "active"; role: Role; join_code: string | null }
export interface ChurchState {
  ready: boolean;          // first load finished
  session: Session | null;
  churches: Church[];
  current: Church | null;
  requests: { church_id: string; name: string }[];  // my join requests still waiting
  siteAdmin: boolean;
  missing: boolean;        // churches.sql not run yet
}

const CURRENT_KEY = "church.current";
const readCurrent = () => { try { return localStorage.getItem(CURRENT_KEY); } catch { return null; } };
const writeCurrent = (id: string) => { try { localStorage.setItem(CURRENT_KEY, id); } catch { /* storage blocked */ } };

let state: ChurchState = { ready: !supabase, session: null, churches: [], current: null, requests: [], siteAdmin: false, missing: false };
const listeners = new Set<() => void>();
const set = (patch: Partial<ChurchState>) => { state = { ...state, ...patch }; listeners.forEach((f) => f()); };

const pick = (list: Church[], id: string | null) => list.find((c) => c.id === id) ?? list.find((c) => c.status === "active") ?? list[0] ?? null;

let loading: Promise<void> | null = null;
export function reloadChurches(): Promise<void> {
  if (!supabase) return Promise.resolve();
  const sb = supabase;
  loading ??= (async () => {
    const { data } = await sb.auth.getSession();
    const session = data.session;
    if (!session) { set({ ready: true, session: null, churches: [], current: null, requests: [], siteAdmin: false }); return; }
    await sb.rpc("claim_invites");   // join churches that invited this email
    const [mine, reqs, admin] = await Promise.all([sb.rpc("my_churches"), sb.rpc("my_requests"), sb.rpc("is_site_admin")]);
    const missing = !!mine.error && /my_churches|function|schema cache/i.test(mine.error.message);
    const churches = (mine.data ?? []) as Church[];
    const current = pick(churches, readCurrent());
    if (current) writeCurrent(current.id);
    set({ ready: true, session, churches, current, requests: (reqs.data ?? []) as ChurchState["requests"], siteAdmin: admin.data === true, missing });
  })().finally(() => { loading = null; });
  return loading;
}

export function switchChurch(id: string) {
  const c = state.churches.find((x) => x.id === id);
  if (!c) return;
  writeCurrent(id);
  set({ current: c });
}

let started = false;
function start() {
  if (started || !supabase) return;
  started = true;
  void reloadChurches();
  supabase.auth.onAuthStateChange((e) => { if (e === "SIGNED_IN" || e === "SIGNED_OUT" || e === "USER_UPDATED") void reloadChurches(); });
  // Another tab switched church
  window.addEventListener("storage", (e) => { if (e.key === CURRENT_KEY && e.newValue) switchChurch(e.newValue); });
}

export function useChurch(): ChurchState {
  const [, tick] = useState(0);
  useEffect(() => {
    start();
    const f = () => tick((n) => n + 1);
    listeners.add(f);
    return () => { listeners.delete(f); };
  }, []);
  return state;
}

// ---------- Team ----------
export interface Member { user_id: string; email: string; role: Role; added_at: string }
export interface JoinRequest { user_id: string; email: string; created_at: string }
export interface Invite { email: string; role: Role; created_at: string }
export interface WaitingChurch { id: string; name: string; created_at: string }

type R<T> = { data: T; error: string | null };
const err = (e: { message: string } | null) => (e ? e.message : null);

export async function loadTeam(cid: string): Promise<R<{ members: Member[]; requests: JoinRequest[]; invites: Invite[] }>> {
  const sb = supabase!;
  const [m, r, i] = await Promise.all([
    sb.from("church_members").select("user_id, email, role, added_at").eq("church_id", cid).order("added_at"),
    sb.from("church_requests").select("user_id, email, created_at").eq("church_id", cid).order("created_at"),
    sb.from("church_invites").select("email, role, created_at").eq("church_id", cid).order("created_at"),
  ]);
  return {
    data: { members: (m.data ?? []) as Member[], requests: (r.data ?? []) as JoinRequest[], invites: (i.data ?? []) as Invite[] },
    error: err(m.error) ?? err(r.error) ?? err(i.error),
  };
}

export async function loadWaitingChurches(): Promise<WaitingChurch[]> {
  const { data } = await supabase!.from("churches").select("id, name, created_at").eq("status", "waiting").order("created_at");
  return (data ?? []) as WaitingChurch[];
}

const call = async (fn: string, args: Record<string, unknown>) => { const { data, error } = await supabase!.rpc(fn, args); return { data, error: err(error) }; };
export const acceptRequest = (cid: string, uid: string, role: Role) => call("accept_request", { cid, uid, new_role: role });
export const declineRequest = async (cid: string, uid: string) => ({ error: err((await supabase!.from("church_requests").delete().eq("church_id", cid).eq("user_id", uid)).error) });
export const setRole = async (cid: string, uid: string, role: Role) => ({ error: err((await supabase!.from("church_members").update({ role }).eq("church_id", cid).eq("user_id", uid)).error) });
export const removeMember = async (cid: string, uid: string) => ({ error: err((await supabase!.from("church_members").delete().eq("church_id", cid).eq("user_id", uid)).error) });
export const invite = async (cid: string, email: string, role: Role) => ({ error: err((await supabase!.from("church_invites").upsert({ church_id: cid, email: email.trim().toLowerCase(), role })).error) });
export const cancelInvite = async (cid: string, email: string) => ({ error: err((await supabase!.from("church_invites").delete().eq("church_id", cid).eq("email", email)).error) });
export const renameChurch = async (cid: string, name: string) => ({ error: err((await supabase!.from("churches").update({ name: name.trim() }).eq("id", cid)).error) });
export const renewCode = (cid: string) => call("renew_join_code", { cid });
export const requestJoin = (code: string) => call("request_join", { code });
export const cancelRequest = async (cid: string) => {
  const uid = state.session?.user.id;
  return { error: err((await supabase!.from("church_requests").delete().eq("church_id", cid).eq("user_id", uid ?? "")).error) };
};
export const startChurch = (name: string) => call("start_church", { church_name: name });
export const acceptChurch = (cid: string) => call("accept_church", { cid });
export const declineChurch = (cid: string) => call("decline_church", { cid });

// ---------- Songs and readings (supabase/churches-songs-readings.sql) ----------
// The church new songs and readings are saved to: the current church once it is accepted, otherwise none (your own)
export const saveChurchId = (): string | null => (state.current?.status === "active" ? state.current.id : null);

// Whether the signed-in account may change a song or reading. Matches can_edit_row in the database:
// a church's rows: anyone on that church's team; rows with no church: whoever saved them; the shared hymn book
// (no church, no owner): site admins.
export function canEdit(row: { owner?: string | null; church?: string | null }): boolean {
  const uid = state.session?.user.id;
  if (!uid) return false;
  if (row.church) return state.churches.some((c) => c.id === row.church && c.status === "active");
  if (row.owner) return row.owner === uid;
  return state.siteAdmin;
}

// Names of accepted churches, for small labels ("from Example Church B"). Loaded once, readable without signing in.
let names: Record<string, string> | null = null;
let namesLoading: Promise<void> | null = null;
export function useChurchNames(): Record<string, string> {
  const [, tick] = useState(0);
  useEffect(() => {
    if (names || !supabase) return;
    const sb = supabase;
    namesLoading ??= (async () => {
      const { data } = await sb.rpc("church_names");
      names = Object.fromEntries(((data ?? []) as { id: string; name: string }[]).map((c) => [c.id, c.name]));
    })();
    void namesLoading.then(() => tick((n) => n + 1));
  }, []);
  return names ?? {};
}

// Wait for the first load of the account's churches (so a page doesn't act before it knows the church)
export async function churchReady(): Promise<ChurchState> {
  start();
  while (!state.ready) await (loading ?? reloadChurches());
  return state;
}
export const currentChurchId = (): string | null => state.current?.id ?? null;
