// Who can see a presentation or Scripture study, always shown beside its title (supabase/plans-only-me.sql).
// The person who made it gets a two-part switch (Team | Only me); everyone else sees a plain label.
// Approved sample: bible-pwa/sample/only-me.html

const TeamIcon = () => <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3.5" /><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M17 11a3 3 0 1 0 0-6M21 20c0-2.6-1.6-4.8-4-5.6" /></svg>;
const LockIcon = () => <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>;

export default function VisSwitch({ isPrivate, canChange, onChange, what, busy = false }: {
  isPrivate: boolean; canChange: boolean; onChange: (on: boolean) => void; what: string; busy?: boolean;
}) {
  if (!canChange) {
    return isPrivate
      ? <span className="vis-label me"><LockIcon />Only me</span>
      : <span className="vis-label"><TeamIcon />Team</span>;
  }
  return (
    <span className="vis" role="radiogroup" aria-label={`Who can see ${what}`}>
      <button type="button" role="radio" className="team" aria-checked={!isPrivate} disabled={busy} onClick={() => { if (isPrivate) onChange(false); }}><TeamIcon />Team</button>
      <button type="button" role="radio" className="me" aria-checked={isPrivate} disabled={busy} onClick={() => { if (!isPrivate) onChange(true); }}><LockIcon />Only me</button>
    </span>
  );
}
