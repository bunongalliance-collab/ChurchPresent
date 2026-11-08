import { useEffect, useState } from "react";
import NavBar from "../components/NavBar";

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
    "",
    "What does not work offline yet:",
    "- Saving or deleting needs the internet. Nothing is queued for later.",
    "- Fetching a Bible verse for the first time needs the internet.",
    "- Signing in needs the internet. An existing session stays on this device.",
  ].join("\n"),
};

function load(): Note[] {
  try {
    const list = JSON.parse(localStorage.getItem(NOTES_KEY) || "null");
    if (Array.isArray(list)) return list;
  } catch { /* fall through */ }
  return [OFFLINE_NOTE];
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
      <div className="notes-page">
        <header className="pl-top">
          <div>
            <h1>Notes</h1>
            <p className="sub">Your own notes. Kept in this browser, so they work offline.</p>
          </div>
          <button onClick={add}>New note</button>
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
      </div>
    </>
  );
}
