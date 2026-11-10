import { useToasts } from "../lib/toast";

// Shows the toasts in one stack at the bottom of the screen (mounted once, in App)
export default function Toasts() {
  const list = useToasts();
  return (
    <div className="toast-stack" role="status" aria-live="polite">
      {list.map((t) => (
        <div key={t.id} className={`toast${t.error ? " error" : ""}`}>{t.text}</div>
      ))}
    </div>
  );
}
