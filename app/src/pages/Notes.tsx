import { useEffect, useState } from "react";
import NavBar from "../components/NavBar";
import { selectAll, supabase } from "../lib/supabase";
import { withoutSheet } from "../reader/lyrics";

// Where the app is opened from: visits by signed-in users (recorded by lib/visits.ts and api/visit.js).
// Only admin accounts can read them; for anyone else the list comes back empty.
interface Visit { id: string; created_at: string; email: string; ip: string; city: string; region: string; country: string; device: string }

function VisitsSection() {
  const [visits, setVisits] = useState<Visit[]>([]);
  const [state, setState] = useState<"loading" | "signed-out" | "error" | "ready" | "no-supabase">(supabase ? "loading" : "no-supabase");
  const [error, setError] = useState("");

  async function load() {
    if (!supabase) return;
    setState("loading");
    const { data: sess } = await supabase.auth.getSession();
    if (!sess.session) { setState("signed-out"); return; }
    const { data, error: err } = await supabase
      .from("app_visits")
      .select("id, created_at, email, ip, city, region, country, device")
      .order("created_at", { ascending: false })
      .limit(200);
    if (err) { setError(err.message); setState("error"); return; }
    setVisits((data ?? []) as Visit[]);
    setState("ready");
  }
  useEffect(() => { void load(); }, []);

  const place = (v: Visit) => [v.city, v.region, v.country].filter(Boolean).join(", ") || "—";
  return (
    <section className="visits" aria-labelledby="visits-h">
      <div className="visits-head">
        <h2 id="visits-h">Where the app is opened from</h2>
        {supabase && <button className="secondary small" onClick={() => void load()} disabled={state === "loading"}>Refresh</button>}
      </div>
      <p className="sub">One visit per browser session. Signed-in users show their email; people who are not signed in show as Visitor (at most one per IP address every 30 minutes). Only the admin account can see this list.</p>
      {state === "no-supabase" && <p className="empty">Needs the Supabase settings.</p>}
      {state === "loading" && <p className="empty">Loading…</p>}
      {state === "signed-out" && <p className="empty">Sign in to see this list.</p>}
      {state === "error" && <p className="empty">Could not load visits: {error}. Run supabase/app-visits.sql in the Supabase SQL editor if you have not yet.</p>}
      {state === "ready" && !visits.length && <p className="empty">No visits to show. If you are the admin, add your account to app_admins (see supabase/app-visits.sql).</p>}
      {state === "ready" && visits.length > 0 && (
        <div className="visits-scroll">
          <table className="visits-table">
            <thead><tr><th>When</th><th>Who</th><th>Device</th><th>IP address</th><th>Location</th></tr></thead>
            <tbody>
              {visits.map((v) => (
                <tr key={v.id}>
                  <td>{new Date(v.created_at).toLocaleString()}</td>
                  <td>{v.email || "Visitor"}</td>
                  <td>{v.device || "—"}</td>
                  <td className="mono">{v.ip || "—"}</td>
                  <td>{place(v)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// Songs the Nau Mpro reader shows without a music sheet, read live from the song library
function NoSheetSection() {
  const [result, setResult] = useState<{ total: number; missing: { song: { id: string; number: string; title: string }; why: string }[] } | null>(null);
  const [state, setState] = useState<"loading" | "error" | "ready" | "no-supabase">(supabase ? "loading" : "no-supabase");
  const [error, setError] = useState("");

  async function load() {
    const sb = supabase;
    if (!sb) return;
    setState("loading");
    const { data, error: err } = await selectAll((from, to) => sb.from("lyric_songs")
      .select("id, title, song_number, lyrics, updated_at, score_path, score_images").order("id").range(from, to));
    if (err) { setError(err.message); setState("error"); return; }
    setResult(withoutSheet((data ?? []).map((r) => ({
      id: String(r.id), number: r.song_number ?? "", title: r.title ?? "", lyrics: r.lyrics ?? "", updated: r.updated_at ?? "",
      scorePath: r.score_path ?? "", scoreImages: Array.isArray(r.score_images) ? r.score_images : [],
    }))));
    setState("ready");
  }
  useEffect(() => { void load(); }, []);

  return (
    <section className="visits" aria-labelledby="nosheet-h">
      <div className="visits-head">
        <h2 id="nosheet-h">Songs without a music sheet{state === "ready" && result ? ` (${result.missing.length})` : ""}</h2>
        {supabase && <button className="secondary small" onClick={() => void load()} disabled={state === "loading"}>Refresh</button>}
      </div>
      <p className="sub">
        {state === "ready" && result ? `As the Nau Mpro app shows them: ${result.total - result.missing.length} of ${result.total} songs have a sheet. ` : "As the Nau Mpro app shows them. "}
        Press a title to open the song on the Lyric page.
      </p>
      {state === "no-supabase" && <p className="empty">Needs the Supabase settings.</p>}
      {state === "loading" && <p className="empty">Loading…</p>}
      {state === "error" && <p className="empty">Could not load the songs: {error}. Check the connection and press Refresh.</p>}
      {state === "ready" && result && !result.missing.length && <p className="empty">Every song has a music sheet.</p>}
      {state === "ready" && result && result.missing.length > 0 && (
        <div className="visits-scroll">
          <table className="visits-table nosheet-table">
            <thead><tr><th>No.</th><th>Song</th><th>Why</th></tr></thead>
            <tbody>
              {result.missing.map(({ song, why }) => (
                <tr key={song.id}>
                  <td>{song.number || "—"}</td>
                  <td><a href={`#lyrics:${encodeURIComponent(song.id)}`}>{song.title || "(untitled)"}</a></td>
                  <td>{why}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// App installs: one per device per app, recorded by reader/install.ts and api/install.js.
// The totals are public (supabase/app-install-counts.sql); the list of installs is for admin accounts only.
interface Install { id: string; created_at: string; app: string; device: string; how: string; city: string; region: string; country: string }
const INSTALL_APPS = [
  { app: "nau-mpro", label: "Nau Mpro" },
  { app: "church-tools", label: "NauBrah" },
  { app: "scripture", label: "Scripture" },
];
const appLabel = (a: string) => INSTALL_APPS.find((x) => x.app === a)?.label ?? a;

function InstallsSection() {
  const [rows, setRows] = useState<Install[]>([]);
  const [counts, setCounts] = useState<Record<string, { total: number; recent: number }>>({});
  const [state, setState] = useState<"loading" | "error" | "ready" | "no-supabase">(supabase ? "loading" : "no-supabase");
  const [error, setError] = useState("");

  async function load() {
    if (!supabase) return;
    setState("loading");
    const { data: c, error: cErr } = await supabase.rpc("app_install_counts");
    if (cErr) { setError(cErr.message); setState("error"); return; }
    const byApp = new Map(((c ?? []) as { app: string; total: number; last_30_days: number }[]).map((r) => [r.app, r]));
    setCounts(Object.fromEntries(INSTALL_APPS.map(({ app }) => [app, { total: Number(byApp.get(app)?.total ?? 0), recent: Number(byApp.get(app)?.last_30_days ?? 0) }])));
    // The list (device, place) only loads for a signed-in admin; anyone else just sees the totals
    const { data: sess } = await supabase.auth.getSession();
    if (sess.session) {
      const list = await supabase.from("app_installs").select("id, created_at, app, device, how, city, region, country").order("created_at", { ascending: false }).limit(50);
      setRows(list.error ? [] : ((list.data ?? []) as Install[]));
    } else setRows([]);
    setState("ready");
  }
  useEffect(() => { void load(); }, []);

  const place = (v: Install) => [v.city, v.region, v.country].filter(Boolean).join(", ") || "—";
  return (
    <section className="visits" aria-labelledby="installs-h">
      <div className="visits-head">
        <h2 id="installs-h">App installs</h2>
        {supabase && <button className="secondary small" onClick={() => void load()} disabled={state === "loading"}>Refresh</button>}
      </div>
      <p className="sub">Each device counts once per app, without sign-in: when the browser reports the install (Chrome, Edge, Samsung Internet), or the first time the app opens from the home screen (iPhone and iPad). Anyone can see the totals; only the admin account sees the list.</p>
      {state === "no-supabase" && <p className="empty">Needs the Supabase settings.</p>}
      {state === "loading" && <p className="empty">Loading…</p>}
      {state === "error" && <p className="empty">Could not load installs: {error}. Run supabase/app-install-counts.sql in the Supabase SQL editor if you have not yet.</p>}
      {state === "ready" && (
        <>
          {INSTALL_APPS.map(({ app, label }) => {
            const n = counts[app] ?? { total: 0, recent: 0 };
            return <p className="installs-count" key={app}>{label}: <strong>{n.total}</strong> {n.total === 1 ? "install" : "installs"} in all · <strong>{n.recent}</strong> in the last 30 days</p>;
          })}
          {rows.length > 0 && (
            <div className="visits-scroll">
              <table className="visits-table">
                <thead><tr><th>When</th><th>App</th><th>Device</th><th>How</th><th>Location</th></tr></thead>
                <tbody>
                  {rows.map((v) => (
                    <tr key={v.id}>
                      <td>{new Date(v.created_at).toLocaleString()}</td>
                      <td>{appLabel(v.app)}</td>
                      <td>{v.device || "—"}</td>
                      <td>{v.how || "—"}</td>
                      <td>{place(v)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}

// User notes, kept in this browser so they work offline
interface Note { id: string; title: string; body: string; updated: string }
const NOTES_KEY = "userNotes";
const uid = () => Math.random().toString(36).slice(2, 10);

const OFFLINE_NOTE: Note = {
  id: "offline-status",
  title: "Offline support",
  updated: new Date().toISOString(),
  body: [
    "What works offline once the app has been opened online:",
    "- Pages load from the cache: Lyrics, Scripture, Builder, Presentations, Projector and Notes.",
    "- Saved songs, presentations and scripture studies show their last loaded copy.",
    "- Bible verses fetched once are reused. Each version needs one online fetch first.",
    "- Presenting works offline, because the projector reads its slides from this browser.",
    "- Saving songs, readings, scripture studies, presentations and categories works offline. They are kept on this device and upload when you are back online.",
    "",
    "What does not work offline yet:",
    "- Fetching a Bible verse for the first time needs the internet.",
    "- Signing in needs the internet. An existing session stays on this device.",
  ].join("\n"),
};

// Notes added for everyone. Each is added once per browser; if the user deletes one, it does not come back.
const BUILT_IN_NOTES: Note[] = [
  {
    id: "ebible-source",
    title: "Bible source: eBible",
    updated: new Date().toISOString(),
    body: "https://ebible.org/Scriptures/details.php?id=cmo",
  },
];
const ADDED_KEY = "builtInNotesAdded";

function load(): Note[] {
  let saved: Note[] | null = null;
  try {
    const list = JSON.parse(localStorage.getItem(NOTES_KEY) || "null");
    if (Array.isArray(list)) saved = list;
  } catch { /* fall through */ }
  const base = saved ?? [OFFLINE_NOTE];
  let added: string[] = [];
  try { added = JSON.parse(localStorage.getItem(ADDED_KEY) || "[]"); } catch { /* none yet */ }
  const fresh = BUILT_IN_NOTES.filter((n) => !added.includes(n.id) && !base.some((x) => x.id === n.id));
  if (fresh.length) {
    try { localStorage.setItem(ADDED_KEY, JSON.stringify([...added, ...fresh.map((n) => n.id)])); } catch { /* storage blocked */ }
  }
  return [...fresh, ...base];
}

export default function Notes() {
  const [notes, setNotes] = useState<Note[]>(load);
  const [selectedId, setSelectedId] = useState(notes[0]?.id ?? "");
  const selected = notes.find((n) => n.id === selectedId) ?? null;

  useEffect(() => {
    try { localStorage.setItem(NOTES_KEY, JSON.stringify(notes)); } catch { /* storage blocked */ }
  }, [notes]);

  function change(patch: Partial<Note>) {
    if (!selected) return;
    setNotes((cur) => cur.map((n) => (n.id === selected.id ? { ...n, ...patch, updated: new Date().toISOString() } : n)));
  }
  function add() {
    const n: Note = { id: uid(), title: "New note", body: "", updated: new Date().toISOString() };
    setNotes((cur) => [n, ...cur]);
    setSelectedId(n.id);
  }
  function remove() {
    if (!selected) return;
    if (!window.confirm(`Delete "${selected.title}"? This cannot be undone.`)) return;
    const rest = notes.filter((n) => n.id !== selected.id);
    setNotes(rest);
    setSelectedId(rest[0]?.id ?? "");
  }

  return (
    <>
      <NavBar />
      <div className="notes-page lt">
        <header className="pl-top">
          <div>
            <h1>Notes</h1>
          </div>
          <button className="primary" onClick={add}>New note</button>
        </header>
        <div className="notes-grid">
          <ul className="notes-list">
            {notes.map((n) => (
              <li key={n.id}>
                <button className={`notes-pick${n.id === selectedId ? " active" : ""}`} onClick={() => setSelectedId(n.id)}>
                  <strong>{n.title || "(untitled)"}</strong>
                  <small>{new Date(n.updated).toLocaleDateString()}</small>
                </button>
              </li>
            ))}
            {!notes.length && <li className="empty">No notes yet. Press New note to start.</li>}
          </ul>
          {selected ? (
            <section className="notes-editor">
              <input value={selected.title} onChange={(e) => change({ title: e.target.value })} aria-label="Note title" />
              <textarea value={selected.body} onChange={(e) => change({ body: e.target.value })} aria-label="Note text" />
              <div className="row"><button className="secondary danger" onClick={remove}>Delete note</button></div>
            </section>
          ) : <p className="empty">Choose a note, or press New note.</p>}
        </div>
        <NoSheetSection />
        <InstallsSection />
        <VisitsSection />
      </div>
    </>
  );
}
