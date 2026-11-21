import { describe, expect, it } from "vitest";
import { followAlong, pickService, toPublishedItems } from "./publishedService";
import type { Lines } from "./orderLines";

describe("pickService", () => {
  const rows = [{ serviceDate: "2026-11-08" }, { serviceDate: "2026-11-15" }, { serviceDate: "2026-11-22" }];
  it("picks the next service from today on", () => {
    expect(pickService(rows, new Date(2026, 10, 16))?.serviceDate).toBe("2026-11-22");
    expect(pickService(rows, new Date(2026, 10, 15))?.serviceDate).toBe("2026-11-15");
  });
  it("falls back to last week's service for six days, then shows none", () => {
    const past = [{ serviceDate: "2026-11-15" }];
    expect(pickService(past, new Date(2026, 10, 20))?.serviceDate).toBe("2026-11-15");
    expect(pickService(past, new Date(2026, 10, 23))).toBeNull();
  });
});

describe("toPublishedItems", () => {
  it("keeps items, songs and passages, and leaves people's names out", () => {
    const lines = [
      [{ id: "a", text: "Opening Song", level: 0 }, { id: "b", text: "12. Bơh Ndu Ueh", level: 1, songId: "s12" }, { id: "c", text: "Y Nhen", level: 2 }],
      [{ id: "d", text: "Scripture Reading", level: 0 }, { id: "e", text: "Giăng 3:16", level: 1 }],
    ] as unknown as Lines;
    const items = toPublishedItems(lines);
    expect(items).toEqual([
      { name: "Opening Song", subs: [{ text: "12. Bơh Ndu Ueh", kind: "song", songId: "s12" }] },
      { name: "Scripture Reading", subs: [{ text: "Giăng 3:16", kind: "scripture" }] },
    ]);
    expect(JSON.stringify(items)).not.toContain("Y Nhen");
  });
});

describe("followAlong", () => {
  it("keeps filled-in songs, readings and passages only, with their text", () => {
    const lines = [
      [{ id: "1", text: "Prelude", level: 0 }, { id: "2", text: "Children Choir", level: 0 }, { id: "3", text: "Y Nhen", level: 1 }],
      [{ id: "4", text: "Scripture Reading", level: 0 }, { id: "5", text: "Psalm 23", level: 1 }, { id: "6", text: "Message", level: 0 }, { id: "7", text: "Walking In Faith", level: 1 }],
      [{ id: "8", text: "Songs of Praise", level: 0 }],
    ] as unknown as Lines;
    const items = followAlong(toPublishedItems(lines, (kind, text) => (kind === "scripture" && text === "Psalm 23" ? "1 The Lord is my shepherd." : undefined)));
    expect(items.map((it) => it.name)).toEqual(["Children Choir", "Scripture Reading"]);
    expect(items[1].subs[0].body).toBe("1 The Lord is my shepherd.");
  });
});
