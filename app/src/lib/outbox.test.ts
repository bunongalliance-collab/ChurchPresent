import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Supabase is replaced by a fake: each call either succeeds, or fails with the given message
const calls: { table: string; op: string; id?: string }[] = [];
let fail: string | null = null;
let rows = 1;   // how many rows the server changes: 0 when the rules hide the row from this account
const make = (table: string) => {
  // update and delete answer with the rows they changed
  const changed = (op: string) => ({ eq: (_c: string, id: string) => ({ select: () => { calls.push({ table, op, id }); return Promise.resolve({ data: fail ? null : Array.from({ length: rows }, () => ({ id })), error: fail ? { message: fail } : null }); } }) });
  return {
    insert: (data: { id: string }) => { calls.push({ table, op: "insert", id: data.id }); return Promise.resolve({ error: fail ? { message: fail } : null }); },
    update: () => changed("update"),
    delete: () => changed("delete"),
  };
};
vi.mock("./supabase", () => ({ supabase: { from: (t: string) => make(t) } }));

const { saveRow, flushOutbox } = await import("./outbox");
const { getOutbox } = await import("./offlineCache");

beforeEach(async () => {
  calls.length = 0;
  fail = null;
  rows = 1;
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

  it("says nothing was saved when the server changed no row (deleted, made Only me, or no longer allowed)", async () => {
    rows = 0;
    const up = await saveRow({ table: "scripture_studies", op: "update", id: "s", data: { study_title: "x" } });
    expect(up).toMatchObject({ status: "error", message: expect.stringMatching(/Only me/) });
    expect((await saveRow({ table: "presentations", op: "delete", id: "p" })).status).toBe("error");
    expect(await getOutbox()!.count()).toBe(0);
  });

  it("keeps a waiting save that changes no row, with the reason", async () => {
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => false });
    await saveRow({ table: "readings", op: "update", id: "r", data: { title: "1" } });
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => true });
    rows = 0;
    expect(await flushOutbox()).toEqual({ sent: 0, waiting: 1, refused: 1 });
  });
});
