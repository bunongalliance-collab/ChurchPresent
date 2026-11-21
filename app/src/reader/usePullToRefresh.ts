import { useEffect, useRef, useState, type RefObject } from "react";

// Pull down to refresh on a scrolling list (touch screens). Starts only when the list is already at the top,
// so scrolling the list normally is unchanged. The list follows the finger with some resistance; letting go
// past THRESHOLD runs onRefresh, letting go earlier cancels.
export const PULL_THRESHOLD = 64;
const PULL_MAX = 96;
const HOLD = 44;   // where the list rests while refreshing

export type PullState = "idle" | "pulling" | "ready" | "refreshing";

export function usePullToRefresh(ref: RefObject<HTMLElement | null>, onRefresh: () => Promise<void>): { pull: number; state: PullState } {
  const [pull, setPull] = useState(0);
  const [state, setState] = useState<PullState>("idle");
  const run = useRef(onRefresh);
  run.current = onRefresh;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let startY: number | null = null, startX = 0, dist = 0, busy = false, vertical: boolean | null = null;
    const resist = (dy: number) => PULL_MAX * (1 - Math.exp(-dy / 120));

    const onStart = (e: TouchEvent) => {
      if (busy || e.touches.length !== 1 || el.scrollTop > 0) { startY = null; return; }
      startY = e.touches[0].clientY; startX = e.touches[0].clientX; dist = 0; vertical = null;
    };
    const onMove = (e: TouchEvent) => {
      if (startY === null) return;
      const dy = e.touches[0].clientY - startY, dx = e.touches[0].clientX - startX;
      // Decide once whether this is a downward pull; sideways swipes (category chips) and upward scrolls are left alone
      if (vertical === null && (Math.abs(dy) > 6 || Math.abs(dx) > 6)) vertical = dy > 0 && Math.abs(dy) > Math.abs(dx) && el.scrollTop <= 0;
      if (!vertical) { if (vertical === false) startY = null; return; }
      e.preventDefault();   // the list moves instead of the page (and instead of the browser's own pull)
      dist = resist(Math.max(0, dy));
      setPull(dist);
      setState(dist >= PULL_THRESHOLD ? "ready" : "pulling");
    };
    const onEnd = () => {
      if (startY === null) return;
      startY = null;
      if (dist < PULL_THRESHOLD) { setPull(0); setState("idle"); return; }
      busy = true;
      setPull(HOLD); setState("refreshing");
      run.current().finally(() => { busy = false; setPull(0); setState("idle"); });
    };

    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd);
    el.addEventListener("touchcancel", onEnd);
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
    };
  }, [ref]);

  return { pull, state };
}
