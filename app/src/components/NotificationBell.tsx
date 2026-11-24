import { useEffect, useRef, useState } from "react";
import { useNotifications, who, roleWord, sunday, type Note } from "../lib/notifications";
import { acceptRequest, declineRequest, reloadChurches, respondOwnership } from "../lib/church";
import { toast } from "../lib/toast";

// The bell in the navbar and its list (approved sample: bible-pwa/sample/notifications.html), plus the welcome banner
// shown under the navbar to someone who was just added to a church.

function ago(iso: string) {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "Just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  const d = Math.round(s / 86400);
  return d === 1 ? "Yesterday" : d < 30 ? `${d} days ago` : new Date(iso).toLocaleDateString();
}

const ICON: Record<Note["kind"], string> = {
  join_request: "M9 11.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M19 8v6M16 11h6",
  added: "M20 6 9 17l-5-5",
  role: "M12 3l2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.3 6.8 19l1-5.8L3.6 9.1l5.8-.8z",
  removed: "M6 6l12 12M18 6 6 18",
  church_waiting: "M12 2v6M9 5h6M5 22V12l7-4 7 4v10M9 22v-5h6v5",
  program_new: "M7 3h10v18H7zM10 8h4M10 12h4M10 16h2",
  published: "M4 12l5 5L20 6M4 20h16",
  republish: "M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7",
  library_changed: "M9 18V5l12-2v13M9 18a3 3 0 1 1-3-3 3 3 0 0 1 3 3ZM21 16a3 3 0 1 1-3-3 3 3 0 0 1 3 3Z",
  ownership_offer: "M7 14a5 5 0 1 1 3.5-8.6L21 16v4h-4v-2h-2v-2h-2l-1.4-1.4A5 5 0 0 1 7 14Z",
  ownership_answer: "M7 14a5 5 0 1 1 3.5-8.6L21 16v4h-4v-2h-2v-2h-2l-1.4-1.4A5 5 0 0 1 7 14Z",
};

function Message({ n }: { n: Note }) {
  const church = <b>{n.data.church_name || "your church"}</b>;
  switch (n.kind) {
    case "join_request": return <><b>{who(n.data.email ?? n.actor_email)}</b> wants to join {church}.</>;
    case "added": return n.actor_email ? <><b>{n.actor_email}</b> added you to {church} as <b>{roleWord(n.data.role)}</b>.</> : <>You were added to {church} as <b>{roleWord(n.data.role)}</b>.</>;
    case "role": return <><b>{who(n.actor_email)}</b> made you <b>{roleWord(n.data.role)}</b> of {church}.</>;
    case "removed": return <><b>{who(n.actor_email)}</b> removed you from {church}. You can still read and present.</>;
    case "church_waiting": return <>A new church, {church}, is waiting to be accepted.</>;
    case "program_new": return <><b>{who(n.actor_email)}</b> started the program for <b>{sunday(n.data.service_date)}</b>.</>;
    case "published": return <><b>{who(n.actor_email)}</b> published the program for <b>{sunday(n.data.service_date)}</b> to the Nau Mpro App.</>;
    case "republish": return <>The program for <b>{sunday(n.data.service_date)}</b> changed after it was published. Publish again so the congregation sees the latest order.</>;
    case "ownership_offer": return <><b>{who(n.actor_email)}</b> offered you ownership of {church}. If you accept, you own it and nobody else can remove you.</>;
    case "ownership_answer": return n.data.accepted
      ? <><b>{who(n.actor_email)}</b> accepted ownership of {church}. They own it now.</>
      : <><b>{who(n.actor_email)}</b> declined ownership of {church}. You still own it.</>;
    case "library_changed": return <>{n.data.item_kind === "reading" ? "The reading" : "The song"} <b>“{n.data.item_title || "Untitled"}”</b> was {n.data.change === "delete" ? "deleted" : "edited"} by <b>{who(n.actor_email)}</b>. It’s in the program for <b>{sunday(n.data.service_date)}</b>.</>;
  }
}

export default function NotificationBell() {
  const { notes, unread, markRead, reload } = useNotifications();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : (e.target as Element).isConnected && !root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", close); };
  }, [open]);

  async function answerOwnership(n: Note, accept: boolean) {
    if (!n.church_id) return;
    setBusy(n.id);
    const { error } = await respondOwnership(n.church_id, accept);
    setBusy(null);
    if (error) toast(/no longer waiting/i.test(error) ? "That offer is no longer waiting. The owner may have cancelled it." : "That didn't work. Check the connection and try again.", true);
    else toast(accept ? `You now own ${n.data.church_name}.` : "Declined. They've been told.");
    await reload();
    void reloadChurches();
  }

  async function answer(n: Note, accept: boolean) {
    if (!n.church_id || !n.data.request_user_id) return;
    setBusy(n.id);
    const { error } = accept ? await acceptRequest(n.church_id, n.data.request_user_id, "editor") : await declineRequest(n.church_id, n.data.request_user_id);
    setBusy(null);
    if (error) toast(/no longer waiting/i.test(error) ? "That request was already answered." : "That didn't work. Check the connection and try again.", true);
    else toast(accept ? `${n.data.email} is now an editor. They've been told.` : `Declined. ${n.data.email} can still read and present.`);
    await reload();
    void reloadChurches();
  }

  return (
    <div className="nb" ref={root}>
      <button type="button" className="nb-bell" aria-haspopup="dialog" aria-expanded={open} aria-label={`Notifications${unread ? `, ${unread} new` : ""}`} onClick={() => setOpen((v) => !v)}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>
        {unread > 0 && <span className="nb-n" aria-hidden="true">{unread > 9 ? "9+" : unread}</span>}
      </button>
      {open && (
        <div className="nb-panel" role="dialog" aria-label="Notifications">
          <div className="nb-head">
            <h2>Notifications</h2>
            {unread > 0 && <button type="button" className="nb-link" onClick={() => void markRead(notes.filter((n) => !n.read_at).map((n) => n.id))}>Mark all as read</button>}
          </div>
          <div className="nb-list">
            {notes.length === 0 && <p className="nb-empty">Nothing new. You’ll see join requests and team changes here.</p>}
            {notes.map((n) => {
              const waiting = (n.kind === "join_request" || n.kind === "ownership_offer") && !n.data.resolved;
              return (
                <div key={n.id} className={`nb-item${n.read_at ? "" : " unread"}`} onClick={() => { if (!n.read_at && !waiting) void markRead([n.id]); }}>
                  <span className="nb-ic" aria-hidden="true"><svg viewBox="0 0 24 24"><path d={ICON[n.kind]} /></svg></span>
                  <div className="nb-txt">
                    <p><Message n={n} /></p>
                    <small>{ago(n.created_at)}</small>
                    {waiting && n.kind === "ownership_offer" && (
                      <div className="nb-acts">
                        <button type="button" className="pri" disabled={busy === n.id} onClick={() => void answerOwnership(n, true)}>Accept ownership</button>
                        <button type="button" disabled={busy === n.id} onClick={() => void answerOwnership(n, false)}>Decline</button>
                      </div>
                    )}
                    {n.kind === "ownership_offer" && n.data.resolved && (
                      <p className="nb-done">{n.data.resolved === "accepted" ? "✓ You accepted. You own it now." : n.data.resolved === "declined" ? "You declined." : "The offer was withdrawn."}</p>
                    )}
                    {waiting && n.kind === "join_request" && (
                      <div className="nb-acts">
                        <button type="button" className="pri" disabled={busy === n.id} onClick={() => void answer(n, true)}>Make editor</button>
                        <button type="button" disabled={busy === n.id} onClick={() => void answer(n, false)}>Decline</button>
                      </div>
                    )}
                    {n.kind === "join_request" && n.data.resolved && (
                      <p className="nb-done">{n.data.resolved === "accepted" ? `✓ Accepted${n.data.resolved_by ? ` by ${n.data.resolved_by}` : ""}.` : n.data.resolved === "declined" ? `Declined${n.data.resolved_by ? ` by ${n.data.resolved_by}` : ""}.` : "They cancelled the request."}</p>
                    )}
                    {n.kind === "church_waiting" && <a className="nb-link" href="#team" onClick={() => setOpen(false)}>Review on the Team page</a>}
                    {n.kind === "republish" && n.data.resolved === "republished" && <p className="nb-done">✓ Published again.</p>}
                    {(n.kind === "program_new" || n.kind === "published" || n.kind === "library_changed" || (n.kind === "republish" && !n.data.resolved)) && (
                      <a className="nb-link" href="#program" onClick={() => { setOpen(false); if (!n.read_at) void markRead([n.id]); }}>{n.kind === "republish" ? "Open the program to publish" : n.kind === "library_changed" ? "Check the program" : "Open the program"}</a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="nb-foot"><a className="nb-link" href="#team" onClick={() => setOpen(false)}>Open the Team page</a></div>
        </div>
      )}
    </div>
  );
}

// Under the navbar, once: "Welcome to … added you as an editor". Got it marks the notification as read.
export function WelcomeBanner() {
  const { notes, markRead } = useNotifications();
  const n = notes.find((x) => x.kind === "added" && !x.read_at);
  if (!n) return null;
  return (
    <div className="nb-welcome" role="status">
      <span><b>Welcome to {n.data.church_name || "your church"}.</b> {n.actor_email ? `${n.actor_email} added you` : "You were added"} as {roleWord(n.data.role)}. You can now edit the church’s songs, readings and programs.</span>
      <button type="button" onClick={() => void markRead([n.id])}>Got it</button>
    </div>
  );
}
