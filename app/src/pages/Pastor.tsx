import { useEffect, useMemo, useState, type ReactNode } from "react";
import NavBar from "../components/NavBar";
import { useChurch } from "../lib/church";
import { subKind, type Lines } from "../lib/orderLines";
import { usePastor } from "../lib/pastor";
import { loadPrayerRequests, type PrayerRequest } from "../lib/prayer";
import { parseItems } from "../lib/servicePresentation";
import { supabase } from "../lib/supabase";
import "./Pastor.css";

// Pastor page (#pastor): one place for a pastor's week. Only members marked Pastor on the Team page see it
// (supabase/pastors.sql). It reads what the other pages already keep: prayer requests, the next program and the
// pastor's own scripture studies and presentations. Nothing new is stored here.

const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const dayLabel = (iso: string) => new Date(iso + "T12:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
const shortDate = (iso: string) => {
  const d = new Date(iso), today = isoDay(new Date());
  return isoDay(d) === today ? "today" : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
};
const hello = () => { const h = new Date().getHours(); return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening"; };

interface Sunday { id: string; date: string; published: boolean; preacher: string; sermon: string; scripture: string }
interface Work { id: string; kind: "study" | "presentation"; title: string; updated: string; private: boolean }

// The sermon, preacher and passage from a program's Order of Worship (typed lines, or older rows)
function sundayOf(data: unknown): Pick<Sunday, "preacher" | "sermon" | "scripture"> {
  const d = (data ?? {}) as { lines?: Lines; rows?: { item: string; kind: string; detail: string; led: string; ref?: string }[] };
  if (d.lines) {
    const items = parseItems(d.lines);
    const msg = items.find((it) => /message|sermon|preach/i.test(it.name));
    const scr = items.filter((it) => subKind(it.name) === "scripture").flatMap((it) => it.subs.map((x) => x.text));
    return {
      sermon: msg?.subs[0]?.text ?? "",
      preacher: msg?.subs[0]?.persons[0] ?? msg?.persons[0] ?? "",
      scripture: scr.join("; "),
    };
  }
  const rows = d.rows ?? [];
  const msg = rows.find((r) => /message|sermon|preach/i.test(r.item));
  const scr = rows.filter((r) => r.kind === "scripture").map((r) => (r.ref ?? r.detail).trim()).filter(Boolean);
  return { sermon: msg?.detail.trim() ?? "", preacher: msg?.led.trim() ?? "", scripture: scr.join("; ") };
}

const ICON = {
  prayer: <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" />,
  sunday: <><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M4 10h16M9 3v4M15 3v4" /></>,
  work: <path d="M5 4h10l4 4v12H5zM15 4v4h4M8 12h8M8 16h6" />,
  people: <><circle cx="9" cy="8" r="3.5" /><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M17 11a3 3 0 1 0 0-6M21 20c0-2.6-1.6-4.8-4-5.6" /></>,
};
const Icon = ({ k }: { k: keyof typeof ICON }) => <span className="ps-ic" aria-hidden="true"><svg viewBox="0 0 24 24">{ICON[k]}</svg></span>;

export default function Pastor() {
  const church = useChurch();
  const cur = church.current;
  const me = church.session?.user.id ?? "";
  const pastor = usePastor();
  const cid = cur?.status === "active" ? cur.id : "";
  const [prayers, setPrayers] = useState<PrayerRequest[] | null>(null);
  const [sunday, setSunday] = useState<Sunday | null | undefined>(undefined);
  const [work, setWork] = useState<Work[] | null>(null);

  useEffect(() => { document.title = "Pastor · Church Tools"; }, []);

  useEffect(() => {
    if (!supabase || !cid || !me || !pastor.isPastor) return;
    const sb = supabase;
    let live = true;
    void loadPrayerRequests(cid).then((r) => { if (live) setPrayers(r.data); });
    // The next program from today on, and whether it's published to the Nau Mpro App
    void (async () => {
      const { data } = await sb.from("programs").select("id, service_date, data").eq("church_id", cid)
        .gte("service_date", isoDay(new Date())).order("service_date").limit(1);
      const p = (data ?? [])[0] as { id: string; service_date: string; data: unknown } | undefined;
      if (!p) { if (live) setSunday(null); return; }
      const { count } = await sb.from("published_services").select("service_date", { count: "exact", head: true })
        .eq("church_id", cid).eq("service_date", p.service_date);
      if (live) setSunday({ id: p.id, date: p.service_date, published: (count ?? 0) > 0, ...sundayOf(p.data) });
    })();
    // The pastor's own scripture studies and presentations (Only me and Team), newest first
    void (async () => {
      const [s, pr] = await Promise.all([
        sb.from("scripture_studies").select("id, study_title, updated_at, private").eq("owner_id", me).order("updated_at", { ascending: false }).limit(6),
        sb.from("presentations").select("id, title, updated_at, private").eq("owner_id", me).order("updated_at", { ascending: false }).limit(6),
      ]);
      const list: Work[] = [
        ...((s.data ?? []) as { id: string; study_title: string; updated_at: string; private?: boolean }[])
          .map((r) => ({ id: r.id, kind: "study" as const, title: r.study_title || "Untitled study", updated: r.updated_at, private: !!r.private })),
        ...((pr.data ?? []) as { id: string; title: string; updated_at: string; private?: boolean }[])
          .map((r) => ({ id: r.id, kind: "presentation" as const, title: r.title || "Untitled presentation", updated: r.updated_at, private: !!r.private })),
      ].sort((a, b) => b.updated.localeCompare(a.updated)).slice(0, 6);
      if (live) setWork(list);
    })();
    return () => { live = false; };
  }, [cid, me, pastor.isPastor]);

  const pr = useMemo(() => {
    const open = (prayers ?? []).filter((p) => p.status === "open");
    const pastorsOnly = open.filter((p) => p.pastors_only);
    const mine = open.filter((p) => p.follow_up === me);
    const fresh = open.filter((p) => !p.follow_up);
    // Pastors-only first, then the ones they follow up, then new ones
    const top = [...pastorsOnly, ...mine, ...fresh].filter((p, i, all) => all.indexOf(p) === i).slice(0, 4);
    return { pastorsOnly: pastorsOnly.length, mine: mine.length, fresh: fresh.length, top };
  }, [prayers, me]);

  let gate: ReactNode = null;
  if (church.ready && !church.session) gate = <p className="ps-note">Sign in to see the Pastor page.</p>;
  else if (church.ready && !cid) gate = <p className="ps-note">The Pastor page belongs to a church. Join or start one on the <a href="#team">Team page</a>.</p>;
  else if (pastor.ready && pastor.missing) gate = <p className="ps-note">The Pastor tag is not set up yet. Run supabase/pastors.sql in the Supabase SQL editor.</p>;
  else if (pastor.ready && !pastor.isPastor) gate = <p className="ps-note">This page is for pastors. An admin can mark you as Pastor on the <a href="#team">Team page</a>.</p>;

  return (
    <>
      <NavBar />
      <div className="ps">
        {gate ?? (!pastor.ready ? <p className="empty">Loading…</p> : (
          <>
            <header className="ps-hello">
              <h1>{hello()}</h1>
              <p>Your prayer requests, this Sunday and your own work, in one place.</p>
              <span className="ps-role">Pastor{cur?.role === "admin" ? " · Admin" : " · Editor"} · {cur?.name}</span>
            </header>

            <div className="ps-grid">
              <section className="ps-card" aria-labelledby="ps-prayer">
                <header><Icon k="prayer" /><h2 id="ps-prayer">Prayer</h2><a href="#prayer">Open Prayer →</a></header>
                {prayers === null ? <p className="empty">Loading…</p> : (
                  <>
                    <div className="ps-stats">
                      <div className="ps-stat lock"><b>{pr.pastorsOnly}</b><span>for the pastors only</span></div>
                      <div className="ps-stat"><b>{pr.mine}</b><span>you're following up</span></div>
                      <div className="ps-stat"><b>{pr.fresh}</b><span>new, no one yet</span></div>
                    </div>
                    {pr.top.length ? (
                      <ul className="ps-rows">
                        {pr.top.map((p) => (
                          <li key={p.id}>
                            <span className="ps-t">{p.name || "Anonymous"}</span>
                            {p.pastors_only ? <span className="ps-badge lock">Pastors only</span>
                              : p.follow_up === me ? <span className="ps-badge">You follow up</span>
                              : <span className="ps-badge new">New</span>}
                            <span className="ps-s">{p.body}</span>
                          </li>
                        ))}
                      </ul>
                    ) : <p className="ps-soft">No open prayer requests.</p>}
                  </>
                )}
              </section>

              <section className="ps-card" aria-labelledby="ps-sunday">
                <header><Icon k="sunday" /><h2 id="ps-sunday">This Sunday</h2><a href="#program">Open Program →</a></header>
                {sunday === undefined ? <p className="empty">Loading…</p> : sunday === null ? (
                  <p className="ps-soft">No program for an upcoming Sunday yet. Start one on the <a href="#program">Program page</a>.</p>
                ) : (
                  <>
                    <dl className="ps-sun">
                      <dt>Date</dt><dd>{dayLabel(sunday.date)}</dd>
                      <dt>Program</dt><dd>{sunday.published ? <span className="ps-badge ok">Published to Nau Mpro</span> : <span className="ps-badge">Not published yet</span>}</dd>
                      <dt>Preaching</dt><dd>{sunday.preacher || <span className="ps-muted">Not filled in</span>}</dd>
                      <dt>Sermon</dt><dd>{sunday.sermon || <span className="ps-muted">Not filled in</span>}</dd>
                      <dt>Scripture</dt><dd>{sunday.scripture || <span className="ps-muted">Not filled in</span>}</dd>
                    </dl>
                    <div className="ps-acts">
                      <a className="ps-btn" href="#service">Service Slides</a>
                      <a className="ps-btn ghost" href="#thumbnail">Sermon thumbnail</a>
                    </div>
                  </>
                )}
              </section>

              <section className="ps-card" aria-labelledby="ps-work">
                <header><Icon k="work" /><h2 id="ps-work">My work</h2><a href="#scripture">Scripture →</a></header>
                {work === null ? <p className="empty">Loading…</p> : work.length ? (
                  <ul className="ps-rows">
                    {work.map((w) => (
                      <li key={`${w.kind}-${w.id}`}>
                        <a className="ps-t" href={w.kind === "presentation" ? `#builder:${w.id}` : "#scripture"}>{w.title}</a>
                        <span className={`ps-badge${w.private ? " lock" : ""}`}>{w.private ? "Only me" : "Team"}</span>
                        <span className="ps-s">{w.kind === "study" ? "Scripture study" : "Presentation"} · {shortDate(w.updated)}</span>
                      </li>
                    ))}
                  </ul>
                ) : <p className="ps-soft">Your scripture studies and presentations show here.</p>}
              </section>

              <section className="ps-card" aria-labelledby="ps-people">
                <header><Icon k="people" /><h2 id="ps-people">People</h2></header>
                <p className="ps-soon">Birthdays this week and the member directory show here once the People page is built.</p>
              </section>
            </div>
          </>
        ))}
      </div>
    </>
  );
}
