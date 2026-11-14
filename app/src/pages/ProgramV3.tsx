import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { supabase } from "../lib/supabase";
import NavBar from "../components/NavBar";
import logo from "../assets/church-logo.png?url";
import { buildProgramPdf, STAGES } from "../lib/programPdf";
import { loadDraft, type Draft, type Row } from "./Program";

// Program builder, sample layout (#program-v3). Stages start empty. "+ Add item" opens the full item list,
// and each item asks only for what it needs. The PDF builder is the same as #program.

type Fields = "none" | "person" | "song" | "choir" | "scripture" | "names" | "text";
interface Cat { key: string; name: string; fields: Fields; label?: string }
// A sub-item under an item, and its nested sub-items (the third level, under the sub-item)
interface Sub { id: string; text: string; children: string[] }
interface Item { id: string; stage: number; key: string; title: string; ref: string; passage: string; people: string[]; songs: string[]; text: string; subs?: Sub[] }
interface Pick { id: string; title: string; ref: string; passage: string }

const CATALOG: Cat[] = [
  { key: "prelude", name: "Prelude", fields: "names", label: "Played by" },
  { key: "welcome", name: "Welcome & Call to Worship", fields: "person", label: "Led by" },
  { key: "opening-song", name: "Opening Song", fields: "song", label: "Sung by" },
  { key: "opening-prayer", name: "Opening Prayer", fields: "person", label: "Led by" },
  { key: "songs-of-praise", name: "Songs of Praise", fields: "song", label: "Sung by" },
  { key: "children-choir", name: "Children Choir", fields: "choir", label: "Singers" },
  { key: "youth-choir", name: "Youth Choir", fields: "choir", label: "Singers" },
  { key: "prayer-offering", name: "Prayer for the Offering", fields: "person", label: "Led by" },
  { key: "offering", name: "Offering", fields: "names", label: "Offering by" },
  { key: "announcements", name: "Announcements", fields: "text" },
  { key: "sok-nhhor", name: "Sok Nh'hor", fields: "names", label: "Names" },
  { key: "scripture", name: "Scripture Reading", fields: "scripture", label: "Read by" },
  { key: "message", name: "Message", fields: "person", label: "Speaker" },
  { key: "response", name: "Response & Prayer", fields: "person", label: "Led by" },
  { key: "closing-song", name: "Closing Song", fields: "song", label: "Sung by" },
  { key: "closing-prayer", name: "Closing Prayer", fields: "person", label: "Led by" },
];
const CAT = Object.fromEntries(CATALOG.map((c) => [c.key, c]));

const KEY = "programV3Items";
const uid = () => Math.random().toString(36).slice(2, 9);
const STAGE_NAMES = STAGES.map((s) => s.charAt(0) + s.slice(1).toLowerCase());

// Items → the rows the PDF builder reads. Songs of a choir print as sub-lines (one row per song).
function toRows(items: Item[]): Row[] {
  return items.map((it) => {
    const cat = CAT[it.key];
    const row: Row = { id: it.id, item: it.title, kind: "custom", detail: "", led: "", text: "", names: [], stage: it.stage };
    // Every item prints its name on the item line, then each sub-item on its own line beneath it
    // Sub-items are nested: level 1 is a sub-item, level 2 is a sub-sub-item (for example a song, then its singers)
    const sub = (text: string, level: number) => ({ text, level });
    if (cat.fields === "song") {
      // Every song the user added, each with its singers beneath it
      row.lines = it.songs.flatMap((s) => [sub(s, 1), ...it.people.map((p) => sub(p, 2))]).filter((l) => l.text);
    } else if (cat.fields === "choir") {
      // Each song, then the singers under it
      row.lines = it.songs.flatMap((s) => [sub(s, 1), ...it.people.map((p) => sub(p, 2))]).filter((l) => l.text);
      if (!it.songs.length) row.lines = it.people.map((p) => sub(p, 1));
    } else if (cat.fields === "scripture") {
      // The passage stays in ref and text for Today's Scripture; the reader prints under it
      row.kind = "scripture";
      row.ref = it.ref;
      row.text = it.passage;
      row.lines = [sub(it.ref, 1), ...it.people.map((p) => sub(p, 2))].filter((l) => l.text);
    } else if (cat.fields === "person") {
      // Every name is a sub-item, not just the first
      row.lines = it.people.map((p) => sub(p, 1));
    } else if (cat.fields === "names") {
      // Each name on its own sub-line, like the singers under a choir song
      row.lines = it.people.map((p) => sub(p, 1));
    } else if (cat.fields === "text") {
      row.lines = it.text.split("\n").map((t) => sub(t.trim(), 1)).filter((l) => l.text);
    }
    // Sub-items added by hand: level 1 is the sub-item, level 2 is its nested item
    const custom = (it.subs ?? []).flatMap((s) => [sub(s.text, 1), ...s.children.map((c) => sub(c, 2))]).filter((l) => l.text);
    if (custom.length) row.lines = [...(row.lines ?? []), ...custom];
    return row;
  });
}

export default function ProgramV3() {
  const [base] = useState<Draft>(() => loadDraft());
  const [items, setItems] = useState<Item[]>(() => {
    try { const saved = JSON.parse(localStorage.getItem(KEY) || "null"); if (Array.isArray(saved)) return saved as Item[]; } catch { /* storage blocked */ }
    return [];
  });
  const [menuStage, setMenuStage] = useState<number | null>(null);
  const [form, setForm] = useState<{ stage: number; key: string } | null>(null);
  const [songs, setSongs] = useState<Pick[]>([]);
  const [studies, setStudies] = useState<Pick[]>([]);
  const [people, setPeople] = useState<string[]>([]);
  const [status, setStatus] = useState("Saved in this browser.");

  useEffect(() => {
    if (!supabase) {
      try {
        const ls = JSON.parse(localStorage.getItem("lyricsSongs") || "[]") as { id: string; number?: string; title?: string }[];
        setSongs(ls.map((x) => ({ id: x.id, title: x.title || "(untitled)", ref: x.number ? String(x.number) : "", passage: "" })));
      } catch { /* storage blocked */ }
      return;
    }
    (async () => {
      const [s, t, p] = await Promise.all([
        supabase.from("lyric_songs").select("id, song_number, title").order("updated_at", { ascending: false }),
        supabase.from("scripture_studies").select("id, study_title, reference, data").order("updated_at", { ascending: false }),
        supabase.from("saved_people").select("name").order("name"),
      ]);
      if (s.error) setStatus(`Could not load songs: ${s.error.message}`);
      setSongs((s.data ?? []).map((x) => ({ id: x.id, title: x.title || "(untitled)", ref: x.song_number ? String(x.song_number) : "", passage: "" })));
      setStudies((t.data ?? []).map((x) => ({ id: x.id, title: x.reference || x.study_title || "(untitled)", ref: x.reference || "", passage: studyPassage(x.data) })));
      setPeople((p.data ?? []).map((x) => x.name));
    })();
  }, []);

  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(items)); } catch { /* storage blocked */ } }, [items]);

  const draft: Draft = useMemo(() => ({ ...base, rows: toRows(items) }), [base, items]);
  const coverDate = useMemo(() => {
    try { return new Date(`${base.date}T12:00:00`).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" }).toUpperCase(); } catch { return base.date; }
  }, [base.date]);

  // Live preview, rebuilt shortly after each change
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

  function addItem(stage: number, key: string, data: Partial<Item>) {
    const cat = CAT[key];
    const it: Item = { id: uid(), stage, key, title: cat.name, ref: "", passage: "", people: [], songs: [], text: "", ...data };
    setItems((cur) => [...cur, it]);
    setForm(null);
    setMenuStage(null);
    setStatus(`${cat.name} added to ${STAGE_NAMES[stage]}.`);
  }
  const removeItem = (id: string) => setItems((cur) => cur.filter((x) => x.id !== id));
  const setSubs = (id: string, subs: Sub[]) => setItems((cur) => cur.map((x) => (x.id === id ? { ...x, subs } : x)));

  return (
    <>
      <NavBar />
      <div className="p3">
        <div className="p3-top">
          <div>
            <h1>Service program</h1>
            <p>{status}</p>
          </div>
          <div className="p3-actions">
            <a className="p3-link" href="#program">Current editor</a>
            <button className="p3-btn" onClick={printBrochure}>Print</button>
            <button className="p3-btn primary" onClick={generatePdf}>Generate PDF</button>
          </div>
        </div>

        <datalist id="p3-people">{people.map((n) => <option key={n} value={n} />)}</datalist>
        <datalist id="p3-passages">{studies.map((x) => <option key={x.id} value={x.ref || x.title} />)}</datalist>
        <datalist id="p3-songs">{songs.map((x) => <option key={x.id} value={x.ref ? `${x.ref}. ${x.title}` : x.title} />)}</datalist>

        <section className="p3-preview" aria-label="Brochure preview">
          {previewUrl ? <iframe className="p3-frame" src={previewUrl} title="Brochure preview (PDF)" /> : <p className="p3-muted">Making the preview…</p>}
        </section>

        <div className="p3-doc">
          <h2 className="p3-title">Order of Worship</h2>
          <p className="p3-hint">Add items to any stage. Each item asks only for what it needs.</p>

          {STAGES.map((_, si) => {
            const list = items.filter((x) => x.stage === si);
            return (
              <section className="p3-stage" key={si}>
                <div className="p3-stage-head"><span className="p3-dots">• • •</span> {STAGE_NAMES[si]}</div>
                {list.map((it) => (
                  <div className="p3-item" key={it.id}>
                    <div className="p3-main">
                      <div className="p3-title-line">{it.title}</div>
                      <ItemLines it={it} />
                      <SubItems it={it} onChange={(subs) => setSubs(it.id, subs)} />
                    </div>
                    <button className="p3-more" aria-label={`Remove ${it.title}`} onClick={() => removeItem(it.id)}>×</button>
                  </div>
                ))}

                {form && form.stage === si ? (
                  <ItemForm
                    key={form.key}
                    cat={CAT[form.key]}
                    songs={songs}
                    studies={studies}
                    onCancel={() => setForm(null)}
                    onSave={(data) => addItem(si, form.key, data)}
                  />
                ) : menuStage === si ? (
                  <div className="p3-menu">
                    <div className="p3-menu-title">Choose an item</div>
                    {CATALOG.map((c) => (
                      <button key={c.key} className="p3-cat" onClick={() => { setForm({ stage: si, key: c.key }); setMenuStage(null); }}>
                        <span>{c.name}</span>
                      </button>
                    ))}
                    <div className="p3-menu-foot"><button onClick={() => setMenuStage(null)}>Cancel</button></div>
                  </div>
                ) : (
                  <button className="p3-add" onClick={() => { setMenuStage(si); setForm(null); }}>+ Add item</button>
                )}
              </section>
            );
          })}
        </div>
      </div>
    </>
  );

  // The one-line summary under an item, as on the sample
  function ItemLines({ it }: { it: Item }) {
    const cat = CAT[it.key];
    const lines: string[] = [];
    if (cat.fields === "song" || cat.fields === "choir") {
      // Every song, then its singers beneath (same as the PDF)
      it.songs.forEach((s) => { lines.push(`– ${s}`); it.people.forEach((p) => lines.push(`    ${p}`)); });
      if (!it.songs.length) it.people.forEach((p) => lines.push(p));
    }
    if (cat.fields === "scripture") lines.push(it.ref + (it.people.length ? ` – ${it.people.join(", ")}` : ""));
    if (cat.fields === "person") it.people.forEach((p) => lines.push(p));
    if (cat.fields === "names") it.people.forEach((p) => lines.push(p));
    if (cat.fields === "text") it.text.split("\n").filter((t) => t.trim()).forEach((t) => lines.push(t));
    if (!lines.length) return null;
    return <div className="p3-lines">{lines.map((l, i) => <div key={i}>{l}</div>)}</div>;
  }
}

// Sub-items under one item, each with its own nested items. Type and press Enter to add.
function SubItems({ it, onChange }: { it: Item; onChange: (subs: Sub[]) => void }) {
  const [draft, setDraft] = useState("");
  const [nested, setNested] = useState<Record<string, string>>({});
  const subs = it.subs ?? [];
  return (
    <div className="p3-subs">
      {subs.map((s) => (
        <div className="p3-sub" key={s.id}>
          <div className="p3-sub-line">
            <span>{s.text}</span>
            <button aria-label={`Remove ${s.text}`} onClick={() => onChange(subs.filter((x) => x.id !== s.id))}>×</button>
          </div>
          {s.children.map((c, k) => (
            <div className="p3-nested" key={k}>
              <span>{c}</span>
              <button aria-label={`Remove ${c}`} onClick={() => onChange(subs.map((x) => (x.id === s.id ? { ...x, children: x.children.filter((_, j) => j !== k) } : x)))}>×</button>
            </div>
          ))}
          <input
            className="p3-input-inline p3-nested-in"
            aria-label={`Nested item under ${s.text}`}
            placeholder="Add nested item, then Enter"
            value={nested[s.id] ?? ""}
            onChange={(e) => setNested({ ...nested, [s.id]: e.target.value })}
            onKeyDown={(e) => {
              const v = (nested[s.id] ?? "").trim();
              if (e.key === "Enter" && v) {
                onChange(subs.map((x) => (x.id === s.id ? { ...x, children: [...x.children, v] } : x)));
                setNested({ ...nested, [s.id]: "" });
              }
            }}
          />
        </div>
      ))}
      <input
        className="p3-input-inline"
        aria-label={`Sub-item under ${it.title}`}
        placeholder="Add sub-item, then Enter"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          const v = draft.trim();
          if (e.key === "Enter" && v) { onChange([...subs, { id: uid(), text: v, children: [] }]); setDraft(""); }
        }}
      />
    </div>
  );
}

function studyPassage(data: unknown): string {
  const slides = (data as { slides?: { kind?: string; text?: string }[] } | null)?.slides ?? [];
  return slides.filter((x) => x.kind === "passage" && x.text).map((x) => (x.text ?? "").replace(/\*\*|~~|__|\{#?[^}]*\}|\{\/\}|[\u0001-\u0003]/g, "").trim()).join(" ");
}

// The form for one item. Only the fields that item needs are shown.
function ItemForm({ cat, songs, studies, onCancel, onSave }: {
  cat: Cat; songs: Pick[]; studies: Pick[]; onCancel: () => void; onSave: (d: Partial<Item>) => void;
}) {
  const [title, setTitle] = useState(cat.name);
  const [passage, setPassage] = useState("");
  const [people, setPeople] = useState<string[]>([]);
  const [songList, setSongList] = useState<string[]>([]);
  const [text, setText] = useState("");
  const [pickSong, setPickSong] = useState("");
  const songLabel = (x: Pick) => (x.ref ? `${x.ref}. ${x.title}` : x.title);

  const addName = (v: string, max?: number) => { const t = v.trim(); if (t && (!max || people.length < max)) setPeople([...people, t]); };
  const names = (
    <div className="p3-field">
      <span>{cat.label ?? "Names"}</span>
      <div className="p3-chips">
        {people.map((n, k) => (
          <span className="p3-chip" key={k}>{n}<button aria-label={`Remove ${n}`} onClick={() => setPeople(people.filter((_, j) => j !== k))}>×</button></span>
        ))}
        {(
          <input
            className="p3-input-inline"
            list="p3-people"
            placeholder="Type a name, then Enter"
            aria-label={cat.label ?? "Names"}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addName((e.target as HTMLInputElement).value); (e.target as HTMLInputElement).value = ""; } }}
          />
        )}
      </div>
    </div>
  );

  let body: ReactNode = null;
  if (cat.fields === "person" || cat.fields === "names") body = names;
  // Songs and choirs both take any number of songs, each with its singers beneath it
  if (cat.fields === "song" || cat.fields === "choir") body = (
    <>
      {cat.fields === "choir" && <label className="p3-field"><span>Choir name</span><input value={title} onChange={(e) => setTitle(e.target.value)} /></label>}
      <div className="p3-field">
        <span>Songs</span>
        <div className="p3-chips">
          {songList.map((s, k) => (
            <span className="p3-chip" key={k}>{s}<button aria-label={`Remove ${s}`} onClick={() => setSongList(songList.filter((_, j) => j !== k))}>×</button></span>
          ))}
        </div>
        <div className="p3-row">
          <select value={pickSong} onChange={(e) => setPickSong(e.target.value)}>
            <option value="">Choose a song…</option>
            {songs.map((x) => <option key={x.id} value={songLabel(x)}>{songLabel(x)}</option>)}
          </select>
          <button className="p3-btn" type="button" disabled={!pickSong} onClick={() => { setSongList([...songList, pickSong]); setPickSong(""); }}>+ Add song</button>
        </div>
      </div>
      {names}
    </>
  );
  if (cat.fields === "scripture") body = (
    <>
      {/* Type a passage or choose a saved one; a saved study also fills in the passage text */}
      <label className="p3-field"><span>Passage</span>
        <input
          list="p3-passages"
          value={passage}
          placeholder="For example Psalm 23:1–3"
          onChange={(e) => { const v = e.target.value; setPassage(v); const s = studies.find((x) => x.ref === v); if (s) setText(s.passage); }}
        />
      </label>
      {names}
    </>
  );
  if (cat.fields === "text") body = (
    <label className="p3-field"><span>Announcements (one per line)</span><textarea value={text} onChange={(e) => setText(e.target.value)} /></label>
  );

  const save = () => {
    const d: Partial<Item> = { title: title.trim() || cat.name, people, songs: songList, text: cat.fields === "text" ? text : "" };
    // Scripture keeps its passage reference in ref and the passage text in passage
    if (cat.fields === "scripture") { d.ref = passage; d.passage = text; }
    onSave(d);
  };

  return (
    <div className="p3-form">
      <h3>{cat.name}</h3>
      {body}
      <div className="p3-row end">
        <button className="p3-btn" onClick={onCancel}>Cancel</button>
        <button className="p3-btn primary" onClick={save}>Add item</button>
      </div>
    </div>
  );
}
