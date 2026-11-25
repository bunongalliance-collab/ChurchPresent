// The church's saved programs, for choosing which one to show on Service Slides. The team's programs only (signed in);
// the same list as the Program page's program bar.
import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import { churchReady, saveChurchId, useChurch } from "./church";

export interface ProgramChoice { id: string; date: string; title: string }

export function useProgramList(): { signedIn: boolean; list: ProgramChoice[] } {
  const church = useChurch();
  const uid = church.session?.user.id ?? null;
  const churchId = church.ready ? saveChurchId() : undefined;
  const [found, setFound] = useState<{ key: string; list: ProgramChoice[] } | null>(null);
  const key = `${uid}/${churchId}`;
  useEffect(() => {
    if (!supabase || !uid || churchId === undefined) return;
    let live = true;
    const load = async () => {
      await churchReady();
      const q = supabase!.from("programs").select("id, service_date, title").order("service_date");
      const { data, error } = await (churchId ? q.eq("church_id", churchId) : q.is("church_id", null));
      if (live && !error) setFound({ key, list: (data ?? []).map((r) => ({ id: r.id, date: r.service_date, title: r.title })) });
    };
    void load();
    window.addEventListener("focus", load);   // a program added or renamed in another tab
    return () => { live = false; window.removeEventListener("focus", load); };
  }, [uid, churchId, key]);
  return { signedIn: !!uid, list: uid && found?.key === key ? found.list : [] };
}

// One program's whole data (the Program page's draft), or null when it can't be read
export async function loadProgramData(id: string): Promise<object | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from("programs").select("service_date, data").eq("id", id).maybeSingle();
  return error || !data ? null : { ...(data.data as object), date: data.service_date };
}
