import { describe, expect, it } from "vitest";
import { onePerSong, songKey, withoutSheet } from "./lyrics";

const song = (id: string, over: Partial<Parameters<typeof onePerSong>[0][number]> = {}) =>
  ({ id, number: "58", title: "HA-LÊ-LU-YA", lyrics: "words", updated: "2026-11-18", scorePath: "", scoreImages: [] as string[], ...over });

describe("onePerSong", () => {
  const book = song("book", { scorePath: "hymn-0058.pdf", scoreImages: ["a.webp"] });
  const team = song("team", { title: "Ha-lê-lu-ya", updated: "2026-11-23" });

  it("shows the copy with the music sheet, even when a copy without one is newer", () => {
    expect(onePerSong([team, book])).toEqual([book]);
    expect(onePerSong([book, team])).toEqual([book]);
  });
  it("counts a PDF alone as a sheet", () => {
    const pdf = song("pdf", { scorePath: "hymn-0058.pdf" });
    expect(onePerSong([pdf, team])).toEqual([pdf]);
  });
  it("keeps the most recently updated copy when none has a sheet", () => {
    const old = song("old", { updated: "2026-11-08" });
    expect(onePerSong([old, team])).toEqual([team]);
  });
  it("prefers a copy with words over a missing-page entry and its wrong scan", () => {
    const gone = song("gone", { title: "SONG 58 — PAGE MISSING", lyrics: "", scoreImages: ["x.webp"] });
    const typed = song("typed", { title: "SONG 58 — PAGE MISSING", lyrics: "Verse 1\nwords", updated: "2026-11-01" });
    expect(onePerSong([gone, typed])).toEqual([typed]);
  });
  it("keeps songs with a different number or title apart", () => {
    expect(onePerSong([book, song("other", { number: "59" })])).toHaveLength(2);
    expect(songKey(book)).toBe(songKey(team));
  });
});

describe("withoutSheet", () => {
  const sheet = song("book", { number: "28", title: "PĂNG RÊH", scorePath: "hymn-0028.pdf" });
  const team = song("team", { number: "28", title: "TƠ LAH GÂP" });
  const jingle = song("j", { number: "00", title: "Jingle Bell" });
  const gone = song("gone", { number: "288", title: "(SONG 288 — PAGE MISSING)", lyrics: "", scorePath: "hymn-0288.pdf" });
  const blank = song("blank", { number: "", title: "" });

  it("lists songs without a sheet in number order, with the likely reason", () => {
    const r = withoutSheet([blank, gone, jingle, sheet, team]);
    expect(r.total).toBe(5);
    expect(r.missing.map((m) => [m.song.id, m.why])).toEqual([
      ["j", "No sheet on any copy"],
      ["team", "Hymn book 28 has a sheet under “PĂNG RÊH”"],
      ["gone", "Page missing from the scanned hymn book"],
      ["blank", "No sheet on any copy"],
    ]);
  });
  it("leaves out a song when one of its copies has a sheet", () => {
    expect(withoutSheet([sheet, song("copy", { number: "28", title: "Păng Rêh" })]).missing).toEqual([]);
  });
});
