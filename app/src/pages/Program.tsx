import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import NavBar from "../components/NavBar";
import logo from "../assets/church-logo.png";
import { buildProgramPdf, todayScripture } from "../lib/programPdf";

// Service program: the editor for the two-page half-fold brochure (the Word sample's layout).
// Every field is typed on the page. Generate PDF makes a PDF of the brochure only.
// Printed songs show number and title; scripture shows its reference; readings show their title.
// Lyrics and passage text belong to the projected slides, not to this page.

type Kind = "song" | "scripture" | "reading" | "prayer" | "custom" | "people";
interface Row { id: string; item: string; kind: Kind; detail: string; led: string; text: string; names: string[] }
interface Pick { id: string; label: string; text?: string }
interface Step { title: string; text: string }
interface Visit { heading: string; text: string }
export interface Draft {
  eyebrow: string; welcomeTo: string; church: string; welcomeText: string;
  steps: Step[]; weekLines: string[]; webLine: string;
  date: string; coverName1: string; coverName2: string; coverKind: string; tagline: string;
  verse: string; verseRef: string; coverTime: string; coverPlace: string;
  gatheringLabel: string; leader: string; orderTitle: string; rows: Row[]; orderNote: string;
  worshipTitle: string; visitTitle: string; visits: Visit[];
  announcementsTitle: string; announcements: string[];
  prayerTitle: string; prayers: string[];
  scriptureRef: string; scriptureText: string; scriptureCite: string;
  contactName: string; contactAddress: string; contactPhone: string; contactEmail: string; contactWeb: string;
}

const KEY = "serviceProgramDraft4";
const PEOPLE_KEY = "serviceProgramPeople";
const uid = () => Math.random().toString(36).slice(2, 9);
const DEFAULT: Draft = {
  eyebrow: "A PLACE TO BELONG", welcomeTo: "Welcome to", church: "Montagnard Bunong Alliance Church",
  welcomeText: "We are glad you are here. Whether this is your first Sunday or you have been with us for years, you are part of today’s worshiping community.",
  steps: [
    { title: "Meet someone after worship", text: "Our welcome team would love to say hello in the lobby." },
    { title: "Find a group", text: "Small groups meet throughout the week for prayer, study, and friendship." },
    { title: "Stay connected", text: "Visit the welcome desk for this week’s gatherings and ways to serve." },
  ],
  weekLines: ["Wednesday Prayer · 6:30 PM", "Community Supper · Thursday, 6:00 PM"],
  webLine: "gracecommunity.org  ·  @gracecommunity",
  date: "2026-11-15", coverName1: "MONTAGNARD", coverName2: "BUNONG ALLIANCE CHURCH", coverKind: "SUNDAY SERVICE", tagline: "Worship · Word · Community",
  verse: "“Let us draw near with a true heart in full assurance of faith.”", verseRef: "HEBREWS 10:22",
  coverTime: "10:00 AM", coverPlace: "4116 Freedom Dr. · Charlotte, NC 28208",
  gatheringLabel: "TODAY’S GATHERING", leader: "",
  orderTitle: "Order of Worship",
  rows: [
    { id: uid(), item: "Prelude", kind: "custom", detail: "", led: "", text: "", names: [] },
    { id: uid(), item: "Welcome & Call to Worship", kind: "custom", detail: "", led: "", text: "", names: [] },
    { id: uid(), item: "Opening Song", kind: "song", detail: "", led: "", text: "", names: [] },
    { id: uid(), item: "Opening Prayer", kind: "prayer", detail: "", led: "", text: "", names: [] },
    { id: uid(), item: "Songs of Praise", kind: "song", detail: "", led: "", text: "", names: [] },
    { id: uid(), item: "Children Choir", kind: "song", detail: "", led: "", text: "", names: [] },
    { id: uid(), item: "Youth Choir", kind: "song", detail: "", led: "", text: "", names: [] },
    { id: uid(), item: "Scripture Reading", kind: "scripture", detail: "Psalm 23", led: "", text: "The Lord is my shepherd; I shall not want. He makes me lie down in green pastures. He leads me beside still waters. He restores my soul.", names: [] },
    { id: uid(), item: "Message", kind: "custom", detail: "", led: "", text: "", names: [] },
    { id: uid(), item: "Response & Prayer", kind: "prayer", detail: "", led: "", text: "", names: [] },
    { id: uid(), item: "Prayer for the Offering", kind: "prayer", detail: "", led: "", text: "", names: [] },
    { id: uid(), item: "Offering & Announcements", kind: "custom", detail: "", led: "", text: "", names: [] },
    { id: uid(), item: "Sok Nh'hor", kind: "people", detail: "", led: "", text: "", names: [] },
    { id: uid(), item: "Closing Song", kind: "song", detail: "", led: "", text: "", names: [] },
    { id: uid(), item: "Closing Prayer", kind: "prayer", detail: "", led: "", text: "", names: [] },
  ],
  orderNote: "Please feel free to participate as you are comfortable. Children are welcome throughout the service.",
  worshipTitle: "WORSHIP TOGETHER", visitTitle: "For your visit",
  visits: [
    { heading: "CHILDREN & FAMILIES", text: "Children are welcome in worship. Nursery care for ages 0–4 is available downstairs; ask an usher for directions." },
    { heading: "PRAYER & CARE", text: "Would you like someone to pray with you? Our prayer team will be available near the front after the service." },
    { heading: "GIVING", text: "Your generosity supports our church and neighbors. Offering boxes are by the exits, or give online at gracecommunity.org/give." },
  ],
  announcementsTitle: "Announcements", announcements: ["", "", "", ""],
  prayerTitle: "Pray this week",
  prayers: ["For our leaders and those who serve", "For the sick and those who are grieving", "For our children and families", "For our neighbors and our community", "For our missionaries and partners", "For peace in our homes and our nation", "For those who are visiting with us today"],
  scriptureRef: "Psalm 23", scriptureText: "The Lord is my shepherd; I shall not want. He makes me lie down in green pastures. He leads me beside still waters. He restores my soul.",
  scriptureCite: "— Psalm 23:1–3",
  contactName: "Montagnard Bunong Alliance Church", contactAddress: "4116 Freedom Dr. · Charlotte, NC 28208", contactPhone: "", contactEmail: "", contactWeb: "",
};

function loadDraft(): Draft {
  let saved: Partial<Draft> = {};
  try { saved = JSON.parse(localStorage.getItem(KEY) || "null") ?? {}; } catch { saved = {}; }
  const d: Draft = { ...DEFAULT, ...saved };
  d.rows = d.rows.map((r) => ({ ...r, text: r.text ?? "", names: r.names ?? [] }));
  if (!d.rows.some((r) => r.item === "Sok Nh'hor")) {
    const at = d.rows.findIndex((r) => r.item === "Offering & Announcements");
    const row: Row = { id: uid(), item: "Sok Nh'hor", kind: "people", detail: "", led: "", text: "", names: [] };
    d.rows = at >= 0 ? [...d.rows.slice(0, at + 1), row, ...d.rows.slice(at + 1)] : [...d.rows, row];
  }
  // Saved drafts from earlier versions: add the choir items after Songs of Praise if they are missing
  const names = d.rows.map((r) => r.item);
  const missing = ["Children Choir", "Youth Choir"].filter((n) => !names.includes(n));
  if (missing.length) {
    const at = d.rows.findIndex((r) => r.item === "Songs of Praise");
    const extra = missing.map((n) => ({ id: uid(), item: n, kind: "song" as Kind, detail: "", led: "", text: "", names: [] }));
    d.rows = at >= 0 ? [...d.rows.slice(0, at + 1), ...extra, ...d.rows.slice(at + 1)] : [...d.rows, ...extra];
  }
  return d;
}
function loadPeople(): string[] {
  try { return JSON.parse(localStorage.getItem(PEOPLE_KEY) || "[]"); } catch { return []; }
}

// The passage text of a saved study: its passage slides, with formatting markers removed
function studyText(data: unknown): string {
  const slides = (data as { slides?: { kind?: string; text?: string }[] } | null)?.slides ?? [];
  return slides.filter((x) => x.kind === "passage" && x.text).map((x) => (x.text ?? "").replace(/\*\*|~~|__|\{#?[^}]*\}|\{\/\}|[\u0001-\u0003]/g, "").trim()).join(" ");
}

// Saved songs, readings and studies to pick from (signed in: database; otherwise this browser)
function useLibrary() {
  const [songs, setSongs] = useState<Pick[]>([]);
  const [readings, setReadings] = useState<Pick[]>([]);
  const [studies, setStudies] = useState<Pick[]>([]);
  useEffect(() => {
    (async () => {
      if (supabase) {
        const [s, r, t] = await Promise.all([
          supabase.from("lyric_songs").select("id, song_number, title").order("updated_at", { ascending: false }),
          supabase.from("readings").select("id, number, title").order("updated_at", { ascending: false }),
          supabase.from("scripture_studies").select("id, study_title, reference, data").order("updated_at", { ascending: false }),
        ]);
        setSongs((s.data ?? []).map((x) => ({ id: x.id, label: `${x.song_number ? x.song_number + ". " : ""}${x.title || "(untitled)"}` })));
        setReadings((r.data ?? []).map((x) => ({ id: x.id, label: `${x.number ? x.number + ". " : ""}${x.title || "(untitled)"}` })));
        setStudies((t.data ?? []).map((x) => ({ id: x.id, label: x.reference || x.study_title || "(untitled)", text: studyText(x.data) })));
      } else {
        try {
          const ls = JSON.parse(localStorage.getItem("lyricsSongs") || "[]");
          setSongs(ls.map((x: { id: string; number?: string; title?: string }) => ({ id: x.id, label: `${x.number ? x.number + ". " : ""}${x.title || "(untitled)"}` })));
        } catch { /* storage blocked */ }
        try {
          const rs = JSON.parse(localStorage.getItem("readingsLocal") || "[]");
          setReadings(rs.map((x: { id: string; number?: string; title?: string }) => ({ id: x.id, label: `${x.number ? x.number + ". " : ""}${x.title || "(untitled)"}` })));
        } catch { /* storage blocked */ }
      }
    })();
  }, []);
  return { songs, readings, studies };
}

const KIND_LABEL: Record<Kind, string> = { song: "Song", scripture: "Scripture", reading: "Reading", prayer: "Prayer", custom: "Other", people: "Names" };

export default function Program() {
  const [d, setD] = useState<Draft>(() => loadDraft());
  const [people, setPeople] = useState<string[]>(() => loadPeople());
  const [newPerson, setNewPerson] = useState("");
  const lib = useLibrary();
  const [status, setStatus] = useState("Type directly on the program. Generate PDF makes the brochure.");
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch { /* storage blocked */ } }, [d]);
  useEffect(() => { try { localStorage.setItem(PEOPLE_KEY, JSON.stringify(people)); } catch { /* storage blocked */ } }, [people]);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((cur) => ({ ...cur, [k]: v }));

  const options = (k: Kind): Pick[] => (k === "song" ? lib.songs : k === "reading" ? lib.readings : k === "scripture" ? lib.studies : []);
  const updateRow = (id: string, patch: Partial<Row>) => set("rows", d.rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const addRow = () => { set("rows", [...d.rows, { id: uid(), item: "", kind: "custom", detail: "", led: "", text: "", names: [] }]); setStatus("Item added."); };
  const removeRow = (id: string) => set("rows", d.rows.filter((r) => r.id !== id));
  const moveRow = (id: string, dir: -1 | 1) => {
    const i = d.rows.findIndex((r) => r.id === id), j = i + dir;
    if (i < 0 || j < 0 || j >= d.rows.length) return;
    const next = d.rows.slice(); [next[i], next[j]] = [next[j], next[i]]; set("rows", next);
  };
  const setStep = (i: number, patch: Partial<Step>) => set("steps", d.steps.map((s, k) => (k === i ? { ...s, ...patch } : s)));
  const setVisit = (i: number, patch: Partial<Visit>) => set("visits", d.visits.map((s, k) => (k === i ? { ...s, ...patch } : s)));
  const setList = (key: "weekLines" | "announcements" | "prayers", i: number, v: string) => set(key, d[key].map((x, k) => (k === i ? v : x)));

  function addPerson() {
    const n = newPerson.trim();
    if (!n || people.includes(n)) return;
    setPeople([...people, n]); setNewPerson("");
  }

  const today = todayScripture(d);

  const coverDate = useMemo(() => {
    try { return new Date(`${d.date}T12:00:00`).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" }).toUpperCase(); } catch { return d.date; }
  }, [d.date]);

  // Generate PDF: the brochure only, downloaded as a file. No webpage, buttons or editor controls.
  async function generatePdf() {
    setStatus("Making the PDF…");
    try {
      const bytes = await buildProgramPdf(d, logo, coverDate);
      const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const name = `${d.coverName1} ${d.coverName2} ${d.date}`.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-") || "service-program";
      a.href = url; a.download = `${name}.pdf`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setStatus("PDF made. Check your downloads folder.");
    } catch (err) {
      setStatus(`Could not make the PDF: ${err instanceof Error ? err.message : "unknown error"}`);
    }
  }

  return (
    <div className="pg">
      <NavBar />
      <div className="pg-top">
        <div>
          <h1>Service program</h1>
          <p>{status}</p>
        </div>
        <div className="pg-actions">
          <button className="pg-btn" onClick={addRow}>+ Add item</button>
          <button className="pg-btn" onClick={() => window.print()}>Print</button>
          <button className="pg-btn primary" onClick={generatePdf}>Generate PDF</button>
        </div>
      </div>

      <datalist id="pg-people">{people.map((p) => <option key={p} value={p} />)}</datalist>

      {/* Page 1, outside: welcome (left), front cover (right) */}
      <p className="pg-pagelabel">Page 1 · Outside: back panel (left) and front cover (right)</p>
      <div className="pg-sheet pg-page" aria-label="Page 1, outside">
        <section className="pg-panel pg-welcome">
          <p className="pg-eyebrow"><input className="pg-in" value={d.eyebrow} onChange={(e) => set("eyebrow", e.target.value)} aria-label="Welcome heading" /></p>
          <h2 className="pg-h2">
            <input className="pg-in pg-small" value={d.welcomeTo} onChange={(e) => set("welcomeTo", e.target.value)} aria-label="Welcome line" />
            <input className="pg-in" value={d.church} onChange={(e) => set("church", e.target.value)} aria-label="Church name" />
          </h2>
          <textarea className="pg-in pg-body" value={d.welcomeText} onChange={(e) => set("welcomeText", e.target.value)} aria-label="Welcome text" />
          <p className="pg-eyebrow">PLAN YOUR NEXT STEP</p>
          {d.steps.map((s, i) => (
            <div className="pg-step" key={i}>
              <span className="pg-num">0{i + 1}</span>
              <div>
                <input className="pg-in pg-strong" value={s.title} onChange={(e) => setStep(i, { title: e.target.value })} aria-label={`Step ${i + 1} title`} />
                <input className="pg-in pg-muted" value={s.text} onChange={(e) => setStep(i, { text: e.target.value })} aria-label={`Step ${i + 1} text`} />
              </div>
            </div>
          ))}
          <p className="pg-eyebrow">THIS WEEK</p>
          {d.weekLines.map((w, i) => <input key={i} className="pg-in" value={w} onChange={(e) => setList("weekLines", i, e.target.value)} aria-label={`This week line ${i + 1}`} />)}
          <input className="pg-in pg-eyebrow pg-web" value={d.webLine} onChange={(e) => set("webLine", e.target.value)} aria-label="Website and social" />
        </section>

        <section className="pg-panel pg-cover">
          <div className="pg-cover-top">
            <input className="pg-in pg-eyebrow" value={coverDate} readOnly aria-label="Date (set below)" />
            <input className="pg-in pg-date" type="date" value={d.date} onChange={(e) => set("date", e.target.value)} aria-label="Service date" />
          </div>
          <img className="pg-logo" src={logo} alt="Church logo" />
          <h2 className="pg-name">
            <input className="pg-in" value={d.coverName1} onChange={(e) => set("coverName1", e.target.value)} aria-label="Church name, first line" />
            <input className="pg-in pg-sub-name" value={d.coverName2} onChange={(e) => set("coverName2", e.target.value)} aria-label="Church name, second line" />
          </h2>
          <input className="pg-in pg-service" value={d.coverKind} onChange={(e) => set("coverKind", e.target.value)} aria-label="Service name" />
          <input className="pg-in pg-muted pg-center" value={d.tagline} onChange={(e) => set("tagline", e.target.value)} aria-label="Tagline" />
          <p className="pg-in pg-verse pg-follow-text">{today.text ? `“${today.text}”` : d.verse}</p>
          <p className="pg-eyebrow pg-center">{today.ref || d.verseRef}</p>
          <div className="pg-place">
            <input className="pg-in pg-muted" value={d.coverTime} onChange={(e) => set("coverTime", e.target.value)} aria-label="Service time" />
            <span className="pg-muted"> · </span>
            <input className="pg-in pg-muted" value={d.coverPlace} onChange={(e) => set("coverPlace", e.target.value)} aria-label="Address" />
          </div>
        </section>
      </div>

      {/* Page 2, inside: today's gathering (left), worship together (right) */}
      <p className="pg-pagelabel">Page 2 · Inside: today’s gathering (left) and worship together (right)</p>
      <div className="pg-sheet pg-page" aria-label="Page 2, inside">
        <section className="pg-panel pg-order">
          <div className="pg-gathering-head">
            <p className="pg-eyebrow"><input className="pg-in" value={d.gatheringLabel} onChange={(e) => set("gatheringLabel", e.target.value)} aria-label="Gathering heading" /></p>
            <p className="pg-led">Led by <input className="pg-in pg-led-in" list="pg-people" value={d.leader} onChange={(e) => set("leader", e.target.value)} aria-label="Led by" placeholder="Name" /></p>
          </div>
          <h2 className="pg-h2"><input className="pg-in" value={d.orderTitle} onChange={(e) => set("orderTitle", e.target.value)} aria-label="Order of worship heading" /></h2>
          <div className="pg-rows">
            {d.rows.map((r, i) => (
              <div className="pg-row" key={r.id}>
                <div className="pg-item">
                  <div className="pg-item-line">
                    <input className="pg-in pg-strong" value={r.item} placeholder="Item" onChange={(e) => updateRow(r.id, { item: e.target.value })} aria-label={`Item name, ${i + 1}`} />
                    <select className="pg-kind" value={r.kind} onChange={(e) => updateRow(r.id, { kind: e.target.value as Kind })} aria-label={`Type, item ${i + 1}`}>
                      {(Object.keys(KIND_LABEL) as Kind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
                    </select>
                    {options(r.kind).length > 0 && (
                      <select className="pg-kind" value="" onChange={(e) => { const o = options(r.kind).find((x) => x.id === e.target.value); if (!o) return; if (r.kind === "song") updateRow(r.id, { names: [...r.names, o.label] }); else updateRow(r.id, { detail: o.label, text: o.text ?? "" }); }} aria-label={`Choose a saved ${KIND_LABEL[r.kind].toLowerCase()}, item ${i + 1}`}>
                        <option value="">Choose saved…</option>
                        {options(r.kind).map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                      </select>
                    )}
                  </div>
                  <div className="pg-item-sub">
                    <input className="pg-in pg-muted" value={r.detail} placeholder="Details" onChange={(e) => updateRow(r.id, { detail: e.target.value })} aria-label={`Details, item ${i + 1}`} />
                    <input className="pg-in pg-led-row" list="pg-people" value={r.led} placeholder="Name" onChange={(e) => updateRow(r.id, { led: e.target.value })} aria-label={`Led by, item ${i + 1}`} />
                  </div>
                  {(r.kind === "people" || r.kind === "song") && (
                    <div className="pg-names">
                      {r.names.map((n, k) => (
                        <div className="pg-name-row" key={k}>
                          <input className="pg-in pg-muted" list={r.kind === "people" ? "pg-people" : undefined} value={n} placeholder={r.kind === "song" ? "Song title" : "Name"} onChange={(e) => updateRow(r.id, { names: r.names.map((x, j) => (j === k ? e.target.value : x)) })} aria-label={`${r.kind === "song" ? "Song" : "Name"} ${k + 1}, ${r.item}`} />
                          <button className="pg-x" onClick={() => updateRow(r.id, { names: r.names.filter((_, j) => j !== k) })} aria-label={`Remove name ${k + 1}`}>×</button>
                        </div>
                      ))}
                      <button className="pg-btn small" onClick={() => updateRow(r.id, { names: [...r.names, ""] })}>{r.kind === "song" ? "+ Add another song" : "+ Add a name"}</button>
                    </div>
                  )}
                  {r.kind === "scripture" && <textarea className="pg-in pg-body pg-passage" value={r.text} placeholder="Passage text (shown in Today’s Scripture and on the cover)" onChange={(e) => updateRow(r.id, { text: e.target.value })} aria-label={`Passage text, item ${i + 1}`} />}
                </div>
                <div className="pg-rowtools">
                  <button className="pg-x" onClick={() => moveRow(r.id, -1)} disabled={i === 0} aria-label={`Move item ${i + 1} up`}>↑</button>
                  <button className="pg-x" onClick={() => moveRow(r.id, 1)} disabled={i === d.rows.length - 1} aria-label={`Move item ${i + 1} down`}>↓</button>
                  <button className="pg-x" onClick={() => removeRow(r.id)} aria-label={`Remove item ${i + 1}`}>×</button>
                </div>
              </div>
            ))}
          </div>
          <button className="pg-btn small pg-add" onClick={addRow}>+ Add another song or item</button>
          <textarea className="pg-in pg-muted pg-note" value={d.orderNote} onChange={(e) => set("orderNote", e.target.value)} aria-label="Note under the order" />
        </section>

        <section className="pg-panel pg-info">
          <p className="pg-eyebrow"><input className="pg-in" value={d.worshipTitle} onChange={(e) => set("worshipTitle", e.target.value)} aria-label="Worship heading" /></p>
          <h2 className="pg-h2"><input className="pg-in" value={d.visitTitle} onChange={(e) => set("visitTitle", e.target.value)} aria-label="For your visit heading" /></h2>
          {d.visits.map((v, i) => (
            <div className="pg-visit" key={i}>
              <p className="pg-eyebrow"><input className="pg-in" value={v.heading} onChange={(e) => setVisit(i, { heading: e.target.value })} aria-label={`Visit heading ${i + 1}`} /></p>
              <textarea className="pg-in pg-body pg-small-body" value={v.text} onChange={(e) => setVisit(i, { text: e.target.value })} aria-label={`Visit text ${i + 1}`} />
            </div>
          ))}
          <div className="pg-announce">
            <p className="pg-eyebrow"><input className="pg-in" value={d.announcementsTitle} onChange={(e) => set("announcementsTitle", e.target.value)} aria-label="Announcements heading" /></p>
            {d.announcements.map((a, i) => <input key={i} className="pg-in pg-body" value={a} placeholder={`Announcement ${i + 1}`} onChange={(e) => setList("announcements", i, e.target.value)} aria-label={`Announcement ${i + 1}`} />)}
          </div>
          <div className="pg-prayer">
            <p className="pg-eyebrow"><input className="pg-in" value={d.prayerTitle} onChange={(e) => set("prayerTitle", e.target.value)} aria-label="Prayer list heading" /></p>
            <ol className="pg-prayer-list">
              {d.prayers.map((p, i) => <li key={i}><input className="pg-in pg-body" value={p} onChange={(e) => setList("prayers", i, e.target.value)} aria-label={`Prayer point ${i + 1}`} /></li>)}
            </ol>
          </div>
          <div className="pg-scripture">
            <p className="pg-eyebrow">TODAY’S SCRIPTURE</p>
            <p className="pg-h3 pg-follow">{today.ref || "No scripture yet"}</p>
            <p className="pg-body pg-follow-text">{today.text}</p>
            <p className="pg-eyebrow">{today.cite}</p>
            <p className="pg-hint">Taken from the Scripture Reading item in the order of worship.</p>
          </div>
          <div className="pg-contact">
            <p className="pg-eyebrow">STAY IN TOUCH</p>
            <input className="pg-in pg-muted" value={d.contactName} onChange={(e) => set("contactName", e.target.value)} aria-label="Contact name" />
            <input className="pg-in pg-muted" value={d.contactAddress} onChange={(e) => set("contactAddress", e.target.value)} aria-label="Contact address" />
            <input className="pg-in pg-muted" value={`${d.contactPhone} · ${d.contactEmail}`} onChange={(e) => { const [p, m] = e.target.value.split(" · "); set("contactPhone", p ?? ""); set("contactEmail", m ?? ""); }} aria-label="Phone and email" />
            <input className="pg-in pg-muted" value={d.contactWeb} onChange={(e) => set("contactWeb", e.target.value)} aria-label="Website" />
          </div>
        </section>
      </div>

      {/* Saved people: used by the Led by and team pickers on the brochure */}
      <section className="pg-people" aria-label="Saved people">
        <h2>Saved people</h2>
        <p>Names here appear in the Led by and service team pickers. Add everyone who serves regularly.</p>
        <div className="pg-people-add">
          <input className="pg-field" value={newPerson} onChange={(e) => setNewPerson(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addPerson(); }} placeholder="Add a name" aria-label="Add a person" />
          <button className="pg-btn" onClick={addPerson} disabled={!newPerson.trim()}>Add</button>
        </div>
        <ul className="pg-people-list">
          {people.map((p) => (
            <li key={p}>{p} <button className="pg-x" onClick={() => setPeople(people.filter((x) => x !== p))} aria-label={`Remove ${p}`}>×</button></li>
          ))}
          {!people.length && <li className="pg-muted">No saved people yet.</li>}
        </ul>
      </section>
      <p className="pg-note-line">Projected slides still show the full lyrics or passage text. The brochure prints titles, numbers, references and names only.</p>
    </div>
  );
}
