import { useCallback, useEffect, useMemo, useState } from "react";
import NavBar from "../components/NavBar";
import { loadTeam, useChurch, type Member } from "../lib/church";
import { addPrayer, deletePrayer, loadPrayerRequests, MAX_BODY, MAX_NAME, prayerLink, updatePrayer, type PrayerRequest } from "../lib/prayer";
import { usePastor } from "../lib/pastor";
import { qrSvg } from "../lib/remote";
import { supabase } from "../lib/supabase";
import { toast } from "../lib/toast";
import "./Prayer.css";

// Prayer page (#prayer): the church's prayer requests, sent from the Nau Mpro App or added by the team.
// The team chooses who follows up and marks requests answered. Requests for the pastors only show to admins only
// (the database decides, supabase/prayer-requests.sql and pastors.sql). "Pastors" are the members marked Pastor on the
// Team page, or the admins when no one is. Pastors can mark a request for the pastors only; admins can delete.

type Filter = "open" | "answered" | "all";
const FILTERS: { key: Filter; label: string }[] = [{ key: "open", label: "Open" }, { key: "answered", label: "Answered" }, { key: "all", label: "All" }];

// "Today, 9:12 AM", "Yesterday", "Sun, Nov 23", "Nov 9, 2025"
function when(iso: string): string {
  const d = new Date(iso), now = new Date();
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(now) - day(d)) / 86400000);
  if (diff === 0) return `Today, ${d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
  if (diff === 1) return "Yesterday";
  if (diff < 7) return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", ...(d.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}) });
}

const LOCK = <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>;

export default function Prayer() {
  const church = useChurch();
  const cur = church.current;
  const me = church.session?.user.id ?? null;
  const admin = cur?.role === "admin";
  const pastor = usePastor();
  const pastorAccess = pastor.access;
  const [list, setList] = useState<PrayerRequest[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<Filter>("open");
  const [busy, setBusy] = useState("");
  // Adding a request someone shared in person
  const [adding, setAdding] = useState(false);
  const [addName, setAddName] = useState("");
  const [addBody, setAddBody] = useState("");
  const [addPastors, setAddPastors] = useState(false);

  useEffect(() => { document.title = "Prayer · Church Tools"; }, []);

  const reload = useCallback(async () => {
    if (!cur || cur.status !== "active") { setList([]); setLoading(false); return; }
    const r = await loadPrayerRequests(cur.id);
    setList(r.data); setError(r.error ?? ""); setLoading(false);
  }, [cur]);

  useEffect(() => {
    setLoading(true);
    void reload();
    if (cur) void loadTeam(cur.id).then((r) => setMembers(r.data.members));
    // New requests come in while the page is open: check every minute, and when the page comes back into view
    const t = window.setInterval(() => { if (document.visibilityState === "visible") void reload(); }, 60000);
    const onShow = () => { if (document.visibilityState === "visible") void reload(); };
    document.addEventListener("visibilitychange", onShow);
    return () => { window.clearInterval(t); document.removeEventListener("visibilitychange", onShow); };
  }, [cur, reload]);

  const counts = useMemo(() => ({
    open: list.filter((p) => p.status === "open").length,
    answered: list.filter((p) => p.status === "answered").length,
    all: list.length,
  }), [list]);
  const shown = list.filter((p) => filter === "all" || p.status === filter);
  const memberName = (uid: string | null) => {
    if (!uid) return "";
    const m = members.find((x) => x.user_id === uid);
    return m ? (uid === me ? `${m.email} (you)` : m.email) : "Someone no longer on the team";
  };

  // Change one request: shown at once, put back if the database says no
  async function change(p: PrayerRequest, patch: Partial<Pick<PrayerRequest, "status" | "follow_up" | "pastors_only">>) {
    const before = list;
    setBusy(p.id);
    setList((l) => l.map((x) => (x.id === p.id ? { ...x, ...patch } : x)));
    const err = await updatePrayer(p.id, patch);
    setBusy("");
    if (err) { setList(before); toast(err, true); return; }
    // Someone who isn't a pastor can no longer see a request once it's for the pastors only
    if (patch.pastors_only && !pastorAccess) setList((l) => l.filter((x) => x.id !== p.id));
  }

  async function remove(p: PrayerRequest) {
    if (!window.confirm(`Delete the request from ${p.name || "Anonymous"}? This can't be undone.`)) return;
    setBusy(p.id);
    const err = await deletePrayer(p.id);
    setBusy("");
    if (err) { toast(err, true); return; }
    setList((l) => l.filter((x) => x.id !== p.id));
    toast("Request deleted.");
  }

  async function add() {
    if (!cur || !addBody.trim()) return;
    setBusy("add");
    const err = await addPrayer(cur.id, addName, addBody, addPastors);
    setBusy("");
    if (err) { toast(err, true); return; }
    setAddName(""); setAddBody(""); setAddPastors(false); setAdding(false);
    if (addPastors && !pastorAccess) toast("Added for the pastors only. Only the pastors can see it.");
    else toast("Request added.");
    void reload();
  }

  const link = cur ? prayerLink(cur.id) : "";
  const qr = useMemo(() => (link ? qrSvg(link) : ""), [link]);
  async function copyLink() {
    try { await navigator.clipboard.writeText(link); toast("Link copied."); } catch { toast("Couldn't copy. Select the link and copy it.", true); }
  }

  // ---------- States before the list ----------
  let notice: React.ReactNode = null;
  if (!supabase) notice = <p className="status error">Saving needs the Supabase settings in app/.env.local.</p>;
  else if (church.ready && !church.session) notice = <p className="py-note">Sign in to see your church's prayer requests.</p>;
  else if (church.ready && !cur) notice = <p className="py-note">Prayer requests belong to a church. Join or start one on the <a href="#team">Team page</a>.</p>;
  else if (cur && cur.status !== "active") notice = <p className="py-note">{cur.name} is waiting to be accepted. Prayer requests open once it is.</p>;

  return (
    <>
      <NavBar />
      <div className="py">
        <header className="py-top">
          <div>
            <h1>Prayer requests</h1>
            <p>From the Nau Mpro App and from the team. Choose who follows up, and mark a request answered when God answers it.</p>
          </div>
          {cur?.status === "active" && !error && (
            <button className="secondary" onClick={() => setAdding((a) => !a)} aria-expanded={adding}>{adding ? "Cancel" : "+ Add a request"}</button>
          )}
        </header>

        {notice}
        {error && <p className="status error">{error}</p>}

        {cur?.status === "active" && !error && (
          <div className="py-grid">
            <div className="py-main">
              {adding && (
                <form className="py-add" onSubmit={(e) => { e.preventDefault(); void add(); }}>
                  <h2>Add a request someone shared with you</h2>
                  <label>Name <input value={addName} maxLength={MAX_NAME} onChange={(e) => setAddName(e.target.value)} placeholder="Optional" /></label>
                  <label>Request <textarea value={addBody} maxLength={MAX_BODY} rows={3} onChange={(e) => setAddBody(e.target.value)} /></label>
                  <label className="py-check"><input type="checkbox" checked={addPastors} onChange={(e) => setAddPastors(e.target.checked)} /> Only the pastors</label>
                  <div><button className="primary" type="submit" disabled={!addBody.trim() || busy === "add"}>{busy === "add" ? "Adding…" : "Add request"}</button></div>
                </form>
              )}

              <div className="py-chips" role="group" aria-label="Show">
                {FILTERS.map((f) => (
                  <button key={f.key} aria-pressed={filter === f.key} onClick={() => setFilter(f.key)}>{f.label}<span>{counts[f.key]}</span></button>
                ))}
              </div>

              {loading ? <p className="empty">Loading prayer requests…</p>
                : !shown.length ? (
                  <p className="py-empty">{filter === "answered" ? "No answered requests yet." : list.length ? "No open requests. Everything has been answered." : "No prayer requests yet. Share the link or QR code so the church can send them from the Nau Mpro App."}</p>
                ) : (
                  <ul className="py-list">
                    {shown.map((p) => {
                      const isNew = p.status === "open" && !p.follow_up;
                      return (
                        <li key={p.id} className={`py-card${p.pastors_only ? " is-private" : ""}${p.status === "answered" ? " is-done" : ""}`}>
                          <div className="py-who">
                            <b>{p.name || "Anonymous"}</b>
                            <span className="py-when">{when(p.created_at)}</span>
                            {isNew && <span className="py-badge new">New</span>}
                            {p.pastors_only && <span className="py-badge lock">{LOCK}Only the pastors</span>}
                            {p.status === "answered" && <span className="py-badge done">Answered{p.answered_at ? ` ${when(p.answered_at).replace("Today, ", "today ")}` : ""}</span>}
                          </div>
                          <p className="py-body">{p.body}</p>
                          {p.source === "team" && <p className="py-src">Added by {memberName(p.added_by) || "the team"}</p>}
                          <div className="py-foot">
                            <label className="py-follow">Following up
                              <select value={p.follow_up ?? ""} disabled={busy === p.id} onChange={(e) => void change(p, { follow_up: e.target.value || null })}>
                                <option value="">No one yet</option>
                                {members.map((m) => <option key={m.user_id} value={m.user_id}>{m.user_id === me ? `Me (${m.email})` : m.email}</option>)}
                                {p.follow_up && !members.some((m) => m.user_id === p.follow_up) && <option value={p.follow_up}>{memberName(p.follow_up)}</option>}
                              </select>
                            </label>
                            <div className="py-acts">
                              {p.status === "open" && !p.follow_up && me && members.some((m) => m.user_id === me) && (
                                <button className="secondary small" disabled={busy === p.id} onClick={() => void change(p, { follow_up: me })}>I'll follow up</button>
                              )}
                              <button className={`small ${p.status === "answered" ? "secondary" : "primary"}`} disabled={busy === p.id}
                                onClick={() => void change(p, { status: p.status === "answered" ? "open" : "answered" })}>
                                {p.status === "answered" ? "Reopen" : "Mark answered"}
                              </button>
                              {(admin || pastorAccess) && (
                                <details className="py-more">
                                  <summary aria-label={`More for the request from ${p.name || "Anonymous"}`}>More</summary>
                                  <div className="py-menu">
                                    {pastorAccess && <button onClick={(e) => { (e.currentTarget.closest("details") as HTMLDetailsElement).open = false; void change(p, { pastors_only: !p.pastors_only }); }}>
                                      {p.pastors_only ? "Share with the whole team" : "Make it pastors only"}
                                    </button>}
                                    {admin && <button className="danger" onClick={(e) => { (e.currentTarget.closest("details") as HTMLDetailsElement).open = false; void remove(p); }}>Delete</button>}
                                  </div>
                                </details>
                              )}
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
            </div>

            <aside className="py-side">
              <h2>Ask in the Nau Mpro App</h2>
              <p>Anyone can send a request from the Nau Mpro App, no account needed. Print this code in the program, or share the link.</p>
              <div className="py-share">
                <div className="py-qr" role="img" aria-label="QR code that opens the prayer request form" dangerouslySetInnerHTML={{ __html: qr }} />
                <div className="py-link">
                  <code>{link}</code>
                  <button className="secondary small" onClick={() => void copyLink()}>Copy link</button>
                </div>
              </div>
              <h2>Who sees what</h2>
              <p>The team sees every request, except those marked <b className="py-lock-word">Only the pastors</b>, which only {pastor.anyPastor ? "the members marked Pastor on the Team page" : "the admins (no one is marked Pastor yet)"} see.{!pastorAccess && " You won't see those."}</p>
              <p>The team is told on the bell when a request comes in.</p>
            </aside>
          </div>
        )}
      </div>
    </>
  );
}
