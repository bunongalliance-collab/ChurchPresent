// Service programs shared with the church team (supabase/programs.sql). The Program page keeps working on its local
// draft (Service Slides reads it); this keeps that draft in step with the church's program for the same date:
// it loads the program, saves changes a moment after typing stops, and notices when someone else changed it.
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "./supabase";
import { churchReady, saveChurchId, useChurch } from "./church";

export interface ProgramInfo { id: string; date: string; title: string; updated: string; by: string; byEmail: string }
type Draftish = { date: string; coverKind?: string };

const toInfo = (r: { id: string; service_date: string; title: string; updated_at: string; updated_by: string | null; updated_by_email: string }): ProgramInfo =>
  ({ id: r.id, date: r.service_date, title: r.title, updated: r.updated_at, by: r.updated_by ?? "", byEmail: r.updated_by_email });
const COLS = "id, service_date, title, updated_at, updated_by, updated_by_email";
const titleOf = (d: Draftish) => (d.coverKind || "Service").toLowerCase().replace(/\b\p{L}/gu, (c) => c.toUpperCase()).slice(0, 200);
export const nextWeek = (iso: string) => { const t = new Date(iso + "T12:00"); t.setDate(t.getDate() + 7); return t.toISOString().slice(0, 10); };

export type SaveState = "off" | "loading" | "saved" | "saving" | "offline" | "error" | "missing";

// D is the Program page's Draft. normalize turns stored data back into a full draft.
export function useSharedProgram<D extends Draftish>(d: D, replace: (next: D) => void, normalize: (data: unknown) => D) {
  const church = useChurch();
  const uid = church.session?.user.id ?? null;
  const [list, setList] = useState<ProgramInfo[]>([]);
  const [published, setPublished] = useState<Set<string>>(new Set());
  const [current, setCurrent] = useState<ProgramInfo | null>(null);
  const [state, setState] = useState<SaveState>("off");
  const [notice, setNotice] = useState<ProgramInfo | null>(null);   // someone else changed the open program
  const [message, setMessage] = useState("");
  const base = useRef<string>("");           // updated_at of the version this page started from
  const skip = useRef(false);                // the next draft change came from loading, not typing
  const dirty = useRef(false);
  const latest = useRef(d);
  latest.current = d;
  const cur = useRef(current);
  cur.current = current;
  const churchId = church.ready ? saveChurchId() : undefined;

  const refreshList = useCallback(async () => {
    if (!supabase || churchId === undefined) return [] as ProgramInfo[];
    let q = supabase.from("programs").select(COLS).order("service_date");
    q = churchId ? q.eq("church_id", churchId) : q.is("church_id", null);
    const { data, error } = await q;
    if (error) { setState(/programs/.test(error.message) && /exist|schema cache/i.test(error.message) ? "missing" : "error"); setMessage(error.message); return null; }
    const rows = (data ?? []).map(toInfo);
    setList(rows);
    if (churchId) {
      const { data: pub } = await supabase.from("published_services").select("service_date").eq("church_id", churchId);
      setPublished(new Set((pub ?? []).map((r) => r.service_date as string)));
    }
    return rows;
  }, [churchId]);

  const load = useCallback(async (p: ProgramInfo) => {
    const { data, error } = await supabase!.from("programs").select(`${COLS}, data`).eq("id", p.id).single();
    if (error || !data) { setState("error"); setMessage(error?.message ?? "Not found"); return; }
    skip.current = true;
    dirty.current = false;
    base.current = data.updated_at;
    const info = toInfo(data);
    setCurrent(info);
    setNotice(null);
    replace(normalize({ ...(data.data as object), date: data.service_date }));
    setState("saved");
  }, [replace, normalize]);

  // Save the open program now. force: even if someone else changed it since (Keep mine).
  const save = useCallback(async (force = false): Promise<boolean> => {
    const p = cur.current;
    if (!supabase || !p) return false;
    if (!navigator.onLine) { setState("offline"); return false; }
    setState("saving");
    if (!force) {
      const { data: now } = await supabase.from("programs").select(COLS).eq("id", p.id).single();
      if (now && now.updated_at !== base.current && now.updated_by !== uid) { setNotice(toInfo(now)); setState("saved"); return false; }
    }
    const d0 = latest.current;
    const { data, error } = await supabase.from("programs").update({ data: d0, service_date: d0.date, title: titleOf(d0) }).eq("id", p.id).select(COLS).single();
    if (error) {
      setState("error");
      setMessage(/programs_church_date_key|duplicate/i.test(error.message) ? "Another program already uses that date. Pick that program from the list, or choose another date." : error.message);
      return false;
    }
    dirty.current = false;
    base.current = data.updated_at;
    const info = toInfo(data);
    setCurrent(info);
    setList((l) => l.map((x) => (x.id === info.id ? info : x)).sort((a, b) => a.date.localeCompare(b.date)));
    setNotice(null);
    setState("saved");
    return true;
  }, [uid]);

  const create = useCallback(async (draft: D): Promise<ProgramInfo | null> => {
    if (!supabase || !uid) return null;
    const { data, error } = await supabase.from("programs")
      .insert({ church_id: churchId ?? null, owner_id: uid, service_date: draft.date, title: titleOf(draft), data: draft }).select(COLS).single();
    if (error) {
      setMessage(/programs_church_date_key|duplicate/i.test(error.message) ? "There is already a program for that date." : error.message);
      setState("error");
      return null;
    }
    return toInfo(data);
  }, [churchId, uid]);

  // Start: once signed in and the church is known, open the program for the draft's date (or save the draft as it)
  const started = useRef<string | null>(null);
  useEffect(() => {
    if (!supabase || !uid || churchId === undefined) { if (!uid) setState("off"); return; }
    const key = `${uid}/${churchId}`;
    if (started.current === key) return;
    started.current = key;
    void (async () => {
      setState("loading");
      await churchReady();
      const rows = await refreshList();
      if (!rows) return;
      const same = rows.find((r) => r.date === latest.current.date);
      if (same) { await load(same); return; }
      const made = await create(latest.current);   // the draft this browser had becomes the church's program for its date
      if (made) { base.current = made.updated; setCurrent(made); setList((l) => [...l, made].sort((a, b) => a.date.localeCompare(b.date))); setState("saved"); }
    })();
  }, [uid, churchId, refreshList, load, create]);

  // Typing: save a moment after it stops
  useEffect(() => {
    if (skip.current) { skip.current = false; return; }
    if (!cur.current) return;
    dirty.current = true;
    const t = window.setTimeout(() => { void save(); }, 1500);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d]);

  // Coming back to the page, and every 30 seconds: did someone else change it?
  useEffect(() => {
    if (!current) return;
    const check = async () => {
      if (document.visibilityState !== "visible" || !supabase || !cur.current) return;
      const { data } = await supabase.from("programs").select(COLS).eq("id", cur.current.id).single();
      if (data && data.updated_at !== base.current && data.updated_by !== uid) {
        if (dirty.current) setNotice(toInfo(data)); else await load(toInfo(data));   // nothing typed here: just show theirs
      }
    };
    const t = window.setInterval(check, 30000);
    document.addEventListener("visibilitychange", check);
    window.addEventListener("online", check);
    return () => { window.clearInterval(t); document.removeEventListener("visibilitychange", check); window.removeEventListener("online", check); };
  }, [current, uid, load]);

  // Save before leaving the page
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (dirty.current) { void save(); e.preventDefault(); } };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [save]);

  const open = useCallback(async (p: ProgramInfo) => {
    if (dirty.current) await save();
    await load(p);
  }, [save, load]);

  // New program on the first free Sunday after the last one: a copy of the last program, or blank
  const startNew = useCallback(async (from: "copy" | "blank", blank: (date: string) => D) => {
    if (dirty.current) await save();
    const rows = (await refreshList()) ?? list;
    const last = rows[rows.length - 1];
    let date = last ? nextWeek(last.date) : nextWeek(latest.current.date);
    while (rows.some((r) => r.date === date)) date = nextWeek(date);
    let draft: D = blank(date);
    if (from === "copy" && last) {
      const { data } = await supabase!.from("programs").select("data").eq("id", last.id).single();
      if (data) draft = normalize({ ...(data.data as object), date });
    }
    const made = await create(draft);
    if (!made) return null;
    setList((l) => [...l, made].sort((a, b) => a.date.localeCompare(b.date)));
    await load(made);
    return made;
  }, [save, refreshList, list, create, load, normalize]);

  return {
    active: !!uid && state !== "off" && state !== "missing",
    state, message, list, current, published, notice, me: uid,
    open, startNew,
    showTheirs: async () => { if (cur.current) await load(cur.current); },
    keepMine: async () => { await save(true); },
  };
}
