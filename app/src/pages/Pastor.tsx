import { useEffect, useState, type ReactNode } from "react";
import NavBar from "../components/NavBar";
import { useChurch } from "../lib/church";
import { type Lines } from "../lib/orderLines";
import { usePastor } from "../lib/pastor";
import { loadPrayerRequests, markPrayed, MAX_NOTE, unmarkPrayed, type PrayerRequest } from "../lib/prayer";
import { parseItems } from "../lib/servicePresentation";
import { supabase } from "../lib/supabase";
import { toast } from "../lib/toast";
import "./Pastor.css";

// Pastor page (#pastor), for members marked Pastor on the Team page (supabase/pastors.sql). One focused column:
// a link to Sunday's program, "Pray today" (open requests no pastor has prayed for yet, with "I prayed" and a short
// note the sender sees in Nau Mpro; supabase/prayer-feedback.sql), then "Prayed" and "My work" folded away.
// Approved sample: the "Pastor page" artifact (focused version).

const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const ago = (iso: string) => {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 60) return min <= 1 ? "just now" : `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? "yesterday" : d < 7 ? `${d} days ago` : new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
};
const hello = () => { const h = new Date().getHours(); return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening"; };
const WEEK2 = 14 * 86400e3;

interface Sunday { date: string; sermon: string }
interface Work { id: string; kind: "study" | "presentation"; title: string; updated: string; private: boolean }

// The sermon title from a program's Order of Worship (typed lines, or older rows)
function sermonOf(data: unknown): string {
  const d = (data ?? {}) as { lines?: Lines; rows?: { item: string; detail: string }[] };
  if (d.lines) return parseItems(d.lines).find((it) => /message|sermon|preach/i.test(it.name))?.subs[0]?.text ?? "";
  return (d.rows ?? []).find((r) => /message|sermon|preach/i.test(r.item))?.detail.trim() ?? "";
}

export default function Pastor() {
  const church = useChurch();
  const cur = church.current;
  const me = church.session?.user.id ?? "";
  const pastor = usePastor();
  const cid = cur?.status === "active" ? cur.id : "";
  const [prayers, setPrayers] = useState<PrayerRequest[] | null>(null);
  const [setup, setSetup] = useState(true);
  const [sunday, setSunday] = useState<Sunday | null>(null);
  const [work, setWork] = useState<Work[] | null>(null);
  const [noteFor, setNoteFor] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState("");

  useEffect(() => { document.title = "Pastor · Church Tools"; }, []);

  useEffect(() => {
    if (!supabase || !cid || !me || !pastor.isPastor) return;
    const sb = supabase;
    let live = true;
    void loadPrayerRequests(cid).then((r) => {
      if (!live) return;
      setPrayers(r.data);
      // Without prayer-feedback.sql the rows have no prayed_at at all
      setSetup(!r.data.length || r.data.some((p) => p.prayed_at !== undefined));
    });
    void sb.from("programs").select("service_date, data").eq("church_id", cid).gte("service_date", isoDay(new Date()))
      .order("service_date").limit(1).then(({ data }) => {
        const p = (data ?? [])[0] as { service_date: string; data: unknown } | undefined;
        if (live) setSunday(p ? { date: p.service_date, sermon: sermonOf(p.data) } : null);
      });
    void Promise.all([
      sb.from("scripture_studies").select("id, study_title, updated_at, private").eq("owner_id", me).order("updated_at", { ascending: false }).limit(5),
      sb.from("presentations").select("id, title, updated_at, private").eq("owner_id", me).order("updated_at", { ascending: false }).limit(5),
    ]).then(([s, pr]) => {
      const list: Work[] = [
        ...((s.data ?? []) as { id: string; study_title: string; updated_at: string; private?: boolean }[])
          .map((r) => ({ id: r.id, kind: "study" as const, title: r.study_title || "Untitled study", updated: r.updated_at, private: !!r.private })),
        ...((pr.data ?? []) as { id: string; title: string; updated_at: string; private?: boolean }[])
          .map((r) => ({ id: r.id, kind: "presentation" as const, title: r.title || "Untitled presentation", updated: r.updated_at, private: !!r.private })),
      ].sort((a, b) => b.updated.localeCompare(a.updated)).slice(0, 5);
      if (live) setWork(list);
    });
    return () => { live = false; };
  }, [cid, me, pastor.isPastor]);

  async function prayed(p: PrayerRequest, withNote = "") {
    setBusy(p.id);
    const err = await markPrayed(p.id, withNote);
    setBusy("");
    if (err) { toast(err, true); return; }
    setPrayers((l) => (l ?? []).map((x) => (x.id === p.id ? { ...x, prayed_at: new Date().toISOString(), prayed_by: me, pastor_note: withNote.trim() } : x)));
    setNoteFor(""); setNote("");
    toast(withNote.trim() ? "Prayed, and your note was sent" : "Marked as prayed");
  }
  async function undo(p: PrayerRequest) {
    const err = await unmarkPrayed(p.id);
    if (err) { toast(err, true); return; }
    setPrayers((l) => (l ?? []).map((x) => (x.id === p.id ? { ...x, prayed_at: null, prayed_by: null, pastor_note: "" } : x)));
  }

  let gate: ReactNode = null;
  if (church.ready && !church.session) gate = <p className="ps-note">Sign in to see the Pastor page.</p>;
  else if (church.ready && !cid) gate = <p className="ps-note">The Pastor page belongs to a church. Join or start one on the <a href="#team">Team page</a>.</p>;
  else if (pastor.ready && pastor.missing) gate = <p className="ps-note">The Pastor tag is not set up yet. Run supabase/pastors.sql in the Supabase SQL editor.</p>;
  else if (pastor.ready && !pastor.isPastor) gate = <p className="ps-note">This page is for pastors. An admin can mark you as Pastor on the <a href="#team">Team page</a>.</p>;

  const open = (prayers ?? []).filter((p) => p.status === "open" && !p.prayed_at);
  const done = (prayers ?? []).filter((p) => p.prayed_at && Date.now() - new Date(p.prayed_at).getTime() < WEEK2);
  const who = (p: PrayerRequest) => p.name || "Anonymous";

  return (
    <>
      <NavBar />
      <main className="ps">
        {gate ?? (!pastor.ready ? <p className="empty">Loading…</p> : (
          <>
            <h1>{hello()}</h1>
            <a className="ps-sun" href="#program">
              {sunday
                ? <><b>{new Date(sunday.date + "T12:00").toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}{sunday.sermon && ` · ${sunday.sermon}`}</b> Program →</>
                : <><b>No program for Sunday yet</b> Program →</>}
            </a>

            <h2 id="ps-today">Pray today</h2>
            {!setup && <p className="ps-note">To mark requests as prayed, run supabase/prayer-feedback.sql in the Supabase SQL editor.</p>}
            {prayers === null ? <p className="empty">Loading…</p> : (
              <ul className="ps-rows" aria-labelledby="ps-today">
                {open.length ? open.map((p) => (
                  <li className="ps-req" key={p.id}>
                    <div className="ps-who"><b>{who(p)}</b> · {ago(p.created_at)}{p.pastors_only && <> · <span className="ps-lock">Pastors only</span></>}</div>
                    <p className="ps-body">{p.body}</p>
                    <div className="ps-side">
                      <button className="ps-pray" disabled={busy === p.id || !setup} onClick={() => void prayed(p)}>I prayed</button>
                      {noteFor !== p.id && <button className="ps-link" disabled={!setup} onClick={() => { setNoteFor(p.id); setNote(""); }}>Add a note</button>}
                    </div>
                    {noteFor === p.id && (
                      <form className="ps-noteform" onSubmit={(e) => { e.preventDefault(); if (note.trim()) void prayed(p, note); }}>
                        <label className="ps-sr" htmlFor={`ps-n-${p.id}`}>Note to {who(p)}</label>
                        <input id={`ps-n-${p.id}`} autoFocus value={note} maxLength={MAX_NOTE} placeholder="We're praying with you."
                          onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => { if (e.key === "Escape") setNoteFor(""); }} />
                        <button type="submit" disabled={!note.trim() || busy === p.id}>Send</button>
                        <p className="ps-hint">{p.source === "app" ? `${p.name || "The sender"} sees this in Nau Mpro.` : "Added by the team, so only the team sees this note."}</p>
                      </form>
                    )}
                  </li>
                )) : <li className="ps-empty">{(prayers ?? []).length ? "Everyone has been prayed for. Thank you." : "No prayer requests yet."}</li>}
              </ul>
            )}

            {!!done.length && (
              <details className="ps-fold">
                <summary>Prayed · {done.length}</summary>
                {done.map((p) => (
                  <div className="ps-done" key={p.id}>
                    <span><b>{who(p)}</b> · {p.body}</span>
                    <button className="ps-link" onClick={() => void undo(p)}>Undo</button>
                    {p.pastor_note && <q>{p.pastor_note}</q>}
                  </div>
                ))}
              </details>
            )}

            <details className="ps-fold">
              <summary>My work{work ? ` · ${work.length}` : ""}</summary>
              {work?.length ? work.map((w) => (
                <div className="ps-wk" key={`${w.kind}-${w.id}`}>
                  <a href={w.kind === "presentation" ? `#builder:${w.id}` : "#scripture"}>{w.title}</a>
                  <span>{w.kind === "study" ? "Study" : "Presentation"} · {w.private ? "Only me" : "Team"}</span>
                </div>
              )) : <p className="ps-hint">Your scripture studies and presentations show here.</p>}
            </details>
          </>
        ))}
      </main>
    </>
  );
}
