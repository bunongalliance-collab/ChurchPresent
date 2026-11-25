// The scripture reading of the church's published service (the same data as the Nau Mpro App, for the reader's church,
// ./share.ts). Checked again when the reader comes back into view or goes online.
import { useEffect, useState } from "react";
import { loadTodayService, type PublishedService } from "../lib/publishedService";
import type { Book } from "./data";
import { churchDay, readingLabel, serviceScripture, type Found } from "./find";

async function load(churchId: string | null): Promise<{ service: PublishedService | null; today: string }> {
  const today = churchDay();
  const [y, m, d] = today.split("-").map(Number);
  return { service: await loadTodayService(churchId, new Date(y, m - 1, d, 12)), today };
}

export function useServiceScripture(books: Book[], churchId: string | null): { found: Found; label: string } | null {
  const [state, setState] = useState<{ id: string | null; service: PublishedService | null; today: string } | null>(null);
  useEffect(() => {
    let live = true;
    const run = () => { void load(churchId).then((next) => { if (live) setState({ id: churchId, ...next }); }).catch(() => {}); };
    const shown = () => { if (document.visibilityState === "visible") run(); };
    run();
    document.addEventListener("visibilitychange", shown);
    window.addEventListener("online", run);
    return () => { live = false; document.removeEventListener("visibilitychange", shown); window.removeEventListener("online", run); };
  }, [churchId]);
  // Never show another church's reading while the new church's is loading
  const found = serviceScripture(state && state.id === churchId ? state.service : null, books);
  return found ? { found, label: readingLabel(state!.service!.serviceDate, state!.today) } : null;
}
