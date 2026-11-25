import { describe, expect, it } from "vitest";
import { hasUnseen, latestAt, resolveChurch, shareAudience, shareError } from "./share";

const a = { id: "a", name: "A" }, b = { id: "b", name: "B" };

describe("resolveChurch", () => {
  it("uses the chosen church", () => expect(resolveChurch(b, [a, b])).toEqual(b));
  it("takes the only church when nothing was chosen", () => expect(resolveChurch(null, [a])).toEqual(a));
  it("has none when there are several and nothing was chosen", () => expect(resolveChurch(null, [a, b])).toBeNull());
  it("keeps 'no church' even with only one", () => expect(resolveChurch("none", [a])).toBeNull());
  it("has none while the list is unknown", () => expect(resolveChurch(null, null)).toBeNull());
  it("uses the church a signed-in person belongs to when nothing was chosen", () => expect(resolveChurch(null, [a, b], [b])).toEqual(b));
  it("doesn't guess between two memberships", () => expect(resolveChurch(null, [a, b], [a, b])).toBeNull());
  it("keeps a choice, or 'no church', over membership", () => {
    expect(resolveChurch(a, [a, b], [b])).toEqual(a);
    expect(resolveChurch("none", [a, b], [b])).toBeNull();
  });
});

describe("shareAudience", () => {
  it("defaults to the reader's church when they belong to it", () => expect(shareAudience(b, [a, b])).toEqual(b));
  it("asks for a choice when they don't belong to the reader's church", () => expect(shareAudience(b, [a])).toBeNull());
  it("asks for a choice when the reader has no church", () => expect(shareAudience(null, [a])).toBeNull());
});

describe("unseen shares", () => {
  const old = { created_at: "2026-11-20T10:00:00+00:00", mine: false }, newer = { created_at: "2026-11-24T10:00:00+00:00", mine: false };
  it("is new until the list has been seen", () => expect(hasUnseen([old], null)).toBe(true));
  it("is new when something arrived after the last look", () => {
    expect(hasUnseen([newer, old], old.created_at)).toBe(true);
    expect(hasUnseen([newer, old], newer.created_at)).toBe(false);
  });
  it("never counts your own share, or an empty list", () => {
    expect(hasUnseen([{ ...newer, mine: true }], old.created_at)).toBe(false);
    expect(hasUnseen([], null)).toBe(false);
  });
  it("remembers the newest time in the list", () => {
    expect(latestAt([old, newer])).toBe(newer.created_at);
    expect(latestAt([])).toBeNull();
  });
});

describe("shareError", () => {
  it("says plainly what went wrong", () => {
    expect(shareError('relation "public.bible_shared_verses" does not exist')).toMatch(/switched on/);
    expect(shareError("Could not find the function public.church_shared_verses(cid) in the schema cache")).toMatch(/switched on/);
    expect(shareError("share_limit")).toMatch(/20/);
    expect(shareError('new row violates row-level security policy for table "bible_shared_verses"')).toMatch(/belong/);
    expect(shareError("TypeError: Failed to fetch")).toMatch(/connection/);
  });
});
