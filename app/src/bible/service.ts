// The scripture reading of the church's published service (the same data as the Nau Mpro App, for the church chosen
// there; with only one church, that one). Checked again when the reader comes back into view or goes online.
import { useEffect, useState } from "react";
import { loadChurchList, loadTodayService, readerChurch, type PublishedService } from "../lib/publishedService";
import type { Book } from "./data";
import { churchDay, readingLabel, serviceScripture, type Found } from "./find";

async function load(): Promise<{ service: PublishedService | null; today: string }> {
  const today = churchDay();
  const chosen = readerChurch();
  let id = chosen && chosen !== "none" ? chosen.id : null;
  if (chosen === null) { const list = await loadChurchList(); if (list?.length === 1) id = list[0].id; }
  const [y, m, d] = today.split("-").map(Number);
  return { service: await loadTodayService(id, new Date(y, m - 1, d, 12)), today };
}

export function useServiceScripture(books: Book[]): { found: Found; label: string } | null {
  const [state, setState] = useState<{ service: PublishedService | null; today: string } | null>(null);
  useEffect(() => {
    let live = true;
    const run = () => { void load().then((next) => { if (live) setState(next); }).catch(() => {}); };
    const shown = () => { if (document.visibilityState === "visible") run(); };
    // a church chosen in the Nau Mpro App in another tab
    const chose = (e: StorageEvent) => { if (e.key === "readerChurch") run(); };
    run();
    document.addEventListener("visibilitychange", shown);
    window.addEventListener("online", run);
    window.addEventListener("storage", chose);
    return () => { live = false; document.removeEventListener("visibilitychange", shown); window.removeEventListener("online", run); window.removeEventListener("storage", chose); };
  }, []);
  const found = serviceScripture(state?.service ?? null, books);
  return found ? { found, label: readingLabel(state!.service!.serviceDate, state!.today) } : null;
}
