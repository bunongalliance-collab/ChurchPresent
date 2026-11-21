import { describe, expect, it } from "vitest";
import { buildServiceDeck, parseItems, type ProgramInput, type Resources } from "./servicePresentation";
import type { Lines } from "./orderLines";

const O = { font: "Arial", bg: "#213648", fg: "#f5f2ea" };
const L = (id: string, level: number, text: string, extra: Partial<{ songId: string; readingId: string; studyId: string }> = {}) => ({ id, level, text, ...extra });
const none: Resources = { songs: {}, songIdForLabel: () => undefined, readings: {}, studies: {} };
const program = (lines: Lines, extra: Partial<ProgramInput> = {}): ProgramInput => ({
  church: "Montagnard Bunong Alliance Church", service: "SUNDAY SERVICE", date: "2026-11-15", leader: "", announcements: [], lines, ...extra,
});
const text = (s: { rows?: string[] }) => (s.rows ?? []).join(" | ");

describe("service presentation", () => {
  const lines: Lines = {
    0: [
      L("a", 0, "Prelude"), L("b", 0, "Welcome & Call to Worship"), L("b1", 1, "Pastor"), L("b2", 2, "Pastor Sam"),
      L("c", 0, "Opening Song"), L("c1", 1, "12. Brah Yê-su", { songId: "s1" }), L("c2", 2, "Worship team"),
      L("d", 0, "Opening Prayer"), L("d1", 1, ""), L("d2", 2, "Mbỡ Hoan"),
    ],
    1: [L("e", 0, "Children Choir"), L("e1", 1, "5. Kơ lơm ia", { songId: "s2" }), L("e2", 2, "Anna · Ben")],
    2: [L("f", 0, "Scripture Reading"), L("f1", 1, "Psalm 23", { studyId: "st1" }), L("f2", 2, "Rnăk Ui"), L("g", 0, "Reading"), L("g1", 1, "Call to Worship", { readingId: "r1" })],
    3: [L("h", 0, "Closing Song"), L("i", 0, "Offering & Announcements")],
    4: [L("j", 0, "Sok Nh'hor"), L("j1", 1, "Mbỡ A"), L("j2", 1, "Mbỡ B")],
  };
  const songs: Resources["songs"] = {
    s1: { id: "s1", title: "Brah Yê-su", number: "12", lyrics: "Verse 1\nBrah Yê-su kơ lơm ia\n\nChorus\nHơ-ngăn Brah" },
    s2: { id: "s2", title: "Kơ lơm ia", number: "5", lyrics: "Verse 1\nMbĕng hom găp, Brah Huĕng Ueh ơi" },
  };
  const res: Resources = {
    songs, songIdForLabel: () => undefined,
    readings: { r1: [{ label: "", rows: ["Come, let us worship"], size: 60 }] },
    studies: { st1: [{ label: "", rows: ["The Lord is my shepherd"], size: 60 }] },
  };

  it("follows the Program's order and gives every item a slide, even with no person or details", () => {
    const deck = buildServiceDeck(program(lines, { announcements: ["Picnic on Saturday"] }), res, O);
    expect(parseItems(lines).map((i) => i.name)).toEqual(["Prelude", "Welcome & Call to Worship", "Opening Song", "Opening Prayer", "Children Choir", "Scripture Reading", "Reading", "Closing Song", "Offering & Announcements", "Sok Nh'hor"]);
    expect(deck.outline.map((e) => e.item)).toEqual(["Welcome", "Prelude", "Welcome & Call to Worship", "Opening Song", "Opening Prayer", "Children Choir", "Scripture Reading", "Reading", "Closing Song", "Offering & Announcements", "Sok Nh'hor"]);
    expect(deck.outline.every((e) => e.count >= 1)).toBe(true);
    const prelude = deck.slides[deck.outline[1].first];
    expect(prelude.rows).toEqual(["Prelude"]);
  });

  it("shows the person's name and any details on a regular item", () => {
    const deck = buildServiceDeck(program(lines), res, O);
    expect(text(deck.slides[deck.outline[2].first])).toBe("Welcome & Call to Worship | Pastor | Pastor Sam");
    expect(text(deck.slides[deck.outline[4].first])).toBe("Opening Prayer | Mbỡ Hoan");
  });

  it("puts a chosen song's number, title and singer first, then its lyrics, split by verse", () => {
    const deck = buildServiceDeck(program(lines), res, O);
    const song = deck.outline[3];
    expect(text(deck.slides[song.first])).toBe("12. Brah Yê-su | Worship team");
    expect(song.count).toBe(1 + 2); // the title slide, then one slide each for the verse and the chorus
    expect(deck.slides[song.first + 1].lyric).toBe(true);
    expect(deck.slides[song.first + 1].label).toBe("V1");
  });

  it("names the choir and its singers on a choir song", () => {
    const deck = buildServiceDeck(program(lines), res, O);
    expect(text(deck.slides[deck.outline[5].first])).toBe("5. Kơ lơm ia | Children Choir: Anna · Ben");
  });

  it("adds the chosen scripture and reading after their title slides", () => {
    const deck = buildServiceDeck(program(lines), res, O);
    expect(text(deck.slides[deck.outline[6].first])).toBe("Scripture Reading | Psalm 23 | Read by Rnăk Ui");
    expect(text(deck.slides[deck.outline[6].first + 1])).toBe("The Lord is my shepherd");
    expect(text(deck.slides[deck.outline[7].first + 1])).toBe("Come, let us worship");
  });

  it("adds the Program's announcements after the Announcements item", () => {
    const deck = buildServiceDeck(program(lines, { announcements: ["Picnic on Saturday", " "] }), res, O);
    const e = deck.outline[9];
    expect(e.count).toBe(2);
    expect(text(deck.slides[e.first + 1])).toBe("Announcements | Picnic on Saturday");
  });

  it("warns, and still shows the title, when a song, reading or scripture cannot be filled in", () => {
    const deck = buildServiceDeck(program(lines), { ...none, songs: {} }, O);
    expect(deck.warnings.some((w) => w.includes("Opening Song") && w.includes("no longer available"))).toBe(true);
    expect(deck.warnings.some((w) => w.startsWith("Closing Song: No song chosen"))).toBe(true);
    expect(deck.warnings.some((w) => w.startsWith("Scripture Reading") && w.includes("could not be loaded"))).toBe(true);
    expect(deck.slides[deck.outline[3].first].rows![0]).toBe("12. Brah Yê-su");
  });

  it("says so when a chosen song is no longer available, and when a typed one matches nothing", () => {
    const stale: Lines = { 0: [L("c", 0, "Opening Song"), L("c1", 1, "77. Gone", { songId: "deleted" }), L("c2", 1, "Typed song")] };
    const deck = buildServiceDeck(program(stale), none, O);
    expect(deck.warnings[0]).toContain("no longer available");
    expect(deck.warnings[1]).toContain("does not match a saved song");
    expect(deck.outline[1].count).toBe(2); // a title slide for each, no blank slide
  });

  it("matches a song typed by hand to a saved song by its label", () => {
    const typed: Lines = { 0: [L("c", 0, "Opening Song"), L("c1", 1, "12. Brah Yê-su")] };
    const deck = buildServiceDeck(program(typed), { ...res, songIdForLabel: (l) => (l === "12. Brah Yê-su" ? "s1" : undefined) }, O);
    expect(deck.outline[1].count).toBe(3);
    expect(deck.warnings).toEqual([]);
  });

  it("continues a long list of names on more slides, keeping the title", () => {
    const names = Array.from({ length: 30 }, (_, i) => L(`n${i}`, 1, `Name number ${i + 1}`));
    const deck = buildServiceDeck(program({ 4: [L("j", 0, "Sok Nh'hor"), ...names] }), none, O);
    const e = deck.outline[1];
    expect(e.count).toBeGreaterThan(1);
    expect(deck.slides[e.first + 1].rows![0]).toBe("Sok Nh'hor (continued)");
    const shown = deck.slides.slice(e.first, e.first + e.count).flatMap((s) => s.rows ?? []).filter((t) => t.startsWith("Name number"));
    expect(shown).toHaveLength(30);
  });
});
