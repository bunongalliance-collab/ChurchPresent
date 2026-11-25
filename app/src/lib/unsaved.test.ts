import { describe, expect, it, vi } from "vitest";
import { anyUnsaved, discardQuestion, readingDirty, setUnsaved, songDirty, studyDirty, unsavedNotice } from "./unsaved";

describe("songDirty", () => {
  const saved = { title: "Song", number: "12", lyrics: "one\ntwo", look: { font: "Arial", customSize: 0 } };
  const form = { title: "Song", number: "12", lyrics: "one\ntwo", look: { font: "Arial", customSize: 0, bg: "#000" } };
  it("is clean when the form matches the saved song", () => expect(songDirty(saved, form)).toBe(false));
  it("sees changed words, title, number or saved formatting", () => {
    expect(songDirty(saved, { ...form, lyrics: "one" })).toBe(true);
    expect(songDirty(saved, { ...form, title: "Other" })).toBe(true);
    expect(songDirty(saved, { ...form, number: "13" })).toBe(true);
    expect(songDirty(saved, { ...form, look: { ...form.look, font: "Georgia" } })).toBe(true);
  });
  it("ignores spaces around the title and number, which saving trims", () => expect(songDirty(saved, { ...form, title: "Song ", number: " 12" })).toBe(false));
  it("treats a new song as unsaved only once something is typed", () => {
    expect(songDirty(null, { title: "", number: "", lyrics: "  ", look: {} })).toBe(false);
    expect(songDirty(null, { title: "", number: "", lyrics: "words", look: {} })).toBe(true);
    expect(songDirty(null, { title: "New", number: "", lyrics: "", look: {} })).toBe(true);
  });
});

describe("readingDirty", () => {
  const saved = { title: "R", number: "1", subtitle: "s", categoryId: null, content: "text", look: {} };
  const form = { title: "R", number: "1", subtitle: "s", categoryId: "", content: "text", look: { font: "Arial" } };
  it("is clean when unchanged (no category is the same as an empty one)", () => expect(readingDirty(saved, form)).toBe(false));
  it("sees a changed text, subtitle or category", () => {
    expect(readingDirty(saved, { ...form, content: "texts" })).toBe(true);
    expect(readingDirty(saved, { ...form, subtitle: "" })).toBe(true);
    expect(readingDirty(saved, { ...form, categoryId: "c1" })).toBe(true);
  });
  it("treats a new reading as unsaved only once something is typed", () => {
    expect(readingDirty(null, { ...form, title: "", content: "" })).toBe(false);
    expect(readingDirty(null, form)).toBe(true);
  });
});

describe("studyDirty", () => {
  const slide = { id: "a", kind: "passage", title: "John 3:16", text: "For God", fmt: { size: 40, bold: true } };
  const saved = { title: "Study", slides: [slide], look: { font: "Arial", bg: "#000" } };
  it("is clean when unchanged, whatever order the database returns the fields in", () => {
    const reordered = { fmt: { bold: true, size: 40 }, text: "For God", title: "John 3:16", kind: "passage", id: "a" };
    expect(studyDirty(saved, { title: "Study", slides: [{ ...reordered, bible: undefined } as typeof slide], look: { bg: "#000", font: "Arial" } })).toBe(false);
  });
  it("sees changed slides, name or look", () => {
    expect(studyDirty(saved, { ...saved, slides: [{ ...slide, text: "For" }] })).toBe(true);
    expect(studyDirty(saved, { ...saved, slides: [] })).toBe(true);
    expect(studyDirty(saved, { ...saved, title: "Another" })).toBe(true);
    expect(studyDirty(saved, { ...saved, look: { ...saved.look, bg: "#fff" } })).toBe(true);
  });
  it("ignores empty starter slides in a new study", () => {
    const empty = [{ id: "1", kind: "passage", title: "", text: "" }, { id: "2", kind: "custom", title: "Custom slide", text: "" }, { id: "3", kind: "questions", title: "Questions", text: " " }];
    expect(studyDirty(null, { title: "Scripture study", slides: empty, look: {} })).toBe(false);
    expect(studyDirty(null, { title: "Scripture study", slides: [slide], look: {} })).toBe(true);
    expect(studyDirty(null, { title: "Easter", slides: [], look: {} })).toBe(true);
  });
});

describe("pages with unsaved work", () => {
  it("remembers them until each is saved", () => {
    const kept = new Map<string, string>();
    vi.stubGlobal("sessionStorage", { getItem: (k: string) => kept.get(k) ?? null, setItem: (k: string, v: string) => void kept.set(k, v) });
    expect(anyUnsaved()).toBe(false);
    setUnsaved("song", true);
    setUnsaved("study", true);
    setUnsaved("song", false);
    expect(anyUnsaved()).toBe(true);
    setUnsaved("study", false);
    expect(anyUnsaved()).toBe(false);
    vi.unstubAllGlobals();
  });
});

describe("warning wording", () => {
  it("names what wasn't saved before replacing it", () => {
    expect(discardQuestion("song", "5. Jingle Bell")).toMatch(/^Your Lyric “5\. Jingle Bell” wasn’t saved\./);
    expect(discardQuestion("reading", "  ")).toMatch(/^Your Reading wasn’t saved\./);
    expect(discardQuestion("study", "Easter")).toMatch(/^Your Scripture “Easter” wasn’t saved\./);
  });
  it("says where to save after staying on the page", () => {
    expect(unsavedNotice({ song: "Jingle Bell" })).toBe("Your Lyric “Jingle Bell” wasn’t saved. Press Save Song on the Lyric page.");
    expect(unsavedNotice({ study: true, song: false })).toBe("Your Scripture wasn’t saved. Press Save Study on the Scripture page.");
    expect(unsavedNotice({ song: true, reading: "R" })).toBe("Your Lyric and Reading “R” weren’t saved. Save each one before closing.");
    expect(unsavedNotice({ song: true, reading: true, study: true })).toBe("Your Lyric, Reading and Scripture weren’t saved. Save each one before closing.");
    expect(unsavedNotice({})).toBe("");
  });
});
