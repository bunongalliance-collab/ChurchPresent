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

// Pastor page (#pastor), for members marked Pastor on the Team page (supabase/pastors.sql). One calm column in soft
// (neumorphic) eggshell and emerald, with its own bottom menu: Pray (Sunday card, then open requests no pastor has
// prayed for, with "I prayed" and a short note the sender sees in Nau Mpro; supabase/prayer-feedback.sql), Prayed
// (last two weeks, Undo), My work and Sunday. Approved sample: the "Pastor page" artifact (soft style, bottom menu).

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
type View = "pray" | "prayed" | "work" | "sunday";
// The bottom menu (Pastor page only)
const DOCK: { v: View; label: string; icon: ReactNode }[] = [
  { v: "pray", label: "Pray", icon: <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" /> },
  { v: "prayed", label: "Prayed", icon: <path d="M5 12.5l4.5 4.5L19 7.5" /> },
  { v: "work", label: "My work", icon: <path d="M6 4h9l4 4v12H6zM15 4v4h4M9 13h7M9 17h5" /> },
  { v: "sunday", label: "Sunday", icon: <><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M4 10h16M9 3v4M15 3v4" /></> },
];
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
  const [view, setView] = useState<View>("pray");

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

  const sunDate = sunday ? new Date(sunday.date + "T12:00").toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" }) : "";
  const goView = (v: View) => { setView(v); window.scrollTo({ top: 0 }); };

  return (
    <>
      <NavBar />
      <main className="ps">
        {gate ?? (!pastor.ready ? <p className="empty">Loading…</p> : (
          <>
            <header className="ps-head">
              <p className="ps-date">{new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</p>
              <h1>{hello()}</h1>
            </header>
            {!setup && <p className="ps-note">To mark requests as prayed, run supabase/prayer-feedback.sql in the Supabase SQL editor.</p>}

            {view === "pray" && (
              <section className="ps-view" aria-labelledby="ps-today">
                <button className="ps-sun ps-out" onClick={() => goView("sunday")}>
                  <span className="ps-sun-text"><small>{sunday ? sunDate : "This Sunday"}</small><b>{sunday ? sunday.sermon || "Sermon not filled in yet" : "No program yet"}</b></span>
                  <span className="ps-go ps-in" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6" /></svg></span>
                </button>
                <h2 id="ps-today">Pray today{prayers && open.length > 0 && <span className="ps-n ps-in">{open.length}</span>}</h2>
                {prayers === null ? <p className="empty">Loading…</p> : open.length ? (
                  <ul className="ps-cards">
                    {open.map((p) => (
                      <li className="ps-card ps-out" key={p.id}>
                        <div className="ps-who"><b>{who(p)}</b> · {ago(p.created_at)}{p.pastors_only && <> · <span className="ps-lock">Pastors only</span></>}</div>
                        <p className="ps-body">{p.body}</p>
                        <div className="ps-acts">
                          <button className="ps-btn ps-out" disabled={busy === p.id || !setup} onClick={() => void prayed(p)}>I prayed</button>
                          {noteFor !== p.id && <button className="ps-link" disabled={!setup} onClick={() => { setNoteFor(p.id); setNote(""); }}>Add a note</button>}
                        </div>
                        {noteFor === p.id && (
                          <form className="ps-noteform" onSubmit={(e) => { e.preventDefault(); if (note.trim()) void prayed(p, note); }}>
                            <label className="ps-sr" htmlFor={`ps-n-${p.id}`}>Note to {who(p)}</label>
                            <input className="ps-in" id={`ps-n-${p.id}`} autoFocus value={note} maxLength={MAX_NOTE} placeholder="We're praying with you."
                              onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => { if (e.key === "Escape") setNoteFor(""); }} />
                            <button type="submit" className="ps-solid" disabled={!note.trim() || busy === p.id}>Send</button>
                            <p className="ps-hint">{p.source === "app" ? `${p.name || "The sender"} sees this in Nau Mpro.` : "Added by the team, so only the team sees this note."}</p>
                          </form>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : <p className="ps-empty ps-in">{(prayers ?? []).length ? "Everyone has been prayed for. Thank you." : "No prayer requests yet."}</p>}
              </section>
            )}

            {view === "prayed" && (
              <section className="ps-view" aria-labelledby="ps-prayed-h">
                <h2 id="ps-prayed-h">Prayed in the last two weeks</h2>
                {done.length ? (
                  <ul className="ps-cards">
                    {done.map((p) => (
                      <li className="ps-row ps-out" key={p.id}>
                        <b>{who(p)}</b>
                        <button className="ps-link" onClick={() => void undo(p)}>Undo</button>
                        <span>{p.body}</span>
                        {p.pastor_note && <q>{p.pastor_note}</q>}
                      </li>
                    ))}
                  </ul>
                ) : <p className="ps-empty ps-in">Nothing yet. Requests you pray for show here.</p>}
              </section>
            )}

            {view === "work" && (
              <section className="ps-view" aria-labelledby="ps-work-h">
                <h2 id="ps-work-h">My work</h2>
                {work === null ? <p className="empty">Loading…</p> : work.length ? (
                  <ul className="ps-cards">
                    {work.map((w) => (
                      <li key={`${w.kind}-${w.id}`}>
                        <a className="ps-row ps-out" href={w.kind === "presentation" ? `#builder:${w.id}` : "#scripture"}>
                          <b>{w.title}</b><span className="ps-tag">{w.private ? "Only me" : "Team"}</span>
                          <span>{w.kind === "study" ? "Scripture study" : "Presentation"}</span>
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : <p className="ps-empty ps-in">Your scripture studies and presentations show here.</p>}
              </section>
            )}

            {view === "sunday" && (
              <section className="ps-view" aria-labelledby="ps-sun-h">
                <h2 id="ps-sun-h">This Sunday</h2>
                <div className="ps-card ps-out">
                  <p className="ps-who">{sunday ? sunDate : "No program yet"}</p>
                  <p className="ps-body ps-title">{sunday ? sunday.sermon || "Sermon not filled in yet" : "Start Sunday's program on the Program page."}</p>
                  <div className="ps-acts">
                    <a className="ps-solid" href="#program">Open Program</a>
                    {sunday && <a className="ps-btn ps-out" href="#service">Service Slides</a>}
                  </div>
                </div>
              </section>
            )}

            <nav className="ps-dock ps-out" aria-label="Pastor">
              {DOCK.map((d) => (
                <button key={d.v} aria-current={view === d.v ? "page" : undefined} onClick={() => goView(d.v)}>
                  <svg viewBox="0 0 24 24" aria-hidden="true">{d.icon}</svg>{d.label}
                  {d.v === "pray" && open.length > 0 && <span className="ps-badge" aria-label={`, ${open.length} to pray for`}>{open.length}</span>}
                </button>
              ))}
            </nav>
          </>
        ))}
      </main>
    </>
  );
}
