// Following the presentation, for the Recorder and the lower-third overlay page. Two ways:
// - "local": the screen window is on this computer, in this browser. It reports each slide change on the
//   "church-projector" channel, and the Program Order comes from the deck saved by Present.
// - "code": the screen window is on another computer (or in OBS, which is a separate browser). It joins the phone
//   remote's internet channel for the presenter's pairing code. Each update carries the Program Order list too.
// Both only listen: nothing here sends slide commands, so following can never change the presentation.
import { useEffect, useState } from "react";
import { supabase } from "../supabase";
import { remoteChannel, type RemoteState } from "../remote";
import { loadDeck, PROJECTOR_KEY, type DeckItem } from "../../pages/Projector";

export type FollowMode = "local" | "code";
export interface ScreenState { index: number; blackout: boolean; waiting: boolean; logo: boolean }
export interface Follow {
  connected: boolean;
  screen: ScreenState;
  outline: DeckItem[] | undefined;
  problem: string; // why following cannot start (shown to the person), or ""
}

const LOCAL_CHANNEL = "church-projector";
const START: ScreenState = { index: 0, blackout: false, waiting: false, logo: false };
export const cleanCode = (s: string) => s.toUpperCase().replace(/[^A-Z2-9]/g, "").slice(0, 8);

export function useFollowPresenter(mode: FollowMode, code: string): Follow {
  const [screen, setScreen] = useState<ScreenState>(START);
  const [outline, setOutline] = useState<DeckItem[] | undefined>(() => (mode === "local" ? loadDeck()?.outline : undefined));
  const [connected, setConnected] = useState(false);
  const c = cleanCode(code);
  const problem = mode === "code" && !supabase ? "Following another computer needs the app's database settings, which this copy of the app does not have."
    : mode === "code" && c.length !== 8 ? "Enter the presenter's 8-letter pairing code (Presenter view → Phone remote)."
    : mode === "local" && typeof BroadcastChannel === "undefined" ? "This browser cannot follow the screen window. Use Chrome or Edge." : "";

  // Same computer: the screen window's slide changes, and the deck saved by Present
  useEffect(() => {
    if (mode !== "local" || typeof BroadcastChannel === "undefined") return;
    setOutline(loadDeck()?.outline);
    const ch = new BroadcastChannel(LOCAL_CHANNEL);
    let seen = 0;
    // Every open screen window may answer; follow the one that can be seen, then the one that changed last
    const windows = new Map<string, { state: ScreenState; visible: boolean; changedAt: number; at: number }>();
    ch.onmessage = (e: MessageEvent) => {
      const m = e.data;
      if (m?.type !== "state") return;
      const t = Date.now();
      seen = t;
      windows.set(typeof m.sid === "string" ? m.sid : "older-version", {
        state: { index: m.index ?? 0, blackout: !!m.blackout, waiting: !!m.waiting, logo: !!m.logo },
        visible: m.visible !== false, changedAt: typeof m.changedAt === "number" ? m.changedAt : 0, at: t,
      });
      let best: { state: ScreenState; visible: boolean; changedAt: number } | null = null;
      for (const [id, w] of windows) {
        if (t - w.at > 6000) { windows.delete(id); continue; }
        if (!best || (w.visible && !best.visible) || (w.visible === best.visible && w.changedAt > best.changedAt)) best = w;
      }
      setConnected(true);
      if (best) setScreen(best.state);
    };
    const hello = () => ch.postMessage({ type: "hello" });
    hello();
    const t = window.setInterval(() => { hello(); setConnected(Date.now() - seen < 4000); }, 2000);
    // Pressing Present again saves a new deck
    const onStorage = (e: StorageEvent) => { if (e.key === PROJECTOR_KEY) setOutline(loadDeck()?.outline); };
    window.addEventListener("storage", onStorage);
    return () => { window.clearInterval(t); ch.close(); window.removeEventListener("storage", onStorage); setConnected(false); };
  }, [mode]);

  // Another computer: the phone remote's channel for the pairing code
  useEffect(() => {
    const sb = supabase;
    if (mode !== "code" || !sb || c.length !== 8) return;
    let seen = 0;
    const ch = sb.channel(remoteChannel(c), { config: { broadcast: { self: false } } });
    ch.on("broadcast", { event: "state" }, ({ payload }) => {
      const s = payload as RemoteState;
      seen = Date.now();
      setConnected(true);
      setScreen({ index: s.index ?? 0, blackout: !!s.blackout, waiting: !!s.waiting, logo: !!s.logo });
      setOutline(s.items);
    });
    // role: the screen window answers, but does not count this as a phone in the presenter's panel
    const hello = () => void ch.send({ type: "broadcast", event: "hello", payload: { role: "follower" } });
    ch.subscribe((status) => { if (status === "SUBSCRIBED") hello(); });
    const t = window.setInterval(() => { hello(); setConnected(Date.now() - seen < 9000); }, 3000);
    return () => { window.clearInterval(t); void sb.removeChannel(ch); setConnected(false); };
  }, [mode, c]);

  return { connected, screen, outline, problem };
}

export const hideCaption = (s: ScreenState) => s.blackout || s.waiting || s.logo;
