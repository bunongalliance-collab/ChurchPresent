// Small pop-up messages (toasts) shown at the bottom of the screen. Any page can call toast().
import { useEffect, useState } from "react";

export interface ToastItem { id: number; text: string; error: boolean }

let items: ToastItem[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((f) => f());

export function toast(text: string, error = false) {
  const id = nextId++;
  items = [...items, { id, text, error }].slice(-4);
  emit();
  // Errors and warnings stay a little longer so they can be read
  setTimeout(() => { items = items.filter((t) => t.id !== id); emit(); }, error ? 5500 : 3000);
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
