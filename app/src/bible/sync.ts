// Backup of the reader's highlights, saved verses and notes on the person's account (supabase/bible-notes.sql).
// The device copy stays the one the reader uses; this keeps the account copy in step:
//   * first sign-in on a device: the device's lists and the account's are joined, so nothing is lost
//   * later: changes here are saved a moment after they are made; on opening, newer lists from another device
//     replace these (unless there are unsaved changes here, then the two are joined)
//   * a different account on this device: its own lists replace the previous account's (which are on that account)
import { useCallback, useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";

export interface Lists { hl: Record<string, 1>; saved: Record<string, { at: number }>; notes: Record<string, { at: number }> }
type Synced = { uid: string; at: string; dirty: boolean };   // whose lists these are, the account copy they match, unsaved?
const META = "bible.sync.v1";
const readMeta = (): Synced | null => { try { return JSON.parse(localStorage.getItem(META) || "null"); } catch { return null; } };
const writeMeta = (m: Synced | null) => { try { if (m) localStorage.setItem(META, JSON.stringify(m)); else localStorage.removeItem(META); } catch { /* storage blocked */ } };

// Join two copies: every highlight from either; for saved verses and notes, the newer one of each
function join<T extends Lists>(a: T, b: Partial<Lists>): T {
  const newer = <V extends { at: number }>(x: Record<string, V>, y: Record<string, V> = {}) => {
    const out = { ...x };
    for (const [k, v] of Object.entries(y)) if (!out[k] || (v?.at ?? 0) > (out[k].at ?? 0)) out[k] = v;
    return out;
  };
  return { ...a, hl: { ...a.hl, ...(b.hl ?? {}) }, saved: newer(a.saved, b.saved as T["saved"]), notes: newer(a.notes, b.notes as T["notes"]) };
}
const pick = (s: Lists): Lists => ({ hl: s.hl, saved: s.saved, notes: s.notes });

export type SyncState = "off" | "syncing" | "saved" | "offline" | "error" | "missing";

export function useReaderSync<T extends Lists>(lists: T, replace: (fn: (cur: T) => T) => void) {
  const [session, setSession] = useState<Session | null>(null);
  const [state, setState] = useState<SyncState>("off");
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const skip = useRef(false);          // the next change came from the account copy, not from the person
  const latest = useRef(lists);
  latest.current = lists;
  const uid = session?.user.id ?? null;

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const upload = useCallback(async () => {
    if (!supabase || !uid) return;
    if (!navigator.onLine) { setState("offline"); return; }
    setState("syncing");
    const { data, error } = await supabase.from("bible_reader_data").upsert({ user_id: uid, data: pick(latest.current) }).select("updated_at").single();
    if (error) { setState(/bible_reader_data/.test(error.message) && /exist|schema cache/i.test(error.message) ? "missing" : "error"); return; }
    writeMeta({ uid, at: data.updated_at, dirty: false });
    setSavedAt(data.updated_at);
    setState("saved");
  }, [uid]);

  // Bring this device and the account copy in step (on sign-in, and when the reader comes back into view)
  const pull = useCallback(async () => {
    if (!supabase || !uid) return;
    if (!navigator.onLine) { setState("offline"); return; }
    setState("syncing");
    const { data, error } = await supabase.from("bible_reader_data").select("data, updated_at").eq("user_id", uid).maybeSingle();
    if (error) { setState(/bible_reader_data/.test(error.message) && /exist|schema cache/i.test(error.message) ? "missing" : "error"); return; }
    const meta = readMeta();
    const remote = (data?.data ?? null) as Partial<Lists> | null;
    if (!remote) { await upload(); return; }                                       // nothing on the account yet
    const apply = (fn: (cur: T) => T) => { skip.current = true; replace(fn); };
    if (!meta) apply((cur) => join(cur, remote));                                  // first time here: keep both
    else if (meta.uid !== uid) apply((cur) => ({ ...cur, hl: {}, saved: {}, notes: {}, ...remote } as T));   // another account's lists were here
    else if (meta.dirty && data!.updated_at !== meta.at) apply((cur) => join(cur, remote));   // changed in both places
    else if (!meta.dirty && data!.updated_at !== meta.at) apply((cur) => ({ ...cur, ...remote } as T));     // newer from another device
    else { setSavedAt(data!.updated_at); setState("saved"); return; }
    window.setTimeout(() => { void upload(); }, 50);   // save the result so every device starts from it
  }, [uid, replace, upload]);

  useEffect(() => { if (uid) void pull(); else setState("off"); }, [uid, pull]);
  useEffect(() => {
    if (!uid) return;
    const onShow = () => { if (document.visibilityState === "visible") void pull(); };
    document.addEventListener("visibilitychange", onShow);
    window.addEventListener("online", onShow);
    return () => { document.removeEventListener("visibilitychange", onShow); window.removeEventListener("online", onShow); };
  }, [uid, pull]);

  // A change here: mark it unsaved and save it a moment later
  const key = JSON.stringify(pick(lists));
  useEffect(() => {
    if (skip.current) { skip.current = false; return; }
    if (!uid) return;
    const meta = readMeta();
    if (meta?.uid === uid) writeMeta({ ...meta, dirty: true });
    const t = window.setTimeout(() => { void upload(); }, 2000);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { session, state, savedAt };
}
