import { supabase } from "./supabase";
import { type OutboxItem, getOutbox } from "./offlineCache";

// Saves to Supabase that wait for a connection. A save is sent at once when the device is online.
// If the connection fails, it is kept in IndexedDB and sent, in the order it was made, when the device is back online.
// A save the server refuses (for example, not allowed) is kept with its error, so it is not lost silently.

// Shown to the user when a save waits on this device
export const QUEUED_NOTE = "No connection. Saved on this device; it will upload when you are back online.";

export type WriteResult =
  | { status: "sent" }
  | { status: "queued" }
  | { status: "error"; message: string };

type Plain = { message: string } | null;

// Network failures look like these messages; anything else is a real answer from the server
const NETWORK = /failed to fetch|networkerror|network request failed|load failed|internet|offline|timed out/i;
const isNetworkMessage = (m: string) => NETWORK.test(m);

// The Supabase call for one saved item
function send(item: OutboxItem): PromiseLike<{ error: Plain }> {
  const sb = supabase;
  if (!sb) return Promise.resolve({ error: { message: "Supabase is not configured" } });
  const table = sb.from(item.table);
  if (item.op === "insert") return table.insert({ id: item.id, ...item.data }) as PromiseLike<{ error: Plain }>;
  if (item.op === "update") return table.update(item.data ?? {}).eq("id", item.id) as PromiseLike<{ error: Plain }>;
  return table.delete().eq("id", item.id) as PromiseLike<{ error: Plain }>;
}

// Try to save now; if the connection is down, keep it in the outbox instead
export async function saveRow(item: Omit<OutboxItem, "seq" | "queuedAt">): Promise<WriteResult> {
  const full: OutboxItem = { ...item, queuedAt: Date.now() };
  if (navigator.onLine !== false) {
    try {
      const { error } = await send(full);
      if (!error) return { status: "sent" };
      if (!isNetworkMessage(error.message)) return { status: "error", message: error.message };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!isNetworkMessage(msg)) return { status: "error", message: msg };
    }
  }
  const box = getOutbox();
  if (!box) return { status: "error", message: "Could not save on this device, and there is no connection." };
  try {
    await box.add(full);
    return { status: "queued" };
  } catch {
    return { status: "error", message: "Could not save on this device." };
  }
}

// Send every waiting save, oldest first. Stops at the first network failure, and keeps the rest for later.
export async function flushOutbox(): Promise<{ sent: number; waiting: number; refused: number }> {
  const box = getOutbox();
  if (!box || !supabase) return { sent: 0, waiting: 0, refused: 0 };
  let sent = 0;
  let refused = 0;
  const items = await box.orderBy("seq").toArray();
  for (const item of items) {
    try {
      const { error } = await send(item);
      if (!error) { await box.delete(item.seq!); sent++; continue; }
      if (isNetworkMessage(error.message)) break;
      await box.update(item.seq!, { error: error.message });
      refused++;
    } catch {
      break;
    }
  }
  const waiting = await box.count();
  return { sent, waiting, refused };
}

// Send the queue when the device comes back online, and once at start-up
if (typeof window !== "undefined") {
  window.addEventListener("online", () => { void flushOutbox(); });
  window.setTimeout(() => { void flushOutbox(); }, 2000);
}

export function newId(): string {
  return crypto.randomUUID();
}
