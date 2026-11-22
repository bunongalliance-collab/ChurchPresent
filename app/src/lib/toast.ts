// Small pop-up messages (toasts) shown at the top right of the screen, below the navbar. Any page can call toast().
// Messages close by themselves after 5 seconds, errors after 8 seconds.
import { useEffect, useState } from "react";

export interface ToastItem { id: number; text: string; error: boolean }

let items: ToastItem[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((f) => f());

export function dismissToast(id: number) {
  items = items.filter((t) => t.id !== id);
  emit();
}

export function toast(text: string, error = false) {
  if (!text) return;
  // The same message again replaces the old one instead of stacking
  items = items.filter((t) => t.text !== text);
  const id = nextId++;
  items = [...items, { id, text, error }].slice(-4);
  emit();
  // Errors stay a little longer so they can be read; any message can be closed early with the x
  setTimeout(() => dismissToast(id), error ? 8000 : 5000);
}

// Lists the current toasts and updates when they change
export function useToasts(): ToastItem[] {
  const [, setTick] = useState(0);
  useEffect(() => {
    const f = () => setTick((n) => n + 1);
    listeners.add(f);
    return () => { listeners.delete(f); };
  }, []);
  return items;
}
