// What a signed-in person sees and may do with studies, presentations and programs. The database enforces who can read
// and delete (supabase/privacy-fixes.sql); these keep the pages in step with it.
import { useEffect, useRef } from "react";

// Lists show the chosen church's work, plus your own that belongs to no church
export const shownInChurch = (church: string | null | undefined, current: string | null | undefined) => !church || !current || church === current;

// Delete: the person who made it, or an admin of its church
export const mayDeleteWork = (row: { owner?: string | null; church?: string | null }, uid: string | null | undefined, adminOf: string[]) =>
  !!uid && (row.owner === uid || (!!row.church && adminOf.includes(row.church)));

// The open item is someone else's and a fresh list no longer holds it (made Only me, deleted, or you left the team).
// Your own is never closed: it may still be waiting to upload.
export const lostAccess = (openId: string, openOwner: string, uid: string, listed: string[]) => !!openId && openOwner !== uid && !listed.includes(openId);

export const GONE_NOTE = (what: string) => `That ${what} is no longer shared with you, so it was closed here.`;

// Run again when the page comes back into view, and every 30 seconds while it is showing
export function useRecheck(run: () => void, on: boolean) {
  const latest = useRef(run);
  latest.current = run;
  useEffect(() => {
    if (!on) return;
    const go = () => { if (document.visibilityState === "visible") latest.current(); };
    document.addEventListener("visibilitychange", go);
    window.addEventListener("focus", go);
    const t = window.setInterval(go, 30000);
    return () => { document.removeEventListener("visibilitychange", go); window.removeEventListener("focus", go); window.clearInterval(t); };
  }, [on]);
}
