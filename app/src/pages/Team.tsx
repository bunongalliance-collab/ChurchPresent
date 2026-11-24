import { useCallback, useEffect, useState } from "react";
import NavBar from "../components/NavBar";
import { toast } from "../lib/toast";
import {
  useChurch, reloadChurches, switchChurch, loadTeam, loadWaitingChurches,
  acceptRequest, declineRequest, setRole, removeMember, invite, cancelInvite, renameChurch, renewCode, churchOwnership, offerOwnership, cancelOwnershipOffer, respondOwnership, type Ownership,
  requestJoin, cancelRequest, startChurch, acceptChurch, declineChurch,
  type Member, type JoinRequest, type Invite, type WaitingChurch, type Role,
} from "../lib/church";

// Team: who belongs to the current church and what they may change (supabase/churches.sql).
// Admins accept join requests, invite by email, change roles and the join code. Editors see the list.
// People without a church join one with a code or start a new one.

const when = (iso: string) => {
  const d = Math.round((Date.now() - new Date(iso).getTime()) / 86400000);
  return d <= 0 ? "today" : d === 1 ? "yesterday" : d < 30 ? `${d} days ago` : new Date(iso).toLocaleDateString();
};
const initials = (email: string) => email.split("@")[0].split(/[._-]+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("") || "?";

export default function Team() {
  const ch = useChurch();
  const cur = ch.current;
  return (
    <>
      <NavBar />
      <main className="tm">
        <div className="tm-head">
          <h1>Team</h1>
          {cur && <p className="sub">Who can change <b>{cur.name}</b>'s songs, readings and Sunday slides.</p>}
        </div>
        {!ch.ready ? <p className="empty">Loading…</p>
          : !ch.session ? <p className="empty">Sign in to see your church's team, or to join one.</p>
          : ch.missing ? <p className="empty">The team tables aren't in the database yet. Run supabase/churches.sql in the Supabase SQL editor.</p>
          : (
            <>
              {ch.siteAdmin && <WaitingChurches />}
              {!cur ? <JoinOrStart first />
                : cur.status === "waiting" ? <ChurchWaiting name={cur.name} />
                : <TeamView cid={cur.id} role={cur.role} code={cur.join_code} name={cur.name} />}
              {cur && <details className="tm-more"><summary>Join or start another church</summary><JoinOrStart /></details>}
            </>
          )}
      </main>
    </>
  );
}

function ChurchWaiting({ name }: { name: string }) {
  return (
    <section className="tm-card tm-wait">
      <h2>{name} is waiting to be accepted</h2>
      <p>A site admin checks each new church before it starts. You'll be able to invite your team once it's accepted.</p>
    </section>
  );
}

function JoinOrStart({ first = false }: { first?: boolean }) {
  const ch = useChurch();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  async function join(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { data, error } = await requestJoin(code);
    setBusy(false);
    if (error) { toast(error, true); return; }
    setCode("");
    toast(`Request sent to ${data}. An admin there will accept it.`);
    void reloadChurches();
  }
  async function start(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { data, error } = await startChurch(name);
    if (error) { setBusy(false); toast(error, true); return; }
    await reloadChurches();
    setBusy(false);
    switchChurch(String(data));
    toast(ch.siteAdmin ? `${name.trim()} is ready. You're its admin.` : `${name.trim()} is started and waits to be accepted. You're its admin.`);
    setName("");
  }
  return (
    <section className={`tm-card tm-join${first ? " first" : ""}`}>
      {first && <h2>Which church are you with?</h2>}
      <p className="hint">Your church's admin can give you a join code. Each church has its own team. Anyone can still read songs, readings and the Bible.</p>
      {ch.requests.map((r) => (
        <div className="tm-pending" key={r.church_id}>
          <span>Request sent to <b>{r.name}</b>. You'll be able to edit once an admin accepts it.</span>
          <button className="secondary small" onClick={async () => { const { error } = await cancelRequest(r.church_id); if (error) toast(error, true); void reloadChurches(); }}>Cancel request</button>
        </div>
      ))}
      <form className="tm-row" onSubmit={join}>
        <input id="tm-code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="Join code, e.g. MBAC-4821" aria-label="Join code" required autoComplete="off" />
        <button type="submit" disabled={busy || !code.trim()}>Ask to join</button>
      </form>
      <p className="tm-or">or</p>
      <form className="tm-row" onSubmit={start}>
        <input id="tm-start" value={name} onChange={(e) => setName(e.target.value)} placeholder="Church name" aria-label="New church name" required minLength={2} maxLength={120} autoComplete="off" />
        <button type="submit" className="secondary" disabled={busy || name.trim().length < 2}>Start a new church</button>
      </form>
      <p className="hint">Starting a church makes you its admin. New churches are checked by a site admin before they start.</p>
    </section>
  );
}

function WaitingChurches() {
  const [list, setList] = useState<WaitingChurch[]>([]);
  const load = useCallback(async () => setList(await loadWaitingChurches()), []);
  useEffect(() => { void load(); }, [load]);
  if (!list.length) return null;
  return (
    <section className="tm-card tm-wait" aria-labelledby="tm-wc">
      <h2 id="tm-wc">New churches waiting <span className="tm-n">{list.length}</span></h2>
      {list.map((c) => (
        <div className="tm-req" key={c.id}>
          <div className="tm-who"><b>{c.name}</b><small>Started {when(c.created_at)}</small></div>
          <button className="secondary small" onClick={async () => { const { error } = await declineChurch(c.id); if (error) toast(error, true); else toast(`Declined ${c.name}`); void load(); }}>Decline</button>
          <button className="small" onClick={async () => { const { error } = await acceptChurch(c.id); if (error) toast(error, true); else toast(`${c.name} is accepted`); void load(); void reloadChurches(); }}>Accept</button>
        </div>
      ))}
    </section>
  );
}

function TeamView({ cid, role, code, name }: { cid: string; role: Role; code: string | null; name: string }) {
  const ch = useChurch();
  const me = ch.session?.user.id;
  const admin = role === "admin";
  const [members, setMembers] = useState<Member[]>([]);
  const [requests, setRequests] = useState<JoinRequest[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [own, setOwn] = useState<Ownership>({ owner: null, pending: null, offeredAt: null });   // the owner, and who it's offered to
  const owner = own.owner;
  const [email, setEmail] = useState("");
  const [newRole, setNewRole] = useState<Role>("editor");
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState(name);

  const load = useCallback(async () => {
    const { data, error } = await loadTeam(cid);
    if (error) toast(error, true);
    setOwn(await churchOwnership(cid));
    setMembers(data.members); setRequests(data.requests); setInvites(data.invites); setLoaded(true);
  }, [cid]);
  useEffect(() => { setLoaded(false); setConfirm(null); void load(); }, [load]);
  useEffect(() => { setNewName(name); }, [name]);

  const admins = members.filter((m) => m.role === "admin").length;
  const done = async (p: Promise<{ error: string | null }>, ok: string) => {
    const { error } = await p;
    if (error) toast(error, true); else toast(ok);
    await load();
  };

  return (
    <div className="tm-grid">
      <section className="tm-card" aria-labelledby="tm-team">
        {own.pending && own.pending === me && (
          <div className="tm-asks tm-ownoffer" role="status">
            <h2>{members.find((x) => x.user_id === owner)?.email ?? "The owner"} offered you ownership of {name}</h2>
            <p>If you accept, you own the church: nobody else can remove you, and you can remove anyone, including the current owner.</p>
            <div className="tm-req">
              <button className="small" onClick={async () => {
                const { error } = await respondOwnership(cid, true);
                if (error) toast(error, true); else { toast(`You now own ${name}.`); await load(); void reloadChurches(); }
              }}>Accept ownership</button>
              <button className="secondary small" onClick={async () => {
                const { error } = await respondOwnership(cid, false);
                if (error) toast(error, true); else { toast("Declined. They've been told."); await load(); }
              }}>Decline</button>
            </div>
          </div>
        )}
        {admin && requests.length > 0 && (
          <div className="tm-asks" aria-labelledby="tm-ask">
            <h2 id="tm-ask">Asking to join <span className="tm-n">{requests.length}</span></h2>
            {requests.map((r) => (
              <div className="tm-req" key={r.user_id}>
                <div className="tm-who"><b>{r.email || "No email"}</b><small>Asked {when(r.created_at)}</small></div>
                <button className="secondary small" onClick={() => done(declineRequest(cid, r.user_id), `Declined. ${r.email} can still read and present.`)}>Decline</button>
                <button className="small" onClick={() => done(acceptRequest(cid, r.user_id, "editor"), `${r.email} is now an editor`)}>Make editor</button>
              </div>
            ))}
          </div>
        )}

        {admin && (
          <div className="tm-code">
            <div><b>Join code</b><small>Give it to people from your church. They enter it after signing in, and you accept them here.</small></div>
            <span className="tm-codev">{code}</span>
            <button className="secondary small" onClick={() => { if (code) navigator.clipboard?.writeText(code).then(() => toast("Join code copied"), () => toast("Select the code to copy it")); }}>Copy</button>
            <button className="secondary small" onClick={async () => { const { error } = await renewCode(cid); if (error) toast(error, true); else { toast("New code made. The old one no longer works."); void reloadChurches(); } }}>New code</button>
          </div>
        )}

        <h2 id="tm-team">Team <span className="tm-n">{members.length}</span></h2>
        {!loaded ? <p className="empty">Loading…</p> : (
          <ul className="tm-people">
            {members.map((m) => {
              const you = m.user_id === me;
              const isOwner = m.user_id === owner;
              // The owner's role and place are locked for everyone else; nobody changes or removes themselves here
              const lock = !admin || you || isOwner || (m.role === "admin" && admins === 1);
              const canHandOver = me === owner && !you && m.role === "admin" && own.pending !== m.user_id;
              const offered = own.pending === m.user_id;
              return (
                <li className={`tm-p${you ? " you" : ""}`} key={m.user_id}>
                  <span className="tm-av" aria-hidden="true">{initials(m.email)}</span>
                  <div className="tm-who">
                    <b>{m.email}{isOwner && <span className="tm-owner">Owner</span>}</b>
                    <small>{you ? (isOwner ? "You · started this church" : "You") : isOwner ? "Started this church" : `Added ${when(m.added_at)}`}</small>
                  </div>
                  {admin ? (
                    <select aria-label={`Role for ${m.email}`} value={m.role} disabled={lock}
                      onChange={(e) => done(setRole(cid, m.user_id, e.target.value as Role), `${m.email} is now ${e.target.value === "admin" ? "an admin" : "an editor"}`)}>
                      <option value="editor">Editor</option><option value="admin">Admin</option>
                    </select>
                  ) : <span className={`tm-tag ${m.role}`}>{m.role === "admin" ? "Admin" : "Editor"}</span>}
                  {admin && (
                    <button className="tm-rm" aria-label={`Remove ${m.email}`} disabled={lock} onClick={() => setConfirm(m.user_id)}>
                      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
                    </button>
                  )}
                  {canHandOver && <button className="secondary small tm-handover" onClick={() => setConfirm(`own:${m.user_id}`)}>Offer ownership…</button>}
                  {offered && (
                    <div className="tm-offer">
                      <span>Ownership offered{own.offeredAt ? ` ${when(own.offeredAt)}` : ""}. Waiting for them to accept.</span>
                      {me === owner && <button className="secondary small" onClick={async () => {
                        const { error } = await cancelOwnershipOffer(cid);
                        if (error) toast(error, true); else { toast("Offer cancelled. You still own the church."); await load(); }
                      }}>Cancel offer</button>}
                    </div>
                  )}
                  {confirm === `own:${m.user_id}` && (
                    <div className="tm-confirm tm-confirm-own">
                      <span>Offer {name} to {m.email}? They’ll be asked to accept. Until they do, you stay the owner and can cancel. Once they accept, they own it and can remove you.</span>
                      <button className="secondary small" onClick={() => setConfirm(null)}>Not now</button>
                      <button className="tm-danger small" onClick={async () => {
                        setConfirm(null);
                        const { error } = await offerOwnership(cid, m.user_id);
                        if (error) toast(error, true); else { toast(`Offered to ${m.email}. They’ve been told and need to accept.`); await load(); }
                      }}>Offer ownership</button>
                    </div>
                  )}
                  {confirm === m.user_id && (
                    <div className="tm-confirm">
                      <span>Remove {m.email}? Their songs and readings stay. They just can't edit any more.</span>
                      <button className="secondary small" onClick={() => setConfirm(null)}>Keep</button>
                      <button className="tm-danger small" onClick={() => { setConfirm(null); void done(removeMember(cid, m.user_id), `Removed ${m.email}`); }}>Remove</button>
                    </div>
                  )}
                </li>
              );
            })}
            {invites.map((i) => (
              <li className="tm-p invited" key={i.email}>
                <span className="tm-av" aria-hidden="true">{initials(i.email)}</span>
                <div className="tm-who"><b>{i.email}</b><small>Invited {when(i.created_at)}, hasn't signed in yet · {i.role === "admin" ? "Admin" : "Editor"}</small></div>
                {admin && <button className="secondary small" onClick={() => done(cancelInvite(cid, i.email), `Invite for ${i.email} cancelled`)}>Cancel</button>}
              </li>
            ))}
          </ul>
        )}

        {admin && (
          <>
            <form className="tm-row" onSubmit={(e) => {
              e.preventDefault();
              const em = email.trim().toLowerCase();
              if (members.some((m) => m.email === em)) { toast("That email is already on the team"); return; }
              setEmail("");
              void done(invite(cid, em, newRole), `Invited ${em}. They join when they sign in with that email.`);
            }}>
              <input id="tm-invite" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Add by email, e.g. someone@example.com" aria-label="Email of the person to add" required />
              <select id="tm-invite-role" aria-label="Role" value={newRole} onChange={(e) => setNewRole(e.target.value as Role)}><option value="editor">Editor</option><option value="admin">Admin</option></select>
              <button type="submit">Add</button>
            </form>
            <p className="hint">They join when they sign in with this email. Until then they show as invited.</p>
          </>
        )}
        {!admin && members.length > 0 && (
          <p className="hint">Only this church's admins can add people or change roles.
            {" "}<button className="tm-link" onClick={() => setConfirm("leave")}>Leave {name}</button>
            {confirm === "leave" && <span className="tm-confirm inline"><span>Leave the team? You can ask to join again with the code.</span>
              <button className="secondary small" onClick={() => setConfirm(null)}>Stay</button>
              <button className="tm-danger small" onClick={async () => { const { error } = await removeMember(cid, me ?? ""); if (error) toast(error, true); else { toast(`You left ${name}`); void reloadChurches(); } }}>Leave</button></span>}
          </p>
        )}
      </section>

      <aside className="tm-card tm-roles" aria-labelledby="tm-rh">
        <h2 id="tm-rh">What each role can do</h2>
        {admin && (
          <div className="tm-rename">
            {renaming ? (
              <form className="tm-row" onSubmit={async (e) => { e.preventDefault(); setRenaming(false); const { error } = await renameChurch(cid, newName); if (error) toast(error, true); else { toast("Church renamed"); void reloadChurches(); } }}>
                <input id="tm-rename" value={newName} onChange={(e) => setNewName(e.target.value)} aria-label="Church name" minLength={2} maxLength={120} required />
                <button type="submit" className="small">Save</button>
                <button type="button" className="secondary small" onClick={() => { setRenaming(false); setNewName(name); }}>Cancel</button>
              </form>
            ) : <button className="secondary small" onClick={() => setRenaming(true)}>Rename church</button>}
          </div>
        )}
        <div className="tm-r"><span className="tm-tag admin">Admin</span>
          <ul><li>Everything an editor can do</li><li>Add, remove and change people on this page</li><li>Rename the church and change the join code</li><li>Publish Today's service to the Nau Mpro App</li></ul></div>
        <div className="tm-r"><span className="tm-tag editor">Editor</span>
          <ul><li>Edit the church's songs, readings and programs</li><li>Build Scripture slides and presentations for the team</li></ul></div>
        <div className="tm-r"><span className="tm-tag member">Anyone else</span>
          <ul><li>Read songs, readings and the Bible</li><li>Use the Projector and Present</li><li className="no">Can't change the team's songs or readings</li></ul></div>
        <p className="hint">The <b>owner</b> is the person who started the church. Other admins can’t remove them or change their role; only the owner can offer the church to another admin, who must accept before it changes hands.</p>
        <p className="hint">Roles are per church: someone can be an admin here and an editor elsewhere. A church always keeps at least one admin. The Bunong Bible is shared by every church.</p>
        <p className="hint">Songs and readings belong to a church: anyone can read them, and the church's team edits them. The Nau Mpro hymn book is shared. Programs and presentations move to churches next.</p>
      </aside>
    </div>
  );
}
