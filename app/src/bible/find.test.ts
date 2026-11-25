import { describe, expect, it } from "vitest";
import type { Book, BookText } from "./data";
import { churchDay, parseReference, readingLabel, searchSaved, serviceScripture, versesInRange } from "./find";
import type { PublishedService } from "../lib/publishedService";

const book = (code: string, order: number, name: string, local: string, chapters: number): Book =>
  ({ code, order, testament: order < 40 ? "OT" : "NT", name, local, chapters });
const BOOKS = [
  book("GEN", 1, "Genesis", "Nau Ntơm", 50),
  book("PSA", 19, "Psalms", "Nau Mprơ Ơm", 150),
  book("SNG", 22, "Song of Songs", "Nau Mprơ Ueh", 8),
  book("JHN", 43, "John", "Y-Yôhan", 21),
  book("1CO", 46, "1 Corinthians", "I Kôrintô", 16),
  book("2CO", 47, "2 Corinthians", "Ii Kôrintô", 13),
  book("1JN", 62, "1 John", "I Y-Yôhan", 5),
  book("JUD", 65, "Jude", "Y-Yut", 1),
];
const one = (q: string) => parseReference(q, BOOKS).map((r) => [r.book.code, r.chap, r.v1, r.v2]);

describe("parseReference", () => {
  it("reads Bunong and English book names, with a verse or a range", () => {
    expect(one("Nau Ntơm 1:1-2")).toEqual([["GEN", 1, 1, 2]]);
    expect(one("John 3:16")).toEqual([["JHN", 3, 16, 16]]);
    expect(one("Psalm 23")).toEqual([["PSA", 23, null, null]]);
    expect(one("Y-Yôhan 3.16–18")).toEqual([["JHN", 3, 16, 18]]);
  });
  it("works without accents, hyphens or spaces, and with numbered books", () => {
    expect(one("nau ntom 2")).toEqual([["GEN", 2, null, null]]);
    expect(one("yohan 3:16")).toEqual([["JHN", 3, 16, 16]]);
    expect(one("1 Cor 13")).toEqual([["1CO", 13, null, null]]);
    expect(one("2 korinto 5:17")).toEqual([["2CO", 5, 17, 17]]);
    expect(one("1co13:4")).toEqual([["1CO", 13, 4, 4]]);
  });
  it("takes an exact name over longer names that start the same", () => {
    expect(one("1 John 1")).toEqual([["1JN", 1, null, null]]);
  });
  it("offers every book a short name could mean", () => {
    expect(one("nau mpro 1").map((x) => x[0])).toEqual(["PSA", "SNG"]);
  });
  it("treats the number as a verse in a one-chapter book", () => {
    expect(one("Jude 5")).toEqual([["JUD", 1, 5, 5]]);
  });
  it("opens the first chapter's part of a range that runs into the next chapter", () => {
    expect(one("Genesis 1:26-2:3")).toEqual([["GEN", 1, 26, 999]]);
  });
  it("gives nothing for phrases, unknown books and chapters that do not exist", () => {
    expect(one("brah ndu")).toEqual([]);
    expect(one("Giăng 3:16")).toEqual([]);
    expect(one("Genesis 51")).toEqual([]);
    expect(one("")).toEqual([]);
    expect(one("3:16")).toEqual([]);
  });
});

const GEN: BookText = {
  code: "GEN", savedAt: 0,
  chapters: {
    2: { headings: [], verses: [{ v: 1, end: null, text: "Brah Ndu rhăk", para: true }] },
    1: { headings: [], verses: [
      { v: 1, end: null, text: "Ntơm sa ơm Brah Ndu rhăk", para: true },
      { v: 14, end: 15, text: "Geh nau ang", para: false },
      { v: 16, end: null, text: "Brah   Ndu lah", para: false },
    ] },
  },
};

describe("searchSaved", () => {
  it("finds a phrase in reading order, ignoring case and extra spaces", () => {
    expect(searchSaved("brah ndu", [GEN], BOOKS, 10).map((h) => [h.c, h.v])).toEqual([[1, 1], [1, 16], [2, 1]]);
  });
  it("stops at the limit", () => {
    expect(searchSaved("brah", [GEN], BOOKS, 2)).toHaveLength(2);
  });
});

describe("versesInRange", () => {
  it("includes a verse printed together with the next when any part is in range", () => {
    expect(versesInRange(GEN.chapters[1].verses, 15, 16).map((v) => v.v)).toEqual([14, 16]);
    expect(versesInRange(GEN.chapters[1].verses, 20, 22)).toEqual([]);
  });
});

describe("church dates", () => {
  it("uses the church's day, not the device's", () => {
    // 03:00 UTC on the 29th is still the evening of the 28th in Charlotte
    expect(churchDay(new Date("2026-11-29T03:00:00Z"))).toBe("2026-11-28");
    expect(churchDay(new Date("2026-11-29T15:00:00Z"))).toBe("2026-11-29");
  });
  it("names the reading by when the service is", () => {
    expect(readingLabel("2026-11-29", "2026-11-24")).toBe("Upcoming reading");
    expect(readingLabel("2026-11-29", "2026-11-29")).toBe("Today’s reading");
    expect(readingLabel("2026-11-29", "2026-11-30")).toBe("Previous reading");
    expect(readingLabel("2026-11-27", "2026-11-24")).toBe("Upcoming reading");
  });
});

describe("serviceScripture", () => {
  const svc = (items: PublishedService["items"]): PublishedService => ({ serviceDate: "2026-11-29", title: "", dateLabel: "", items, updated: "" });
  it("takes the first scripture reading it can open, and no songs", () => {
    const s = svc([
      { name: "Opening Song", subs: [{ text: "John 1", kind: "song" }] },
      { name: "Scripture Reading", subs: [{ text: "Giăng 3:16", kind: "scripture" }, { text: "Nau Ntơm 1:1-2", kind: "scripture" }] },
    ]);
    const r = serviceScripture(s, BOOKS);
    expect(r && [r.book.code, r.chap, r.v1, r.v2]).toEqual(["GEN", 1, 1, 2]);
  });
  it("reads a reference that follows a study title", () => {
    const s = svc([{ name: "Scripture Reading", subs: [{ text: "Trust in God — Psalm 23:1-6", kind: "scripture" }] }]);
    expect(serviceScripture(s, BOOKS)?.chap).toBe(23);
  });
  it("is null when there is no scripture reading", () => {
    expect(serviceScripture(svc([{ name: "Message", subs: [{ text: "John 3", kind: "text" }] }]), BOOKS)).toBeNull();
    expect(serviceScripture(null, BOOKS)).toBeNull();
  });
});
