import { useState } from "react";
import { MAX_BODY, MAX_NAME, sendPrayerRequest } from "../lib/prayer";
import type { ReaderChurch } from "../lib/publishedService";

// Nau Mpro, Prayer tab: "Ask the church to pray". Anyone can send, without signing in, to the church chosen on this
// phone (or the church in the QR code they scanned). Name is optional; "Only the pastors" keeps it to the church's admins.
export default function PrayerForm({ church, onDone, onChooseChurch }: {
  church: ReaderChurch | null;
  onDone: () => void;
  onChooseChurch: () => void;
}) {
  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [pastors, setPastors] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState<null | { pastors: boolean }>(null);

  async function send() {
    if (!church || !body.trim() || sending) return;
    setSending(true); setError("");
    const err = await sendPrayerRequest(church.id, name, body, pastors);
    setSending(false);
    if (err) { setError(err); return; }
    setSent({ pastors });
    setName(""); setBody(""); setPastors(false);
  }

  const left = MAX_BODY - body.length;
  return (
    <section className="nm-pray" aria-labelledby="nm-pray-h">
      <h2 id="nm-pray-h">{sent ? "Thank you" : "Ask the church to pray"}</h2>

      {sent ? (
        <div className="nm-pray-thanks" role="status">
          <span className="nm-pray-ok" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5" /></svg></span>
          <p>{sent.pastors
            ? <>Your request was sent to the pastors of <b>{church?.name}</b> only. They will pray for you this week.</>
            : <>Your request was sent to <b>{church?.name}</b>. The church will pray for you this week.</>}</p>
          <div className="nm-actions">
            <button className="nm-go" onClick={() => { setSent(null); onDone(); }}>Done</button>
            <button className="nm-alt" onClick={() => setSent(null)}>Send another</button>
          </div>
        </div>
      ) : !church ? (
        <div className="nm-pray-body">
          <p className="nm-pray-lead">Choose your church first, so your request reaches the right pastors.</p>
          <div className="nm-actions"><button className="nm-go" onClick={onChooseChurch}>Choose your church</button></div>
        </div>
      ) : (
        <form className="nm-pray-body" onSubmit={(e) => { e.preventDefault(); void send(); }}>
          <p className="nm-pray-lead">Your church family will pray for you this week.</p>
          <label className="nm-pray-f">
            <span>Your name</span>
            <input value={name} maxLength={MAX_NAME} autoComplete="name" placeholder="Optional" onChange={(e) => setName(e.target.value)} />
            <small>Leave it empty to stay anonymous.</small>
          </label>
          <label className="nm-pray-f">
            <span>What can we pray for?</span>
            <textarea value={body} maxLength={MAX_BODY} rows={5} placeholder="Write in Bunong, Vietnamese or English" onChange={(e) => setBody(e.target.value)} />
            {left < 150 && <small>{left} characters left</small>}
          </label>
          <label className="nm-pray-check">
            <input type="checkbox" checked={pastors} onChange={(e) => setPastors(e.target.checked)} />
            <span><b>Only the pastors</b><span>Your request goes to the pastors and no one else.</span></span>
          </label>
          <p className="nm-pray-to">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v4M10 5h4M6 21V11l6-4 6 4v10M10 21v-5h4v5" /></svg>
            <span>Sending to <b>{church.name}</b></span>
          </p>
          {error && <p className="nm-pray-err" role="alert">{error}</p>}
          <button type="submit" className="nm-pray-send" disabled={!body.trim() || sending}>{sending ? "Sending…" : "Send prayer request"}</button>
        </form>
      )}
    </section>
  );
}
