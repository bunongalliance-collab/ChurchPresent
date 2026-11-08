import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import NavBar from "../components/NavBar";
import { flatten, type Item, type PresentationData, type Settings } from "./Builder";
import { PROJECTOR_KEY } from "./Projector";
import { downloadDeckPptx } from "../lib/pptx";

// One saved presentation, as listed on this page
interface Row {
  id: string;
  title: string;
  updated: string;
  data: PresentationData;
}

type SortBy = "modified" | "name";

// Counts shown in the list, worked out from the saved items (no new table or columns)
function countsOf(data: PresentationData) {
  const items: Item[] = data.items ?? [];
  const songs = items.filter((i) => i.kind === "song").length;
  const scripture = items.filter((i) => i.kind === "scripture").length;
  const custom = items.filter((i) => i.kind === "custom").length;
  const settings = data as Settings;
  const total = flatten(items, settings, 84).slides.length;
  return { songs, scripture, custom, total };
}

const dateText = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

export default function Presentations() {
  const [rows, setRows] = useState<Row[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortBy>("modified");
  const [status, setStatus] = useState("");
  const [error, setError] = useState(false);
  const [busyId, setBusyId] = useState("");

  const say = (m: string, e = false) => { setStatus(m); setError(e); };

  // Reads only the signed-in user's rows (RLS also restricts them to the owner)
  async function load() {
    if (!supabase) { setLoading(false); return; }
    setLoading(true);
    const { data, error: err } = await supabase
      .from("presentations")
      .select("id, title, updated_at, data")
      .order("updated_at", { ascending: false });
    setLoading(false);
    if (err) { say("Could not load presentations: " + err.message, true); return; }
    setRows((data || []).map((r) => ({ id: r.id, title: r.title, updated: r.updated_at, data: r.data as PresentationData })));
  }

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    supabase.auth.getSession().then(({ data }) => {
      setUserId(data.session?.user.id ?? null);
      load();
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setUserId(s?.user.id ?? null);
      load();
    });
    return () => sub.subscription.unsubscribe();
    // load() reads only; subscribing once is enough
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The five most recently modified, always by date, whatever the sort
  const recent = useMemo(
    () => [...rows].sort((a, b) => b.updated.localeCompare(a.updated)).slice(0, 5),
    [rows],
  );

  // Search by title, then sort
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = rows.filter((r) => !q || r.title.toLowerCase().includes(q));
    return list.sort((a, b) =>
      sortBy === "name"
        ? a.title.localeCompare(b.title, undefined, { numeric: true })
        : b.updated.localeCompare(a.updated),
    );
  }, [rows, query, sortBy]);

  // ---------- Actions ----------
  // Open in Builder: the builder reads the id from the address (#builder:<id>) and restores everything
  function openInBuilder(id: string) {
    window.location.hash = `#builder:${id}`;
  }

  // Present: the same projector hand-off the builder uses
  function present(row: Row) {
    const deck = flatten(row.data.items ?? [], row.data as Settings, 84);
    try { localStorage.setItem(PROJECTOR_KEY, JSON.stringify(deck)); } catch { /* storage blocked */ }
    window.open(`${import.meta.env.BASE_URL}#projector`, "_blank");
  }

  // Download .pptx: the same slides, colours and formatting as Present
  function download(row: Row) {
    const deck = flatten(row.data.items ?? [], row.data as Settings, 84);
    downloadDeckPptx(deck, row.title);
  }

  // Duplicate: a new, independent row with a copy of the whole data
  async function duplicate(row: Row) {
    if (!supabase || !userId) { say("Sign in to duplicate presentations.", true); return; }
    setBusyId(row.id);
    const copy = JSON.parse(JSON.stringify(row.data)) as PresentationData;
    const { error: err } = await supabase
      .from("presentations")
      .insert({ title: `${row.title} (copy)`, data: copy, owner_id: userId });
    setBusyId("");
    if (err) { say("Could not duplicate: " + err.message, true); return; }
    say(`Copied "${row.title}".`);
    await load();
  }

  async function remove(row: Row) {
    if (!supabase || !userId) { say("Sign in to delete presentations.", true); return; }
    if (!window.confirm(`Delete "${row.title}"? This cannot be undone.`)) return;
    setBusyId(row.id);
    const { error: err } = await supabase.from("presentations").delete().eq("id", row.id);
    setBusyId("");
    if (err) { say("Could not delete: " + err.message, true); return; }
    say(`Deleted "${row.title}".`);
    await load();
  }

  // ---------- Pieces ----------
  function Table({ list }: { list: Row[] }) {
    return (
      <div className="pl-table" role="table" aria-label="Presentations">
        <div className="pl-head" role="row">
          <span role="columnheader">Title</span>
          <span role="columnheader">Last modified</span>
          <span role="columnheader">Songs</span>
          <span role="columnheader">Scripture</span>
          <span role="columnheader">Custom</span>
          <span role="columnheader">Slides</span>
          <span role="columnheader">Actions</span>
        </div>
        {list.map((r) => {
          const c = countsOf(r.data);
          const busy = busyId === r.id;
          return (
            <div className="pl-row" role="row" key={r.id}>
              <span role="cell" className="pl-title" data-label="Title"><strong>{r.title || "(untitled)"}</strong></span>
              <span role="cell" data-label="Last modified">{dateText(r.updated)}</span>
              <span role="cell" data-label="Songs">{c.songs}</span>
              <span role="cell" data-label="Scripture">{c.scripture}</span>
              <span role="cell" data-label="Custom">{c.custom}</span>
              <span role="cell" data-label="Slides">{c.total}</span>
              <span role="cell" className="pl-actions">
                <button className="small" onClick={() => openInBuilder(r.id)} disabled={busy}>Open in Builder</button>
                <button className="secondary small" onClick={() => present(r)} disabled={busy || c.total === 0}>Present</button>
                <button className="secondary small" onClick={() => download(r)} disabled={busy || c.total === 0}>Download .pptx</button>
                <button className="secondary small" onClick={() => duplicate(r)} disabled={busy}>Duplicate</button>
                <button className="secondary small danger" onClick={() => remove(r)} disabled={busy}>Delete</button>
              </span>
            </div>
          );
        })}
      </div>
    );
  }

  // ---------- Layout ----------
  const empty = !loading && rows.length === 0;

  return (
    <>
      <NavBar />
      <div className="pl-page">
        <header className="pl-top">
          <div>
            <h1>Presentations</h1>
            <p className="sub">Your saved presentations. Open one to keep editing, or present it straight from here.</p>
          </div>
          <button onClick={() => { window.location.hash = "#builder"; }}>New presentation</button>
        </header>

        {!supabase && <p className="status error">Saving needs the Supabase settings in app/.env.local.</p>}
        {supabase && !userId && !loading && (
          <p className="status">Sign in on the Lyrics page to see your presentations.</p>
        )}
        {status && <p className={error ? "status error" : "status"} role="status">{status}</p>}

        {loading && <p className="empty">Loading presentations…</p>}

        {empty && userId && (
          <div className="pl-empty">
            <h2>No presentations saved yet</h2>
            <p>A presentation is one order of songs, scripture and your own slides. Create one in the Presentation Builder, then save it to see it here.</p>
            <button onClick={() => { window.location.hash = "#builder"; }}>Create a presentation</button>
          </div>
        )}

        {!empty && rows.length > 0 && (
          <>
            <section className="pl-section">
              <h2>Recently modified</h2>
              <Table list={recent} />
            </section>

            <section className="pl-section">
              <div className="pl-tools">
                <h2>All presentations</h2>
                <input type="search" placeholder="Search by title" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search by title" />
                <label className="pl-sort">Sort by
                  <select value={sortBy} onChange={(e) => setSortBy(e.target.value as SortBy)}>
                    <option value="modified">Last modified</option>
                    <option value="name">Name (A–Z)</option>
                  </select>
                </label>
              </div>
              {filtered.length ? <Table list={filtered} /> : <p className="empty">No presentations match "{query}".</p>}
            </section>
          </>
        )}
      </div>
    </>
  );
}
