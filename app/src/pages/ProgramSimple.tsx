import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import NavBar from "../components/NavBar";
import logo from "../assets/church-logo.png?url";
import { buildProgramPdf } from "../lib/programPdf";
import OrderEditor from "../components/OrderEditor";
import { emptyLines, toRows, type Lines } from "../lib/orderLines";
import { loadDraft, type Draft } from "./Program";

// Simple program builder (#program-simple).
// Item (bold) → sub-item (the song, passage, or text) → nested item (the person responsible).
// Every line prints in the program. Click a line to edit it. Use the ⋯ menu to add or remove.
// Enter adds a line at the same level, Backspace on an empty line removes it. The PDF builder is the same as #program.

const KEY = "programSimpleLines";

export default function ProgramSimple() {
  const [base] = useState<Draft>(() => loadDraft());
  const [lines, setLines] = useState<Lines>(() => {
    try { const saved = JSON.parse(localStorage.getItem(KEY) || "null"); if (saved && typeof saved === "object") return saved as Lines; } catch { /* storage blocked */ }
    return emptyLines();
  });

  // Dropdown options carry a date, so the lists can show the newest first
  const [songs, setSongs] = useState<{ value: string; date: string }[]>([]);
  const [people, setPeople] = useState<{ value: string; date: string }[]>([]);
  const [passages, setPassages] = useState<Record<string, string>>({});
  const [passageOpts, setPassageOpts] = useState<{ value: string; label: string; date: string }[]>([]);
  const [status, setStatus] = useState("Saved in this browser.");

  useEffect(() => {
    if (!supabase) {
      try {
        const ls = JSON.parse(localStorage.getItem("lyricsSongs") || "[]") as { number?: string; title?: string }[];
        setSongs(ls.map((x) => ({ value: (x.number ? `${x.number}. ` : "") + (x.title || ""), date: "" })).filter((o) => o.value));
      } catch { /* storage blocked */ }
      return;
    }
    (async () => {
      const [s, t, p] = await Promise.all([
        supabase.from("lyric_songs").select("song_number, title, updated_at").order("updated_at", { ascending: false }),
        supabase.from("scripture_studies").select("study_title, reference, data, updated_at").order("updated_at", { ascending: false }),
        supabase.from("saved_people").select("name, created_at").order("name"),
      ]);
      if (s.error) setStatus(`Could not load songs: ${s.error.message}`);
      setSongs((s.data ?? []).map((x) => ({ value: (x.song_number ? `${x.song_number}. ` : "") + (x.title || ""), date: x.updated_at ?? "" })).filter((o) => o.value));
      const map: Record<string, string> = {};
      const opts: { value: string; label: string; date: string }[] = [];
      (t.data ?? []).forEach((x) => {
        if (!x.reference) return;
        map[x.reference] = studyPassage(x.data);
        opts.push({ value: x.reference, label: x.study_title ? `${x.study_title} — ${x.reference}` : x.reference, date: x.updated_at ?? "" });
      });
      setPassages(map);
      setPassageOpts(opts);
      setPeople((p.data ?? []).map((x) => ({ value: x.name, date: x.created_at ?? "" })));
    })();
  }, []);

  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(lines)); } catch { /* storage blocked */ } }, [lines]);


  const draft: Draft = useMemo(() => ({ ...base, rows: toRows(lines, passages) }), [base, lines, passages]);
  const coverDate = useMemo(() => {
    try { return new Date(`${base.date}T12:00:00`).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" }).toUpperCase(); } catch { return base.date; }
  }, [base.date]);

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


  // Picking an item adds it with an empty sub-item line under it, and that line opens for typing

  return (
    <>
      <NavBar />
      <div className="ps">
        <div className="ps-top">
          <div>
            <h1>Service program</h1>
            <p>{status} Every line prints in the program. Click a line to edit it.</p>
          </div>
          <div className="ps-actions">
            <a className="ps-link" href="#program">Current editor</a>
            <button className="ps-btn" onClick={printBrochure}>Print</button>
            <button className="ps-btn primary" onClick={generatePdf}>Generate PDF</button>
          </div>
        </div>

        <div className="ps-layout">
          <OrderEditor
            lines={lines}
            setLines={setLines}
            songOptions={songs}
            passageOptions={passageOpts}
            personOptions={people}
          />

          <aside className="ps-side" aria-label="Program preview">
            <div className="ps-side-head">Program preview</div>
            {previewUrl ? <iframe className="ps-frame" src={previewUrl} title="Brochure preview (PDF)" /> : <p className="ps-muted">Making the preview…</p>}
          </aside>
        </div>
      </div>
    </>
  );
}

function studyPassage(data: unknown): string {
  const slides = (data as { slides?: { kind?: string; text?: string }[] } | null)?.slides ?? [];
  return slides.filter((x) => x.kind === "passage" && x.text).map((x) => (x.text ?? "").replace(/\*\*|~~|__|\{#?[^}]*\}|\{\/\}|[\u0001-\u0003]/g, "").trim()).join(" ");
}
