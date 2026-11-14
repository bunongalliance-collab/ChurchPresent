import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import NavBar from "../components/NavBar";
import logo from "../assets/church-logo.png?url";
import { buildProgramPdf, STAGES } from "../lib/programPdf";
import { loadDraft, type Draft, type Row } from "./Program";

// New service editor (#program-v2). It works from one list of items grouped by stage, with a role and
// names on every item. It builds the same Draft as #program and uses the same PDF builder, so the
// brochure format does not change. The current editor (#program) is unchanged.

type Kind = "song" | "scripture" | "reading" | "choir" | "custom";
// A choir item has a name (title), the song it sings (song) and the singers (people)
interface V2 { id: string; stage: number; kind: Kind; title: string; ref: string; passage: string; role: string; people: string[]; song: string }
interface Pick { id: string; title: string; ref: string; passage: string }

const ROLES = ["", "Led by", "Sung by", "Read by", "Offered by", "Message by", "Prayer by"];
const KEY = "programV2Items";
const uid = () => Math.random().toString(36).slice(2, 9);
const KIND_LABEL: Record<Kind, string> = { song: "Song", scripture: "Scripture", reading: "Reading", choir: "Choir", custom: "Other" };

// Saved studies: the passage text (formatting removed), as on the current editor
function studyText(data: unknown): string {
  const slides = (data as { slides?: { kind?: string; text?: string }[] } | null)?.slides ?? [];
  return slides.filter((x) => x.kind === "passage" && x.text).map((x) => (x.text ?? "").replace(/\*\*|~~|__|\{#?[^}]*\}|\{\/\}|[\u0001-\u0003]/g, "").trim()).join(" ");
}

// Start from the service already on the current editor, so nothing is lost on the first open
function fromRows(rows: Row[]): V2[] {
  return rows.filter((r) => r.item.trim()).map((r) => {
    const kind: Kind = r.kind === "song" || r.kind === "scripture" || r.kind === "reading" ? r.kind : "custom";
    const role = r.led ? "Led by" : kind === "scripture" ? "Read by" : "";
    return {
      id: uid(), stage: r.stage ?? 0, kind, title: r.item, ref: r.detail,
      passage: r.text ?? "", role, people: r.led ? [r.led] : [...(r.names ?? [])], song: "",
    };
  });
}

// Build the rows the PDF builder reads (same fields as #program)
function toRows(items: V2[]): Row[] {
  return items.map((it) => {
    const row: Row = { id: it.id, item: it.title, kind: it.kind === "custom" || it.kind === "choir" ? "custom" : it.kind, detail: "", led: "", text: it.passage, names: [], stage: it.stage };
    if (it.kind === "choir") {
      // The choir's name is the item line; one line under it: "Song Name – Who Sing"
      const singers = it.people.join(" ");
      row.names = [[it.song, singers].filter(Boolean).join(" – ")].filter(Boolean);
      return row;
    }
    // A song prints its number and title on the item line; scripture and readings print their reference
    if (it.kind === "song" && it.ref) row.item = `${it.ref}. ${it.title}`;
    else if (it.ref) row.detail = it.ref;
    if (it.role === "Led by" && it.people.length === 1 && it.kind !== "scripture") {
      row.led = it.people[0];
    } else if (it.kind === "scripture") {
      // One line under the item: "Psalm 23 – Jordan Lee". The passage stays in ref for Today's Scripture.
      row.ref = it.ref;
      row.detail = it.people.length ? `${it.ref} – ${it.people.join(", ")}` : it.ref;
    } else {
      // Names print on one line under the item, separated by " · " as the current PDF does (for example: Offering)
      row.names = [...it.people];
      row.kind = it.people.length ? "people" : row.kind;
      if (it.role) row.detail = [row.detail, it.role].filter(Boolean).join(" · ");
    }
    return row;
  });
}

export default function ProgramV2() {
  const [base] = useState<Draft>(() => loadDraft());
  const [items, setItems] = useState<V2[]>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) || "null");
      if (Array.isArray(saved)) return saved as V2[];
    } catch { /* storage blocked */ }
    return fromRows(base.rows);
  });
  // name: the choir's name, typed before choosing its song
  const [picker, setPicker] = useState<{ stage: number; kind: Kind; q: string; name: string } | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [overId, setOverId] = useState<{ id: string; after: boolean } | null>(null);
  const [dropStage, setDropStage] = useState<number | null>(null);
  const dragRef = useRef<string | null>(null);
  const [songs, setSongs] = useState<Pick[]>([]);
  const [readings, setReadings] = useState<Pick[]>([]);
  const [studies, setStudies] = useState<Pick[]>([]);
  const [people, setPeople] = useState<string[]>([]);
  const [status, setStatus] = useState("Saved in this browser.");

  // Saved list: songs, readings, studies and names (as on the current editor)
  useEffect(() => {
    // Browser-only mode (no database): use the songs and readings saved by the Lyrics and Readings pages
    if (!supabase) {
      try {
        const ls = JSON.parse(localStorage.getItem("lyricsSongs") || "[]") as { id: string; number?: string; title?: string }[];
        setSongs(ls.map((x) => ({ id: x.id, title: x.title || "(untitled)", ref: x.number ? String(x.number) : "", passage: "" })));
      } catch { /* storage blocked */ }
      try {
        const rs = JSON.parse(localStorage.getItem("readingsLocal") || "[]") as { id: string; number?: string; title?: string }[];
        setReadings(rs.map((x) => ({ id: x.id, title: x.title || "(untitled)", ref: x.number ? String(x.number) : "", passage: "" })));
      } catch { /* storage blocked */ }
      return;
    }
    (async () => {
      const [s, r, t, p] = await Promise.all([
        supabase.from("lyric_songs").select("id, song_number, title").order("updated_at", { ascending: false }),
        supabase.from("readings").select("id, number, title").order("updated_at", { ascending: false }),
        supabase.from("scripture_studies").select("id, study_title, reference, data").order("updated_at", { ascending: false }),
        supabase.from("saved_people").select("name").order("name"),
      ]);
      if (s.error) setStatus(`Could not load songs: ${s.error.message}`);
      setSongs((s.data ?? []).map((x) => ({ id: x.id, title: x.title || "(untitled)", ref: x.song_number ? String(x.song_number) : "", passage: "" })));
      setReadings((r.data ?? []).map((x) => ({ id: x.id, title: x.title || "(untitled)", ref: x.number ? String(x.number) : "", passage: "" })));
      setStudies((t.data ?? []).map((x) => ({ id: x.id, title: x.reference || x.study_title || "(untitled)", ref: x.reference || "", passage: studyText(x.data) })));
      setPeople((p.data ?? []).map((x) => x.name));
    })();
  }, []);

  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(items)); } catch { /* storage blocked */ } }, [items]);

  const draft: Draft = useMemo(() => ({ ...base, rows: toRows(items) }), [base, items]);
  const coverDate = useMemo(() => {
    try { return new Date(`${base.date}T12:00:00`).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" }).toUpperCase(); } catch { return base.date; }
  }, [base.date]);

  // Live preview: the same PDF as Generate PDF, rebuilt shortly after each change
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const previewRef = useRef<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const bytes = await buildProgramPdf(draft, logo, coverDate);
        if (cancelled) return;
        const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
        if (previewRef.current) URL.revokeObjectURL(previewRef.current);
        previewRef.current = url;
        setPreviewUrl(url);
      } catch { /* the preview is optional */ }
    }, 700);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [draft, coverDate]);
  useEffect(() => () => { if (previewRef.current) URL.revokeObjectURL(previewRef.current); }, []);

  async function generatePdf() {
    setStatus("Making the PDF…");
    try {
      const bytes = await buildProgramPdf(draft, logo, coverDate);
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
      const a = document.createElement("a");
      const name = `${base.coverName1} ${base.coverName2} ${base.date}`.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-") || "service-program";
      const stamp = new Date().toTimeString().slice(0, 5).replace(":", "");
      a.href = url; a.download = `${name}-${stamp}.pdf`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setStatus("PDF made. Check your downloads folder.");
    } catch (err) {
      setStatus(`Could not make the PDF: ${err instanceof Error ? err.message : "unknown error"}`);
    }
  }
  function printBrochure() {
    if (previewRef.current) window.open(previewRef.current, "_blank");
    else setStatus("The preview is still being made. Try again in a moment.");
  }

  // ----- item changes -----
  const patch = (id: string, p: Partial<V2>) => setItems((cur) => cur.map((x) => (x.id === id ? { ...x, ...p } : x)));
  const rename = (id: string, v: string) => { if (v.trim()) patch(id, { title: v.trim() }); setEditId(null); };

  function addItem(stage: number, kind: Kind, title: string, ref: string, passage: string, song = "") {
    const role = kind === "song" || kind === "choir" ? "Sung by" : kind === "scripture" || kind === "reading" ? "Read by" : "";
    const it: V2 = { id: uid(), stage, kind, title, ref, passage, role, people: [], song };
    setItems((cur) => {
      let last = -1; cur.forEach((x, i) => { if (x.stage === stage) last = i; });
      const next = cur.slice(); next.splice(last + 1, 0, it); return next;
    });
    setPicker(null);
    setStatus(`${KIND_LABEL[kind]} added.`);
  }

  function moveItem(id: string, targetId: string | null, after: boolean, stage: number) {
    setItems((cur) => {
      const from = cur.findIndex((x) => x.id === id);
      if (from < 0) return cur;
      const next = cur.slice();
      const [it] = next.splice(from, 1);
      const moved = { ...it, stage };
      let to: number;
      if (targetId == null) { let last = -1; next.forEach((x, i) => { if (x.stage === stage) last = i; }); to = last + 1; }
      else { to = next.findIndex((x) => x.id === targetId) + (after ? 1 : 0); }
      next.splice(to, 0, moved);
      return next;
    });
  }

  function swapWith(id: string, dir: -1 | 1) {
    setItems((cur) => {
      const i = cur.findIndex((x) => x.id === id), j = i + dir;
      if (i < 0 || j < 0 || j >= cur.length) return cur;
      const next = cur.slice();
      [next[i], next[j]] = [next[j], next[i]];
      next[j] = { ...next[j], stage: next[i].stage };
      return next;
    });
  }
  function duplicate(id: string) {
    setItems((cur) => {
      const i = cur.findIndex((x) => x.id === id);
      if (i < 0) return cur;
      const next = cur.slice(); next.splice(i + 1, 0, { ...cur[i], id: uid(), people: [...cur[i].people] });
      return next;
    });
  }
  function remove(id: string) { setItems((cur) => cur.filter((x) => x.id !== id)); }

  const pickList = (kind: Kind): Pick[] => (kind === "song" || kind === "choir" ? songs : kind === "reading" ? readings : kind === "scripture" ? studies : []);
  // A song as it prints: number, then title
  const songLabel = (x: Pick) => (x.ref ? `${x.ref}. ${x.title}` : x.title);

  return (
    <>
      <NavBar />
      <div className="pv">
        <div className="pv-top">
          <div>
            <h1>Service program</h1>
            <p>{status} The brochure format is the same as the current editor.</p>
          </div>
          <div className="pv-actions">
            <a className="pv-link" href="#program">Current editor</a>
            <button className="pv-btn" onClick={printBrochure}>Print</button>
            <button className="pv-btn primary" onClick={generatePdf}>Generate PDF</button>
          </div>
        </div>

        <datalist id="pv-people">{people.map((n) => <option key={n} value={n} />)}</datalist>
        <datalist id="pv-songs">{songs.map((x) => <option key={x.id} value={songLabel(x)} />)}</datalist>

        <section className="pv-preview" aria-label="Brochure preview">
          <div className="pv-preview-head"><strong>Brochure preview</strong><span>Updates a moment after you change something</span></div>
          {previewUrl
            ? <iframe className="pv-preview-frame" src={previewUrl} title="Brochure preview (PDF)" />
            : <p className="pv-muted">Making the preview…</p>}
        </section>

        <div className="pv-doc">
          <h2 className="pv-title">Order of Worship</h2>
          <p className="pv-hint">Click a name to edit it. Pick a role and add names on any item. Hover an item for its ⋯ menu. Drag ⠿ to reorder.</p>

          {STAGES.map((stageName, si) => {
            const list = items.filter((x) => x.stage === si);
            return (
              <section className="pv-stage" key={si}>
                <div className="pv-stage-head"><span className="pv-dots">• • •</span> {stageName}</div>
                <div
                  className={`pv-body${dropStage === si ? " drop" : ""}`}
                  onDragOver={(e) => { if (dragRef.current) { e.preventDefault(); setDropStage(si); } }}
                  onDragLeave={() => setDropStage(null)}
                  onDrop={(e) => { e.preventDefault(); setDropStage(null); if (dragRef.current) moveItem(dragRef.current, null, false, si); dragRef.current = null; }}
                >
                  {list.map((it) => (
                    <div
                      key={it.id}
                      className={`pv-item${menuId === it.id ? " open" : ""}${overId?.id === it.id ? (overId.after ? " over-after" : " over-before") : ""}`}
                      onDragOver={(e) => {
                        if (!dragRef.current || dragRef.current === it.id) return;
                        e.preventDefault();
                        const r = e.currentTarget.getBoundingClientRect();
                        setOverId({ id: it.id, after: e.clientY > r.top + r.height / 2 });
                      }}
                      onDragLeave={() => setOverId(null)}
                      onDrop={(e) => {
                        e.preventDefault(); e.stopPropagation();
                        const r = e.currentTarget.getBoundingClientRect();
                        const after = e.clientY > r.top + r.height / 2;
                        setOverId(null);
                        if (dragRef.current && dragRef.current !== it.id) moveItem(dragRef.current, it.id, after, it.stage);
                        dragRef.current = null;
                      }}
                    >
                      <span
                        className="pv-grip"
                        draggable
                        title="Drag to reorder"
                        onDragStart={(e) => { dragRef.current = it.id; e.dataTransfer.setData("text/plain", it.id); }}
                        onDragEnd={() => { dragRef.current = null; setOverId(null); setDropStage(null); }}
                      >⠿</span>
                      <div className="pv-main">
                        {editId === it.id ? (
                          <input
                            className="pv-edit"
                            autoFocus
                            defaultValue={it.title}
                            aria-label="Item name"
                            onBlur={(e) => rename(it.id, e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setEditId(null); }}
                          />
                        ) : (
                          <span className="pv-name" title="Click to edit" onClick={() => { setEditId(it.id); setMenuId(null); }}>{it.title}</span>
                        )}
                        {it.ref && <span className="pv-meta"> {it.ref}</span>}
                        {it.kind === "choir" && (
                          <div className="pv-song">
                            <span className="pv-meta">Sings</span>
                            <input
                              className="pv-addname pv-song-in"
                              list="pv-songs"
                              value={it.song}
                              placeholder="Choose or type a song…"
                              aria-label={`Song for ${it.title}`}
                              onChange={(e) => patch(it.id, { song: e.target.value })}
                            />
                          </div>
                        )}
                        <div className="pv-people">
                          <select className="pv-role" aria-label={`Role for ${it.title}`} value={it.role} onChange={(e) => patch(it.id, { role: e.target.value })}>
                            {ROLES.map((r) => <option key={r} value={r}>{r || "No role"}</option>)}
                          </select>
                          {it.people.map((n, k) => (
                            <span className="pv-chip" key={k}>
                              {n}
                              <button aria-label={`Remove ${n}`} onClick={() => patch(it.id, { people: it.people.filter((_, j) => j !== k) })}>×</button>
                            </span>
                          ))}
                          <input
                            className="pv-addname"
                            list="pv-people"
                            placeholder="Add name…"
                            aria-label={`Add a name to ${it.title}`}
                            onKeyDown={(e) => {
                              const input = e.target as HTMLInputElement;
                              if (e.key === "Enter" && input.value.trim()) { patch(it.id, { people: [...it.people, input.value.trim()] }); input.value = ""; }
                            }}
                          />
                        </div>
                      </div>
                      <button className="pv-more" aria-label={`Item menu for ${it.title}`} onClick={(e) => { e.stopPropagation(); setMenuId(menuId === it.id ? null : it.id); }}>⋯</button>
                      {menuId === it.id && (
                        <div className="pv-menu" role="menu">
                          <button onClick={() => { swapWith(it.id, -1); setMenuId(null); }}>Move up</button>
                          <button onClick={() => { swapWith(it.id, 1); setMenuId(null); }}>Move down</button>
                          <button onClick={() => { duplicate(it.id); setMenuId(null); }}>Duplicate</button>
                          <button className="danger" onClick={() => { remove(it.id); setMenuId(null); }}>Remove</button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {picker && picker.stage === si ? (
                  <div className="pv-picker">
                    <div className="pv-chips">
                      {(["song", "scripture", "reading", "choir", "custom"] as Kind[]).map((k) => (
                        <button key={k} className="pv-chip-btn" aria-pressed={picker.kind === k} onClick={() => setPicker({ ...picker, kind: k })}>{KIND_LABEL[k]}</button>
                      ))}
                    </div>
                    {picker.kind === "choir" && (
                      <input
                        className="pv-search"
                        value={picker.name}
                        aria-label="Choir name"
                        placeholder="Choir name, for example Children Choir"
                        onChange={(e) => setPicker({ ...picker, name: e.target.value })}
                      />
                    )}
                    <input
                      className="pv-search"
                      autoFocus={picker.kind !== "choir"}
                      value={picker.q}
                      aria-label="Search saved content"
                      placeholder={picker.kind === "custom" ? "Type the item name, then press Enter" : picker.kind === "choir" ? "Search the song this choir sings" : `Search saved ${KIND_LABEL[picker.kind].toLowerCase()}s`}
                      onChange={(e) => setPicker({ ...picker, q: e.target.value })}
                      onKeyDown={(e) => { if (e.key === "Enter" && picker.kind === "custom" && picker.q.trim()) addItem(si, "custom", picker.q.trim(), "", ""); }}
                    />
                    <div className="pv-hits">
                      {picker.kind === "custom" ? (
                        <button className="pv-hit" disabled={!picker.q.trim()} onClick={() => addItem(si, "custom", picker.q.trim(), "", "")}>
                          {picker.q.trim() ? `Add “${picker.q.trim()}” as a custom item` : "Type the item name above"}
                        </button>
                      ) : (
                        <>
                          {picker.kind === "choir" && (
                            <button className="pv-hit" onClick={() => addItem(si, "choir", picker.name.trim() || "Choir", "", "", "")}>
                              <span>{`Add ${picker.name.trim() ? `“${picker.name.trim()}”` : "the choir"} with the song to choose later`}</span>
                            </button>
                          )}
                          {pickList(picker.kind)
                            .filter((x) => !picker.q.trim() || x.title.toLowerCase().includes(picker.q.trim().toLowerCase()) || x.ref.toLowerCase().includes(picker.q.trim().toLowerCase()))
                            .slice(0, 40)
                            .map((x) => (
                              <button key={x.id} className="pv-hit" onClick={() => picker.kind === "choir"
                                ? addItem(si, "choir", picker.name.trim() || "Choir", "", "", songLabel(x))
                                : addItem(si, picker.kind, x.title, x.ref, x.passage)}>
                                <span>{x.title}</span><small>{x.ref}</small>
                              </button>
                            ))}
                          {!pickList(picker.kind).length && <p className="pv-muted">Nothing saved yet. Use Custom to add it.</p>}
                        </>
                      )}
                    </div>
                    <div className="pv-picker-foot">
                      <span>Adds to the end of {stageName.toLowerCase()}</span>
                      <button onClick={() => setPicker(null)}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <button className="pv-add" onClick={() => { setPicker({ stage: si, kind: "song", q: "", name: "" }); setMenuId(null); }}>+ Add item</button>
                )}
              </section>
            );
          })}
        </div>
      </div>
    </>
  );
}
