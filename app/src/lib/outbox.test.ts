import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Supabase is replaced by a fake: each call either succeeds, or fails with the given message
const calls: { table: string; op: string; id?: string }[] = [];
let fail: string | null = null;
const make = (table: string) => ({
  insert: (data: { id: string }) => { calls.push({ table, op: "insert", id: data.id }); return Promise.resolve({ error: fail ? { message: fail } : null }); },
  update: () => ({ eq: (_c: string, id: string) => { calls.push({ table, op: "update", id }); return Promise.resolve({ error: fail ? { message: fail } : null }); } }),
  delete: () => ({ eq: (_c: string, id: string) => { calls.push({ table, op: "delete", id }); return Promise.resolve({ error: fail ? { message: fail } : null }); } }),
});
vi.mock("./supabase", () => ({ supabase: { from: (t: string) => make(t) } }));

const { saveRow, flushOutbox } = await import("./outbox");
const { getOutbox } = await import("./offlineCache");

beforeEach(async () => {
  calls.length = 0;
  fail = null;
  await getOutbox()!.clear();
  Object.defineProperty(navigator, "onLine", { configurable: true, get: () => true });
});

describe("outbox", () => {
  it("sends straight away when online", async () => {
    const r = await saveRow({ table: "readings", op: "insert", id: "r1", data: { title: "x" } });
    expect(r.status).toBe("sent");
    expect(await getOutbox()!.count()).toBe(0);
  });

  it("keeps the save when offline and sends it later, in order", async () => {
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => false });
    expect((await saveRow({ table: "lyric_songs", op: "update", id: "a", data: { title: "1" } })).status).toBe("queued");
    expect((await saveRow({ table: "lyric_songs", op: "delete", id: "b" })).status).toBe("queued");
    expect(calls).toEqual([]);

    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => true });
    const res = await flushOutbox();
    expect(res).toEqual({ sent: 2, waiting: 0, refused: 0 });
    expect(calls.map((c) => c.op)).toEqual(["update", "delete"]);
  });

  it("queues when the network fails mid-save, and keeps a refused save with its error", async () => {
    fail = "Failed to fetch";
    expect((await saveRow({ table: "presentations", op: "delete", id: "p" })).status).toBe("queued");
    fail = "new row violates row-level security policy";
    const refused = await saveRow({ table: "presentations", op: "delete", id: "q" });
    expect(refused.status).toBe("error");
    expect(await getOutbox()!.count()).toBe(1);
  });
});
