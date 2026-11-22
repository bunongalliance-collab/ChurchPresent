import { useEffect, useState } from "react";
import { dismissToast, useToasts } from "../lib/toast";

// Shows the toasts in one stack at the top right of the screen, just below the navbar (mounted once, in App).
// The navbar's height changes with the screen width (it wraps on medium screens), so it is measured.
export default function Toasts() {
  const list = useToasts();
  const [top, setTop] = useState(64);
  // Measured again whenever a message appears: each page draws its own navbar, so it is replaced on page changes
  useEffect(() => {
    if (!list.length) return;
    const nav = document.querySelector(".navbar");
    if (!nav) { setTop(12); return; }
    const measure = () => setTop(Math.round(nav.getBoundingClientRect().bottom > 0 ? nav.getBoundingClientRect().bottom : 0) + 10);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(nav);
    return () => ro.disconnect();
  }, [list]);
  return (
    <div className="toast-stack" role="status" aria-live="polite" style={{ top }}>
      {list.map((t) => (
        <div key={t.id} className={`toast${t.error ? " error" : ""}`}>
          <span>{t.text}</span>
          <button type="button" className="toast-x" aria-label="Close message" onClick={() => dismissToast(t.id)}>×</button>
        </div>
      ))}
    </div>
  );
}
