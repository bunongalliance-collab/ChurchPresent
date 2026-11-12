import { useEffect, useMemo, useRef, useState } from "react";
import NavBar from "../components/NavBar";
import { STYLES, renderTo, extractFromPdf, parseProgram, W, H } from "../lib/thumbnail";
import { todayScripture } from "../lib/programPdf";
import type { Draft } from "./Program";
import { supabase } from "../lib/supabase";

// The scripture for the thumbnail: today's scripture from the program, or a saved scripture study
interface SavedStudy { id: string; label: string; ref: string; text: string }
function studyText(data: unknown): string {
  const slides = (data as { slides?: { kind?: string; text?: string }[] } | null)?.slides ?? [];
  return slides.filter((x) => x.kind === "passage" && x.text).map((x) => (x.text ?? "").replace(/\*\*|~~|__|\{#?[^}]*\}|\{\/\}|[\u0001-\u0003]/g, "").trim()).join(" ");
}
function loadProgramDraft(): Draft | null {
  try { return JSON.parse(localStorage.getItem("serviceProgramDraft5") || "null"); } catch { return null; }
}

// Sermon thumbnail maker: upload the program PDF, the details are read automatically,
// pick a design and a photo, then download the image.

const PDFJS = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
const PDFJS_WORKER = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
const JOHN = "John Bumbre";
const CHURCH = "Montagnard Bunong Alliance Church";

// Load pdf.js once, from cdnjs
function loadPdfJs(): Promise<void> {
  return new Promise((resolve, reject) => {
    if ((window as any).pdfjsLib) { resolve(); return; }
    const s = document.createElement("script");
    s.src = PDFJS;
    s.onload = () => {
      (window as any).pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
      resolve();
    };
    s.onerror = () => reject(new Error("pdf.js could not be loaded"));
    document.head.appendChild(s);
  });
}

// The date for "this Sunday" (today when it is Sunday) or "next Sunday"
function sundayText(weeksAhead: number) {
  const d = new Date();
  d.setDate(d.getDate() + ((7 - d.getDay()) % 7) + weeksAhead * 7);
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

interface Data { title: string; verseText: string; verseRef: string; dateText: string; pastor: string; church: string }
type Colors = { bg: string; text: string; hi: string };

export default function Thumbnail() {
  const [data, setData] = useState<Data>({ title: "", verseText: "", verseRef: "", dateText: sundayText(0), pastor: JOHN, church: CHURCH });
  const [styleKey, setStyleKey] = useState("naturalFade");
  const [colors, setColors] = useState<Colors>({ ...STYLES.naturalFade.colors });
  const [photoMode, setPhotoMode] = useState("");
  const [cinematic, setCinematic] = useState(false);
  const [photo, setPhoto] = useState<HTMLImageElement | null>(null);
  const [pdfName, setPdfName] = useState("");
  const [photoName, setPhotoName] = useState("");
  const [status, setStatus] = useState("Upload a program PDF to start.");
  const [statusError, setStatusError] = useState(false);
  const [dateChoice, setDateChoice] = useState("this");
  const [pastorChoice, setPastorChoice] = useState(JOHN);
  const [programDraft] = useState<Draft | null>(() => loadProgramDraft());
  const [studies, setStudies] = useState<SavedStudy[]>([]);
  const [scripture, setScripture] = useState<string>(() => (loadProgramDraft() ? "program" : "custom"));
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Opening the page fills in today's scripture and its reader from the program
  useEffect(() => {
    if (programDraft) chooseScripture("program");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Saved scripture studies (signed in: the database)
  useEffect(() => {
    if (!supabase) return;
    supabase.from("scripture_studies").select("id, study_title, reference, data").order("updated_at", { ascending: false })
      .then(({ data: rows }) => setStudies((rows ?? []).map((x) => ({
        id: x.id, label: x.reference || x.study_title || "(untitled)", ref: x.reference || x.study_title || "", text: studyText(x.data),
      }))));
  }, []);

  // Choosing a scripture fills in the reference and verse text
  function chooseScripture(value: string) {
    setScripture(value);
    if (value === "custom") return;
    if (value === "program" && programDraft) {
      const t = todayScripture(programDraft);
      // The reader of today's scripture is the name shown as the pastor on the thumbnail
      setData((cur) => ({ ...cur, verseRef: t.ref, verseText: t.text, ...(t.reader ? { pastor: t.reader.split(" ").map((w) => (w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w)).join(" ") } : {}) }));
      if (t.reader) setPastorChoice("custom");
      return;
    }
    const st = studies.find((x) => x.id === value);
    if (st) setData((cur) => ({ ...cur, verseRef: st.ref, verseText: st.text }));
  }
  const miniRefs = useRef<Record<string, HTMLCanvasElement | null>>({});
  const styleKeys = useMemo(() => Object.keys(STYLES), []);
  const effectiveMode = photoMode || STYLES[styleKey].mode;

  // Draw the main preview and the style gallery whenever something changes
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await document.fonts.load("800 40px Montserrat");
        await document.fonts.load('italic 500 40px "Playfair Display"');
        await document.fonts.load('700 40px "Playfair Display"');
      } catch { /* fall back to system fonts */ }
      if (cancelled) return;
      const c = canvasRef.current?.getContext("2d");
      if (c && canvasRef.current) {
        canvasRef.current.width = W; canvasRef.current.height = H;
        renderTo(c, styleKey, W, H, data, colors, effectiveMode, cinematic, photo);
      }
      for (const key of styleKeys) {
        const cv = miniRefs.current[key];
        const mc = cv?.getContext("2d");
        if (cv && mc) renderTo(mc, key, 320, 180, data, STYLES[key].colors, STYLES[key].mode, cinematic, photo);
      }
    })();
    return () => { cancelled = true; };
  }, [data, styleKey, colors, effectiveMode, cinematic, photo, styleKeys]);

  function pickStyle(key: string) {
    setStyleKey(key);
    setColors({ ...STYLES[key].colors });
    setPhotoMode("");
  }

  async function handlePdf(file?: File) {
    if (!file) return;
    setPdfName(file.name);
    setStatus("Reading program…"); setStatusError(false);
    try {
      await loadPdfJs();
      const found = parseProgram(await extractFromPdf(file));
      setData((cur) => ({
        ...cur,
        title: found.title,
        dateText: found.dateText || cur.dateText,
        // The verse from the PDF is used only when no scripture is chosen from the list
        ...(scripture === "custom" ? { verseText: found.verseText, verseRef: found.verseRef } : {}),
      }));
      const missing = (["title", "verseRef", "dateText"] as const).filter((k) => !found[k]);
      setStatus(missing.length ? `Found most details. Please check: ${missing.join(", ")}.` : "Details found. Review them, then pick a style.");
    } catch (err) {
      console.error(err);
      setStatus("Could not read this PDF. If it is a scanned image, type the details below.");
      setStatusError(true);
    }
  }

  function handlePhoto(file?: File) {
    if (!file) return;
    setPhotoName(file.name);
    const img = new Image();
    img.onload = () => setPhoto(img);
    img.onerror = () => { setStatus("That image could not be opened."); setStatusError(true); };
    img.src = URL.createObjectURL(file);
  }

  function download(type: "image/jpeg" | "image/png") {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ext = type === "image/png" ? "png" : "jpg";
    const name = (data.title.trim() || "sermon").slice(0, 40).replace(/[^\w]+/g, "-").replace(/^-|-$/g, "");
    canvas.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `thumbnail-${name}.${ext}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }, type, 0.92);
  }

  const setField = (k: keyof Data) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setData((cur) => ({ ...cur, [k]: e.target.value }));

  return (
    <>
      <NavBar />
    <div className="th">
      <h1>Sermon thumbnail</h1>
      <p className="th-sub">Upload the program PDF. The title, verse and date are read automatically. Pick a design, add the pastor’s photo, and download.</p>

      <div className="th-grid">
        <section className="th-card">
          <h2>1. Program PDF</h2>
          <label className="th-drop" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); handlePdf(e.dataTransfer.files[0]); }}>
            <strong>Drop the program PDF here</strong>
            <small>or click to choose a file</small>
            <input type="file" accept="application/pdf" onChange={(e) => handlePdf(e.target.files?.[0])} />
          </label>
          {pdfName && <div className="th-file">{pdfName}</div>}

          <h2>2. Pastor photo</h2>
          <label className="th-drop" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); handlePhoto(e.dataTransfer.files[0]); }}>
            <strong>Drop a photo here</strong>
            <small>JPG or PNG, face centered works best</small>
            <input type="file" accept="image/*" onChange={(e) => handlePhoto(e.target.files?.[0])} />
          </label>
          {photoName && <div className="th-file">{photoName}</div>}

          <h2>3. Design</h2>
          <label>Style</label>
          <select className="th-field" value={styleKey} onChange={(e) => pickStyle(e.target.value)}>
            {styleKeys.map((k) => <option key={k} value={k}>{STYLES[k].label}</option>)}
          </select>
          <label>Photo effect</label>
          <select className="th-field" value={photoMode} onChange={(e) => setPhotoMode(e.target.value)}>
            <option value="">Style default</option>
            <option value="circle">Circle with ring</option>
            <option value="arch">Arch window</option>
            <option value="rect">Plain rectangle</option>
            <option value="duotone">Navy duotone, fade bottom</option>
            <option value="fade-left">Fade into background (left edge)</option>
            <option value="fade-bottom">Fade into background (bottom)</option>
            <option value="fade-edges">Soft fade on all edges</option>
          </select>
          <label className="th-check"><input type="checkbox" checked={cinematic} onChange={(e) => setCinematic(e.target.checked)} /> Cinematic look (grade, vignette, grain, bars)</label>

          <details>
            <summary>Colors</summary>
            <div className="th-colors">
              <label>Background <input type="color" value={colors.bg} onChange={(e) => setColors({ ...colors, bg: e.target.value })} /></label>
              <label>Text <input type="color" value={colors.text} onChange={(e) => setColors({ ...colors, text: e.target.value })} /></label>
              <label>Highlight <input type="color" value={colors.hi} onChange={(e) => setColors({ ...colors, hi: e.target.value })} /></label>
            </div>
          </details>

          <h2>4. Details</h2>
          <label>Sermon title</label>
          <textarea className="th-field" rows={2} value={data.title} onChange={setField("title")} />
          <label>Scripture</label>
          <select className="th-field" value={scripture} onChange={(e) => chooseScripture(e.target.value)}>
            {programDraft && <option value="program">Today’s scripture (from the program)</option>}
            {studies.length > 0 && <optgroup label="Saved scriptures">
              {studies.map((st) => <option key={st.id} value={st.id}>{st.label}</option>)}
            </optgroup>}
            <option value="custom">Type or read from the PDF</option>
          </select>
          <label>Verse text</label>
          <textarea className="th-field" rows={3} value={data.verseText} onChange={setField("verseText")} />
          <label>Verse reference</label>
          <input className="th-field" value={data.verseRef} placeholder="John 3:16" onChange={setField("verseRef")} />
          <label>Service date</label>
          <select className="th-field" value={dateChoice} onChange={(e) => {
            setDateChoice(e.target.value);
            if (e.target.value === "this") setData((cur) => ({ ...cur, dateText: sundayText(0) }));
            if (e.target.value === "next") setData((cur) => ({ ...cur, dateText: sundayText(1) }));
          }}>
            <option value="this">This Sunday ({sundayText(0).replace(/^\w+, /, "").replace(/, \d{4}$/, "")})</option>
            <option value="next">Next Sunday ({sundayText(1).replace(/^\w+, /, "").replace(/, \d{4}$/, "")})</option>
            <option value="custom">Custom (type below)</option>
          </select>
          <label>Date</label>
          <input className="th-field" value={data.dateText} placeholder="Sunday, November 9, 2026" onChange={(e) => { setDateChoice("custom"); setData((cur) => ({ ...cur, dateText: e.target.value })); }} />
          <label>Pastor</label>
          <select className="th-field" value={pastorChoice} onChange={(e) => {
            setPastorChoice(e.target.value);
            if (e.target.value !== "custom") setData((cur) => ({ ...cur, pastor: e.target.value }));
          }}>
            <option value={JOHN}>{JOHN}</option>
            <option value="custom">Custom (type below)</option>
          </select>
          <label>Pastor name</label>
          <input className="th-field" value={data.pastor} placeholder="Pastor name" onChange={(e) => { setPastorChoice("custom"); setField("pastor")(e); }} />
          <label>Church name (optional)</label>
          <input className="th-field" value={data.church} placeholder="Church name" onChange={setField("church")} />
        </section>

        <section className="th-card th-preview">
          <h2>Preview (1280 × 720)</h2>
          <canvas className="th-main" ref={canvasRef} width={W} height={H} />
          <div className={statusError ? "th-status error" : "th-status"} role="status">{status}</div>
          <div className="th-btns">
            <button className="th-btn" onClick={() => download("image/jpeg")}>Download JPG</button>
            <button className="th-btn secondary" onClick={() => download("image/png")}>Download PNG</button>
          </div>
          <div className="th-gallery-label">Compare styles (uses your current text and photo)</div>
          <div className="th-gallery">
            {styleKeys.map((k) => (
              <button key={k} className={`th-mini${k === styleKey ? " active" : ""}`} onClick={() => pickStyle(k)}>
                <canvas ref={(el) => { miniRefs.current[k] = el; }} width={320} height={180} />
                {STYLES[k].label}
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
    </>
  );
}
