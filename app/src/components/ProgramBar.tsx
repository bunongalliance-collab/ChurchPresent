import { useEffect, useState } from "react";
import type { ProgramInfo, SaveState } from "../lib/programs";

// The bar above the brochure on the Program page: which Sunday's program is open, whether it is saved,
// and New program (copy the last one, or blank). Shared with the church team (lib/programs.ts).

interface Props {
  state: SaveState; message: string; list: ProgramInfo[]; current: ProgramInfo | null; published: Set<string>;
  notice: ProgramInfo | null; me: string | null;
  onOpen: (p: ProgramInfo) => void; onNew: (from: "copy" | "blank") => void;
  onTheirs: () => void; onMine: () => void;
  onPublish: () => void; publishing: boolean;
}

const short = (iso: string) => new Date(iso + "T12:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
const who = (email: string) => email.split("@")[0] || "someone";
function ago(iso: string) {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  const d = Math.round(s / 86400);
  return d === 1 ? "yesterday" : `${d} days ago`;
}
const Chevron = ({ d }: { d: string }) => <svg viewBox="0 0 24 24" aria-hidden="true"><path d={d} /></svg>;

export default function ProgramBar(p: Props) {
  const [menu, setMenu] = useState<"" | "list" | "new">("");
  const [, tick] = useState(0);
  useEffect(() => { const t = window.setInterval(() => tick((n) => n + 1), 30000); return () => window.clearInterval(t); }, []);   // keep "2 min ago" fresh
  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !(e.target as Element).closest(".pgb")) setMenu("");
    };
    document.addEventListener("click", close);
    document.addEventListener("keydown", close);
    return () => { document.removeEventListener("click", close); document.removeEventListener("keydown", close); };
  }, [menu]);

  const i = p.current ? p.list.findIndex((x) => x.id === p.current!.id) : -1;
  const today = new Date().toISOString().slice(0, 10);
  const coming = p.list.filter((x) => x.date >= today);
  const past = p.list.filter((x) => x.date < today).reverse();
  const tag = (x: ProgramInfo) => p.published.has(x.date) ? <span className="pgb-tag pub">Published</span> : <span className="pgb-tag">Draft</span>;
  const row = (x: ProgramInfo) => (
    <button key={x.id} role="menuitemradio" aria-checked={x.id === p.current?.id} onClick={() => { setMenu(""); p.onOpen(x); }}>
      <span className="pgb-d">{short(x.date)}</span><span className="pgb-t">{x.title}</span>{tag(x)}
    </button>
  );
  const status =
    p.state === "loading" ? "Opening the team's program…"
    : p.state === "saving" ? "Saving…"
    : p.state === "offline" ? "Offline. Changes are kept on this computer and saved when you're back online."
    : p.state === "error" ? `Not saved: ${p.message}`
    : p.current ? <>Saved · last changed by <b>{p.current.by === p.me ? "you" : who(p.current.byEmail)}</b>, {ago(p.current.updated)}</> : "";

  return (
    <>
      <div className="pgb" role="region" aria-label="Which program">
        <div className="pgb-pick">
          <button className="pgb-arrow" aria-label="Previous program" disabled={i <= 0} onClick={() => p.onOpen(p.list[i - 1])}><Chevron d="M15 5l-7 7 7 7" /></button>
          <button className="pgb-cur" aria-haspopup="menu" aria-expanded={menu === "list"} disabled={!p.current} onClick={() => setMenu(menu === "list" ? "" : "list")}>
            {p.current ? <><span>{short(p.current.date)}</span><small>{p.current.title}</small>{tag(p.current)}</> : <span>…</span>}
            <Chevron d="M7 10l5 5 5-5" />
          </button>
          <button className="pgb-arrow" aria-label="Next program" disabled={i < 0 || i >= p.list.length - 1} onClick={() => p.onOpen(p.list[i + 1])}><Chevron d="M9 5l7 7-7 7" /></button>
        </div>
        <span className={`pgb-saved${p.state === "error" ? " err" : ""}`} role="status">{status}</span>
        <button className="pgb-new" aria-haspopup="menu" aria-expanded={menu === "new"} disabled={!p.current} onClick={() => setMenu(menu === "new" ? "" : "new")}>New program</button>
        <button className="pgb-pub" onClick={p.onPublish} disabled={p.publishing || !p.current} title="Shows this order of worship and its songs at the top of the Nau Mpro App">{p.publishing ? "Publishing…" : "Publish to Nau Mpro App"}</button>
        {menu === "list" && (
          <div className="pgb-menu" role="menu">
            {coming.length > 0 && <small>Coming up</small>}{coming.map(row)}
            {past.length > 0 && <small>Past</small>}{past.map(row)}
          </div>
        )}
        {menu === "new" && (
          <div className="pgb-menu pgb-newmenu" role="menu">
            <button role="menuitem" onClick={() => { setMenu(""); p.onNew("copy"); }}><b>Copy the last program</b><span>Same order, then change the songs and passage</span></button>
            <button role="menuitem" onClick={() => { setMenu(""); p.onNew("blank"); }}><b>Start blank</b><span>The usual order of worship, nothing filled in</span></button>
          </div>
        )}
      </div>
      {p.notice && (
        <div className="pgb-notice" role="alert">
          <span><b>{who(p.notice.byEmail)}</b> changed this program {ago(p.notice.updated)}.</span>
          <button className="pri" onClick={p.onTheirs}>Show their changes</button>
          <button onClick={p.onMine}>Keep mine</button>
        </div>
      )}
    </>
  );
}
