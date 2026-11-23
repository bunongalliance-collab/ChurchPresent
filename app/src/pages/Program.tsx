import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { canEdit, saveChurchId, useChurch } from "../lib/church";
import NavBar from "../components/NavBar";
import logo from "../assets/church-logo.png?url";
import { STAGES, buildProgramPdf, todayScripture } from "../lib/programPdf";
import OrderTable from "../components/OrderTable";
import { PROGRAM_DRAFT_KEY, linkOf, rowsToLines, toRows, type Lines } from "../lib/orderLines";
import { loadReadingOptions, recentStudyIds, useSongOptions, type ReadingOption } from "../lib/recentSongs";
import type { SetStateAction } from "react";
import { publishService } from "../lib/publishedService";
import { toast } from "../lib/toast";
import { useSharedProgram } from "../lib/programs";
import ProgramBar from "../components/ProgramBar";

// Service program: the editor for the two-page half-fold brochure (the Word sample's layout).
// Every field is typed on the page. Download PDF makes a PDF of the brochure only.
// Printed songs show number and title; scripture shows its reference and passage text (as in the sample);
// readings show their title. Song lyrics belong to the projected slides, not to this page.

type Kind = "song" | "scripture" | "reading" | "prayer" | "custom" | "people";
export interface Row { id: string; item: string; kind: Kind; detail: string; led: string; text: string; names: string[]; stage: number; ref?: string; lines?: { text: string; level: number }[] }
const STAGE_OF: Record<string, number> = {
  "Prelude": 0, "Welcome & Call to Worship": 0, "Opening Song": 0, "Opening Prayer": 0,
  "Songs of Praise": 1, "Children Choir": 1, "Youth Choir": 1, "Prayer for the Offering": 1, "Offering & Announcements": 1,
  "Scripture Reading": 2, "Reading": 2, "Message": 2, "Response & Prayer": 2,
  "Closing Song": 3, "Closing Prayer": 3,
  "Sok Nh'hor": 4,
};
interface Step { title: string; text: string }
interface PrayerGroup { title: string; items: string[] }
export interface Draft {
  eyebrow: string; welcomeTo: string; church: string; welcomeText: string;
  steps: Step[]; weekLines: string[]; webLine: string;
  date: string; coverName1: string; coverName2: string; coverKind: string; tagline: string;
  verse: string; verseRef: string; coverTime: string; coverPlace: string;
  gatheringLabel: string; leader: string; orderTitle: string; rows: Row[]; orderNote: string;
  worshipTitle: string; visitTitle: string;
  announcementsTitle: string; announcements: string[];
  prayerGroups: PrayerGroup[];
  scriptureRef: string; scriptureText: string; scriptureCite: string;
  contactName: string; contactAddress: string; contactPhone: string; contactEmail: string; contactWeb: string;
  lines?: Lines; // the Order of Worship as typed lines (the editor). rows are kept for older saves.
}

const KEY = PROGRAM_DRAFT_KEY;
const uid = () => Math.random().toString(36).slice(2, 9);
const DEFAULT: Draft = {
  eyebrow: "A PLACE TO BELONG", welcomeTo: "Welcome to", church: "Montagnard Bunong Alliance Church",
  welcomeText: "We are glad you are here. Whether this is your first Sunday or you have been with us for years, you are part of today’s worshiping community.",
  // Blank slots: the welcome steps, weekly lines and website are filled in for each church, not left as sample text
  steps: [
    { title: "", text: "" },
    { title: "", text: "" },
    { title: "", text: "" },
  ],
  weekLines: [""],
  webLine: "",
  date: "2026-11-15", coverName1: "MONTAGNARD", coverName2: "BUNONG ALLIANCE CHURCH", coverKind: "SUNDAY SERVICE", tagline: "Worship · Word · Community",
  verse: "“Let us draw near with a true heart in full assurance of faith.”", verseRef: "HEBREWS 10:22",
  coverTime: "10:00 AM", coverPlace: "4116 Freedom Dr. · Charlotte, NC 28208",
  gatheringLabel: "TODAY’S GATHERING", leader: "",
  orderTitle: "Order of Worship",
  rows: [
    { id: uid(), item: "Prelude", kind: "custom", detail: "", led: "", text: "", names: [], stage: 0 },
    { id: uid(), item: "Welcome & Call to Worship", kind: "custom", detail: "", led: "", text: "", names: [], stage: 0 },
    { id: uid(), item: "Opening Song", kind: "song", detail: "", led: "", text: "", names: [], stage: 0 },
    { id: uid(), item: "Opening Prayer", kind: "prayer", detail: "", led: "", text: "", names: [], stage: 0 },
    { id: uid(), item: "Songs of Praise", kind: "song", detail: "", led: "", text: "", names: [], stage: 0 },
    { id: uid(), item: "Children Choir", kind: "song", detail: "", led: "", text: "", names: [], stage: 0 },
    { id: uid(), item: "Youth Choir", kind: "song", detail: "", led: "", text: "", names: [], stage: 0 },
    { id: uid(), item: "Scripture Reading", kind: "scripture", detail: "Psalm 23", led: "", text: "The Lord is my shepherd; I shall not want. He makes me lie down in green pastures. He leads me beside still waters. He restores my soul.", names: [], stage: 0 },
    { id: uid(), item: "Message", kind: "custom", detail: "", led: "", text: "", names: [], stage: 0 },
    { id: uid(), item: "Response & Prayer", kind: "prayer", detail: "", led: "", text: "", names: [], stage: 0 },
    { id: uid(), item: "Prayer for the Offering", kind: "prayer", detail: "", led: "", text: "", names: [], stage: 0 },
    { id: uid(), item: "Offering & Announcements", kind: "custom", detail: "", led: "", text: "", names: [], stage: 0 },
    { id: uid(), item: "Sok Nh'hor", kind: "people", detail: "", led: "", text: "", names: [], stage: 0 },
    { id: uid(), item: "Closing Song", kind: "song", detail: "", led: "", text: "", names: [], stage: 0 },
    { id: uid(), item: "Closing Prayer", kind: "prayer", detail: "", led: "", text: "", names: [], stage: 0 },
  ],
  orderNote: "Please feel free to participate as you are comfortable. Children are welcome throughout the service.",
  worshipTitle: "WORSHIP TOGETHER", visitTitle: "For your visit",
  announcementsTitle: "Announcements", announcements: [""],
  prayerGroups: [
    { title: "Nau Mbơh Sơm Ăp Pơh Tâm Trôm Ngih Brah He, Tâm 7 Ntil:", items: [
      "Ăn geh ntũk Ăn Ndeh. — Sân đậu xe của nhà thờ.",
      "Ăn lộch tâm ron Manh Prăk. — Tổng Liên Hội.",
      "Ăn ma Rnăk Sa Kôranh nơm nti: — U-Che Kathie.",
      "Ăn ma lẽrngôch phung n'gâng kan. — Ăn gơh nđơi tâm kan khân pằng.",
      "Ăn ma lẽ rngôch phung choh. — Ăn tâm rglắp, tâm nau ndâk niềng.",
      "Ăn ma lẽ rgôch phung druh ndăm. — Phung gũ tâm nau uăt rja.",
      "Ăn ma lẽrngôch Bu klâu- Bu Ur lẽ geh răk.",
    ] },
    { title: "Nau Mbơh Sơm Ma Phung Gũ Pa Dih Ngih Brah He", items: [
      "Mbỡ Juy", "U-che kenven", "U-che Danise", "Mbỡ Hoan", "Mbỡ Nui", "Mbỡ Gui", "Mbỡ kdri", "Mbơ tâm", "Mbỡ Ester", "Rnăk: Mbỡ Ui", "Mbỡ Enna", "Mbỡ sư",
      "Mbỡ Enjôlina", "Rnăk: Mbỡ Chan", "Mbỡ phân", "Nhac - Tô - Mblong. Đel.", "Me Chim", "Mbỡ Thiêu", "Mbỡ seth", "Mbỡ kiêt", "U- che Samuel", "Rnăk Kdri", "Mbỡ tham", "Rnăk sa Lại",
    ] },
    { title: "Nau Mbơh sơm Pa Dih Bri. (Nâm bu bri drôn & VN)", items: [
      "Nau kan phung nsong mbơh tâm Bri Drôn.",
      "Tâm Ăp Rplay ngih Brah tâm Viêtnam. Trong tơm: Yêrêmi 33:3.",
    ] },
  ],
  scriptureRef: "Psalm 23", scriptureText: "The Lord is my shepherd; I shall not want. He makes me lie down in green pastures. He leads me beside still waters. He restores my soul.",
  scriptureCite: "— Psalm 23:1–3",
  contactName: "Montagnard Bunong Alliance Church", contactAddress: "4116 Freedom Dr. · Charlotte, NC 28208", contactPhone: "", contactEmail: "", contactWeb: "",
};

// Default rows take their stage from the table above
DEFAULT.rows = DEFAULT.rows.map((r) => ({ ...r, stage: STAGE_OF[r.item] ?? 0 }));

export function loadDraft(): Draft {
  let saved: Partial<Draft> = {};
  try { saved = JSON.parse(localStorage.getItem(KEY) || "null") ?? {}; } catch { saved = {}; }
  return normalizeDraft(saved);
}

// A full draft from saved data (this browser, or the church's program), filling in what older saves lack
export function normalizeDraft(data: unknown): Draft {
  const saved = (data && typeof data === "object" ? data : {}) as Partial<Draft>;
  const d: Draft = { ...DEFAULT, ...saved };
  d.rows = d.rows.map((r) => ({ ...r, text: r.text ?? "", names: r.names ?? [], stage: r.stage ?? STAGE_OF[r.item] ?? 0 }));
  const old = saved as Partial<Draft> & { prayers?: string[]; prayerTitle?: string };
  if (!saved.prayerGroups && old.prayers) d.prayerGroups = [{ title: old.prayerTitle ?? "", items: old.prayers }];
  if (!d.rows.some((r) => r.item === "Sok Nh'hor")) {
    const at = d.rows.findIndex((r) => r.item === "Offering & Announcements");
    const row: Row = { id: uid(), item: "Sok Nh'hor", kind: "people", detail: "", led: "", text: "", names: [], stage: 0 };
    d.rows = at >= 0 ? [...d.rows.slice(0, at + 1), row, ...d.rows.slice(at + 1)] : [...d.rows, row];
  }
  // Saved drafts from earlier versions: add the choir items after Songs of Praise if they are missing
  const names = d.rows.map((r) => r.item);
  const missing = ["Children Choir", "Youth Choir"].filter((n) => !names.includes(n));
  if (missing.length) {
    const at = d.rows.findIndex((r) => r.item === "Songs of Praise");
    const extra = missing.map((n) => ({ id: uid(), item: n, kind: "song" as Kind, detail: "", led: "", text: "", names: [], stage: 0 }));
    d.rows = at >= 0 ? [...d.rows.slice(0, at + 1), ...extra, ...d.rows.slice(at + 1)] : [...d.rows, ...extra];
  }
  return d;
}

// The passage text of a saved study: its passage slides, with formatting markers removed
function studyText(data: unknown): string {
  const slides = (data as { slides?: { kind?: string; text?: string }[] } | null)?.slides ?? [];
  return slides.filter((x) => x.kind === "passage" && x.text).map((x) => (x.text ?? "").replace(/\*\*|~~|__|\{#?[^}]*\}|\{\/\}|[\u0001-\u0003]/g, "").trim()).join(" ");
}

// The passage for the Nau Mpro App: each passage slide as its own paragraph, verse numbers kept as plain numbers
function studyParagraphs(data: unknown): string {
  const slides = (data as { slides?: { kind?: string; text?: string }[] } | null)?.slides ?? [];
  return slides.filter((x) => x.kind === "passage" && x.text)
    .map((x) => (x.text ?? "").replace(/\*\*|~~|__|\{#?[^}]*\}|\{\/\}/g, "").replace(/\u0001(\d+)\u0001?/g, "$1 ").replace(/[\u0001-\u0003]/g, "").replace(/ {2,}/g, " ").trim())
    .join("\n\n");
}

// Saved songs, readings and studies to pick from (signed in: database; otherwise this browser)


export default function Program() {
  const [d, setD] = useState<Draft>(() => loadDraft());
  // Saved people are shared: everyone reads the list, and each person removes only the names they added
  const [people, setPeople] = useState<{ id: string; name: string; owner: string; church: string | null; created: string }[]>([]);
  useChurch(); // redraw when the account's churches load (who may remove a name)
  const [userId, setUserId] = useState<string | null>(null);
  const [newPerson, setNewPerson] = useState("");
  const loadPeopleList = async () => {
    if (!supabase) return;
    const { data, error } = await supabase.from("saved_people").select("id, name, owner_id, church_id, created_at").order("name");
    if (error) { setStatus(`Could not load saved people: ${error.message}`); return; }
    setPeople((data ?? []).map((x) => ({ id: x.id, name: x.name, owner: x.owner_id, church: x.church_id ?? null, created: x.created_at ?? "" })));
  };
  useEffect(() => {
    if (!supabase) return;
    void loadPeopleList();
    supabase.auth.getSession().then(({ data }) => setUserId(data.session?.user.id ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, sess) => setUserId(sess?.user.id ?? null));
    return () => sub.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Messages show in the banner at the top of the screen (each time, even when repeated); errors stay until closed
  const setStatus = (m: string) => toast(m, /^(Could not|Sign in|Set the)/.test(m));
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch { /* storage blocked */ } }, [d]);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((cur) => ({ ...cur, [k]: v }));
  // The church's program for this date, shared with the team (lib/programs.ts). Its own copy stays in this browser
  // as the draft, so Service Slides and the offline case keep working.
  const replaceDraft = useCallback((next: Draft) => setD(next), []);
  const shared = useSharedProgram(d, replaceDraft, normalizeDraft);
  // A blank program: the church's own text kept (welcome, contact, prayer lists), the service itself emptied
  const blankFor = useCallback((date: string): Draft => normalizeDraft({
    ...d, date, rows: DEFAULT.rows.map((r) => ({ ...r, id: uid() })), lines: undefined,
    scriptureRef: "", scriptureText: "", scriptureCite: "", announcements: [""], leader: "",
  }), [d]);

  // The Order of Worship lines. Services saved in the older format are converted once, on first edit.
  const orderLines: Lines = d.lines ?? rowsToLines(d.rows);
  const setOrderLines = (u: SetStateAction<Lines>) => setD((cur) => {
    const now = cur.lines ?? rowsToLines(cur.rows);
    return { ...cur, lines: typeof u === "function" ? (u as (c: Lines) => Lines)(now) : u };
  });
  // Each word capitalised, as the PDF prints sub-items and names (programPdf.ts titleCase)
  const printCase = (t: string) => t.split(" ").map((w) => (w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w)).join(" ");
  // The order as the brochure prints it (the same rows the PDF builder uses)
  const printedOrder = useMemo(() => toRows(orderLines, {}), [orderLines]);
  // Scripture text for the PDF comes from the saved studies, as in the Program Builder
  const [passages, setPassages] = useState<Record<string, string>>({});
  // The same passages with each slide's text on its own paragraph, for the Nau Mpro App
  const [passageText, setPassageText] = useState<Record<string, string>>({});
  // Song choices: the Presentation Builder's Recent songs first, then every saved song. Each choice carries the song's id.
  // Kept up to date: a song added on the Lyric page (in another tab or on another device) appears without a reload
  const songOptions = useSongOptions();
  // Passage suggestions: the study's title and its verse, e.g. "Trust in God — Psalm 23:1-6"; the verse is what gets saved
  const [passageOptions, setPassageOptions] = useState<{ id: string; value: string; label: string; date: string; recent: boolean }[]>([]);
  // Reading suggestions: the saved readings from the Readings page, newest first
  // Recent readings (the Builder's list) come first; each carries the id of its saved copy
  const [readingOptions, setReadingOptions] = useState<ReadingOption[]>([]);
  useEffect(() => { void loadReadingOptions().then(setReadingOptions); }, []);
  useEffect(() => {
    if (!supabase) return;
    supabase.from("scripture_studies").select("id, study_title, reference, data, updated_at").order("updated_at", { ascending: false }).then(({ data }) => {
      const map: Record<string, string> = {};
      const full: Record<string, string> = {};
      const opts: { id: string; value: string; label: string; date: string; recent: boolean }[] = [];
      // The Builder's Recent scriptures: the 8 newest studies, minus the ones hidden there
      const recentIds = recentStudyIds(data ?? []);
      (data ?? []).forEach((x) => {
        if (!x.reference) return;
        map[x.reference] = studyText(x.data);
        full[x.reference] = studyParagraphs(x.data);
        opts.push({ id: x.id, value: x.reference, label: x.study_title ? `${x.study_title} — ${x.reference}` : x.reference, date: x.updated_at ?? "", recent: recentIds.has(x.id) });
      });
      setPassages(map);
      setPassageText(full);
      setPassageOptions(opts);
    });
  }, []);
  // A choice made from a Recent list stays linked to what it came from: if a song's number or title (or a study's
  // reference) changes, the line follows
  useEffect(() => {
    const labels = new Map<string, string>();
    for (const o of songOptions) labels.set(`song:${o.id}`, o.value);
    for (const o of readingOptions) if (o.id) labels.set(`reading:${o.id}`, o.value);
    for (const o of passageOptions) labels.set(`scripture:${o.id}`, o.value);
    if (!labels.size) return;
    setD((cur) => {
      if (!cur.lines) return cur;
      let changed = false;
      const next: Lines = {};
      for (const [stage, list] of Object.entries(cur.lines)) {
        next[Number(stage)] = list.map((ln) => {
          const link = linkOf(ln);
          const label = link ? labels.get(`${link.kind}:${link.id}`) : undefined;
          if (label && label !== ln.text) { changed = true; return { ...ln, text: label }; }
          return ln;
        });
      }
      return changed ? { ...cur, lines: next } : cur;
    });
  }, [songOptions, readingOptions, passageOptions]);
  const pdfDraft: Draft = useMemo(() => (d.lines ? { ...d, rows: toRows(d.lines, passages) } : d), [d, passages]);

  // Print: builds the brochure PDF and opens it in a new tab, ready to print. The tab opens straight from the
  // click (so it is not blocked as a pop-up) and shows the PDF once it is made.
  async function printBrochure() {
    const tab = window.open("", "_blank");
    setStatus("Making the PDF…");
    try {
      const bytes = await buildProgramPdf(pdfDraft, logo, coverDate);
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
      if (tab) tab.location.href = url; else window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      setStatus("The brochure opened in a new tab, ready to print.");
    } catch (err) {
      tab?.close();
      setStatus(`Could not make the PDF: ${err instanceof Error ? err.message : "unknown error"}`);
    }
  }
  const setStep = (i: number, patch: Partial<Step>) => set("steps", d.steps.map((s, k) => (k === i ? { ...s, ...patch } : s)));
  const setList = (key: "weekLines" | "announcements", i: number, v: string) => set(key, d[key].map((x, k) => (k === i ? v : x)));
  // Announcements: no limit
  const addToList = (key: "announcements") => set(key, [...d[key], ""]);
  const removeFromList = (key: "announcements", i: number) => set(key, d[key].filter((_, k) => k !== i));
  // Prayer categories: each has a heading and its own list (up to GROUP_LIMIT items)
  const setGroups = (groups: PrayerGroup[]) => set("prayerGroups", groups);
  const addGroup = () => setGroups([...d.prayerGroups, { title: "", items: [] }]);
  const removeGroup = (gi: number) => setGroups(d.prayerGroups.filter((_, k) => k !== gi));
  const setGroupTitle = (gi: number, v: string) => setGroups(d.prayerGroups.map((g, k) => (k === gi ? { ...g, title: v } : g)));
  const setGroupItem = (gi: number, i: number, v: string) => setGroups(d.prayerGroups.map((g, k) => (k === gi ? { ...g, items: g.items.map((x, j) => (j === i ? v : x)) } : g)));
  const addGroupItem = (gi: number) => setGroups(d.prayerGroups.map((g, k) => (k === gi ? { ...g, items: [...g.items, ""] } : g)));
  const removeGroupItem = (gi: number, i: number) => setGroups(d.prayerGroups.map((g, k) => (k === gi ? { ...g, items: g.items.filter((_, j) => j !== i) } : g)));

  // Names in the program start each word with a capital ("rick lee" -> "Rick Lee")
  const capitaliseName = (n: string) => n.trim().replace(/\s+/g, " ").replace(/(^|[\s-])(\p{L})/gu, (_, a: string, b: string) => a + b.toUpperCase());
  async function addPerson() {
    const n = capitaliseName(newPerson);
    if (!n || !supabase) return;
    if (!userId) { setStatus("Sign in to add a name. Everyone can see the list without signing in."); return; }
    if (people.some((p) => p.name.toLowerCase() === n.toLowerCase())) { setNewPerson(""); return; }
    const { error } = await supabase.from("saved_people").insert({ owner_id: userId, church_id: saveChurchId(), name: n });
    if (error) { setStatus(`Could not save the name: ${error.message}`); return; }
    setNewPerson("");
    await loadPeopleList();
  }
  async function removePerson(id: string) {
    if (!supabase) return;
    const { error } = await supabase.from("saved_people").delete().eq("id", id);
    if (error) { setStatus(`Could not remove the name: ${error.message}`); return; }
    await loadPeopleList();
  }

  const today = todayScripture(pdfDraft);

  const coverDate = useMemo(() => {
    try { return new Date(`${d.date}T12:00:00`).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" }).toUpperCase(); } catch { return d.date; }
  }, [d.date]);


  // Download PDF: the brochure only, downloaded as a file. No webpage, buttons or editor controls.
  async function generatePdf() {
    setStatus("Making the PDF…");
    try {
      const bytes = await buildProgramPdf(pdfDraft, logo, coverDate);
      const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const name = `${d.coverName1} ${d.coverName2} ${d.date}`.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-") || "service-program";
      const stamp = new Date().toTimeString().slice(0, 5).replace(":", "");
      a.href = url; a.download = `${name}-${stamp}.pdf`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setStatus("PDF made. Check your downloads folder.");
    } catch (err) {
      setStatus(`Could not make the PDF: ${err instanceof Error ? err.message : "unknown error"}`);
    }
  }

  // Publish to Nau Mpro App: the congregation sees this order and its songs under "Today's service".
  // Only what is published is public; the program itself stays in this browser.
  const [publishing, setPublishing] = useState(false);
  async function publishToReader() {
    if (!userId) { setStatus("Sign in to publish the order of worship to the Nau Mpro App."); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date)) { setStatus("Set the service date first."); return; }
    setPublishing(true);
    const title = d.coverKind.toLowerCase().replace(/\b\p{L}/gu, (c) => c.toUpperCase());
    const dateLabel = new Date(`${d.date}T12:00:00`).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
    const err = await publishService({ ownerId: userId, churchId: saveChurchId(), serviceDate: d.date, title, dateLabel, lines: orderLines, passages: passageText });
    setPublishing(false);
    setStatus(err ? `Could not publish: ${err}` : `Published. The Nau Mpro App now shows this order for ${dateLabel}. Publish again after changes.`);
  }

  return (
    <>
      <NavBar />
    <div className="pg">
      <div className="pg-top">
        <div>
          <h1>Service program</h1>
        </div>
        <div className="pg-actions">
          <button className="pg-btn link" onClick={printBrochure} title="Opens the brochure PDF in a new tab, ready to print">Print</button>
          {/* With the program bar, Publish sits next to New program; signed out (no bar) it stays here */}
          {!shared.active && <button className="pg-btn link" onClick={publishToReader} disabled={publishing} title="Shows this order of worship and its songs at the top of the Nau Mpro App">{publishing ? "Publishing…" : "Publish to Nau Mpro App"}</button>}
          <button className="pg-btn primary" onClick={generatePdf}>Download PDF</button>
        </div>
      </div>

      {shared.active && (
        <ProgramBar state={shared.state} message={shared.message} list={shared.list} current={shared.current} published={shared.published}
          notice={shared.notice} me={shared.me}
          onOpen={(p) => void shared.open(p)}
          onNew={async (from) => { const made = await shared.startNew(from, blankFor); if (made) setStatus(from === "copy" ? `New program for ${new Date(made.date + "T12:00").toLocaleDateString(undefined, { month: "long", day: "numeric" })}, copied from the last one.` : `Blank program for ${new Date(made.date + "T12:00").toLocaleDateString(undefined, { month: "long", day: "numeric" })}.`); }}
          onTheirs={() => void shared.showTheirs()} onMine={() => void shared.keepMine()}
          onPublish={() => void publishToReader()} publishing={publishing} />
      )}

      <section className="pg-ordersec" aria-labelledby="pg-order-h">
        <div className="pg-ordersec-head">
          <h2 id="pg-order-h">Order of worship</h2>
          <p>Songs, passages and readings come from your saved lists, and names from Saved people. The brochure below shows it as it prints.</p>
        </div>
        <OrderTable
          lines={orderLines}
          setLines={setOrderLines}
          songOptions={songOptions}
          passageOptions={passageOptions}
          readingOptions={readingOptions}
          personOptions={people.map((p) => ({ value: capitaliseName(p.name), date: p.created }))}
        />
      </section>

      <datalist id="pg-people">{people.map((p) => <option key={p.id} value={capitaliseName(p.name)} />)}</datalist>
      {/* Suggestions for the Order of Worship: saved songs, passages (their text fills Today's Scripture and the cover) and names */}


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
          <div className="pg-scripture pg-cover-verse">
            <p className="pg-eyebrow">TODAY’S SCRIPTURE</p>
            <p className="pg-h3 pg-follow">{today.ref || d.verseRef}</p>
            <p className="pg-body pg-follow-text">{today.text || d.verse}</p>
            {today.cite && <p className="pg-eyebrow">{today.cite}</p>}
            {today.reader && <p className="pg-body">Read by {today.reader}</p>}
          </div>
          <div className="pg-place pg-place-bottom">
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
          {/* The order as it prints; it is edited in the table above the brochure */}
          <div className="pg-printorder" aria-label="Order of worship as printed">
            {printedOrder.length ? STAGES.map((stage, si) => {
              const items = printedOrder.filter((r) => r.stage === si);
              return items.length ? (
                <div key={stage} className="pg-po-stage">
                  <p className="pg-po-stagename"><span aria-hidden="true">• • •</span> {stage}</p>
                  {items.map((r) => (
                    <div key={r.id} className="pg-po-row">
                      <p className="pg-po-item">{r.item}</p>
                      {(r.lines ?? []).map((ln, k) => <p key={k} className="pg-po-line" style={{ paddingLeft: `${0.45 + (Math.max(1, ln.level) - 1) * 0.22}in` }}>{printCase(ln.text)}</p>)}
                    </div>
                  ))}
                </div>
              ) : null;
            }) : <p className="pg-po-empty">Add items in the Order of worship table above.</p>}
          </div>
          <textarea className="pg-in pg-muted pg-note" value={d.orderNote} onChange={(e) => set("orderNote", e.target.value)} aria-label="Note under the order" />
          <div className="pg-scripture">
            <p className="pg-eyebrow">TODAY’S SCRIPTURE</p>
            <p className="pg-h3 pg-follow">{today.ref || "No scripture yet"}</p>
            <p className="pg-body pg-follow-text">{today.text}</p>
            <p className="pg-eyebrow">{today.cite}</p>
            {today.reader && <p className="pg-body">Read by {today.reader}</p>}
            <p className="pg-hint">Taken from the Scripture Reading item in the order of worship.</p>
          </div>
        </section>

        <section className="pg-panel pg-info">
          <p className="pg-eyebrow"><input className="pg-in" value={d.worshipTitle} onChange={(e) => set("worshipTitle", e.target.value)} aria-label="Worship heading" /></p>
          <h2 className="pg-h2"><input className="pg-in" value={d.visitTitle} onChange={(e) => set("visitTitle", e.target.value)} aria-label="For your visit heading" /></h2>
          <div className="pg-announce">
            <p className="pg-eyebrow"><input className="pg-in" value={d.announcementsTitle} onChange={(e) => set("announcementsTitle", e.target.value)} aria-label="Announcements heading" /></p>
            {d.announcements.map((a, i) => (
              <div className="pg-list-row" key={i}>
                <input className="pg-in pg-body" value={a} placeholder={`Announcement ${i + 1}`} onChange={(e) => setList("announcements", i, e.target.value)} aria-label={`Announcement ${i + 1}`} />
                <button className="pg-x" onClick={() => removeFromList("announcements", i)} aria-label={`Remove announcement ${i + 1}`}>×</button>
              </div>
            ))}
            <button className="pg-btn small pg-add" onClick={() => addToList("announcements")}>+ Add announcement</button>
          </div>
          {d.prayerGroups.map((g, gi) => (
            <div className="pg-prayer" key={gi}>
              <div className="pg-group-head">
                <p className="pg-eyebrow"><input className="pg-in" value={g.title} placeholder="Category heading" onChange={(e) => setGroupTitle(gi, e.target.value)} aria-label={`Category heading ${gi + 1}`} /></p>
                <button className="pg-x" onClick={() => removeGroup(gi)} aria-label={`Remove category ${gi + 1}`}>×</button>
              </div>
              <ol className="pg-prayer-list">
                {g.items.map((p, i) => (
                  <li key={i} className="pg-list-row">
                    <input className="pg-in pg-body" value={p} onChange={(e) => setGroupItem(gi, i, e.target.value)} aria-label={`Category ${gi + 1}, item ${i + 1}`} />
                    <button className="pg-x" onClick={() => removeGroupItem(gi, i)} aria-label={`Remove category ${gi + 1}, item ${i + 1}`}>×</button>
                  </li>
                ))}
              </ol>
              <button className="pg-btn small pg-add" onClick={() => addGroupItem(gi)}>+ Add item</button>
            </div>
          ))}
          <button className="pg-btn small pg-add" onClick={addGroup}>+ Add category</button>
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
        <p>Saved in the database, so everyone who uses the app sees the same names. You need to be signed in to add or remove a name.</p>
        <div className="pg-people-add">
          <input className="pg-field" value={newPerson} onChange={(e) => setNewPerson(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addPerson(); }} placeholder="Add a name" aria-label="Add a person" />
          <button className="pg-btn" onClick={addPerson} disabled={!newPerson.trim()}>Add</button>
        </div>
        <ul className="pg-people-list">
          {people.map((p) => (
            <li key={p.id}>{capitaliseName(p.name)}{userId && canEdit({ owner: p.owner, church: p.church }) && <button className="pg-x" onClick={() => removePerson(p.id)} aria-label={`Remove ${p.name}`}>×</button>}</li>
          ))}
          {!people.length && <li className="pg-muted">No saved people yet.</li>}
        </ul>
      </section>
      <p className="pg-note-line">Projected slides still show the full lyrics. The brochure prints titles, numbers, references, passage text and names.</p>
    </div>
    </>
  );
}
