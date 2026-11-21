import { describe, expect, it } from "vitest";
import { matchSong, pickRecent, recentStudyIds, songLabel, splitLabel } from "./recentSongs";
import { linksFromLines, songIdsFromLines, type Lines } from "./orderLines";

const library = ["a", "b", "c", "d"].map((id) => ({ id, title: id.toUpperCase() }));

describe("recent songs", () => {
  it("keeps the added order, skips hidden and unknown songs, and stops at the limit", () => {
    expect(pickRecent(library, ["c", "x", "a", "b"], []).map((s) => s.id)).toEqual(["c", "a", "b"]);
    expect(pickRecent(library, ["c", "a", "b"], ["a"]).map((s) => s.id)).toEqual(["c", "b"]);
    expect(pickRecent(library, ["d", "c", "b", "a"], [], 2).map((s) => s.id)).toEqual(["d", "c"]);
  });

  it("labels a song as number and title", () => {
    expect(songLabel("12", "Brah Yê-su")).toBe("12. Brah Yê-su");
    expect(songLabel("", "Brah Yê-su")).toBe("Brah Yê-su");
  });
});

describe("songs chosen in the program", () => {
  it("lists the linked song ids in service order, once each, ignoring typed and nested lines", () => {
    const lines: Lines = {
      0: [
        { id: "1", level: 0, text: "Opening Song" }, { id: "2", level: 1, text: "12. A", songId: "a" },
        { id: "3", level: 2, text: "Choir name" },
        { id: "4", level: 1, text: "typed by hand" },
      ],
      1: [
        { id: "5", level: 0, text: "Children Choir" }, { id: "6", level: 1, text: "5. B", songId: "b" },
        { id: "7", level: 1, text: "12. A", songId: "a" },
      ],
      3: [{ id: "8", level: 0, text: "Closing Song" }, { id: "9", level: 1, text: "9. C", songId: "c" }],
    };
    expect(songIdsFromLines(lines)).toEqual(["a", "b", "c"]);
    expect(songIdsFromLines(undefined)).toEqual([]);
  });
});

describe("recent scriptures and everything chosen in the program", () => {
  it("takes the 8 newest studies and drops the hidden ones", () => {
    const studies = Array.from({ length: 10 }, (_, i) => ({ id: `s${i}` }));
    expect([...recentStudyIds(studies, ["s1"])]).toEqual(["s0", "s2", "s3", "s4", "s5", "s6", "s7"]);
  });

  it("lists songs, readings and scriptures in service order, once each", () => {
    const lines: Lines = {
      0: [{ id: "1", level: 0, text: "Opening Song" }, { id: "2", level: 1, text: "12. A", songId: "a" }],
      1: [{ id: "3", level: 0, text: "Reading" }, { id: "4", level: 1, text: "Psalm reading", readingId: "r1" }],
      2: [
        { id: "5", level: 0, text: "Scripture Reading" }, { id: "6", level: 1, text: "Psalm 23", studyId: "st1" },
        { id: "7", level: 1, text: "Psalm 23", studyId: "st1" }, { id: "8", level: 2, text: "Reader name" },
      ],
    };
    expect(linksFromLines(lines)).toEqual([{ kind: "song", id: "a" }, { kind: "reading", id: "r1" }, { kind: "scripture", id: "st1" }]);
  });
});

describe("matching a song typed by hand", () => {
  const options = [
    { id: "a", value: "12. Brah Yê-su kơ lơm ia" },
    { id: "b", value: "518. NƠM BRAH RÊH N'HO RO" },
    { id: "c", value: "34. Brah Yê-su kơ lơm ia" },
    { id: "d", value: "7A. Gâp tâm rnê păng" },
  ];
  it("splits a label into number and title", () => {
    expect(splitLabel("12. Brah Yê-su")).toEqual({ number: "12", title: "Brah Yê-su" });
    expect(splitLabel("7A Gâp")).toEqual({ number: "7a", title: "Gâp" });
    expect(splitLabel("Gâp tâm rnê păng")).toEqual({ number: "", title: "Gâp tâm rnê păng" });
  });
  it("matches the exact label, ignoring case and punctuation", () => {
    expect(matchSong("12. brah yê-su kơ lơm ia", options)).toBe("a");
    expect(matchSong("518 Nơm Brah Rêh N'ho Ro", options)).toBe("b");
  });
  it("matches a number alone, and a title alone (the first listed song wins a tie)", () => {
    expect(matchSong("518", options)).toBe("b");
    expect(matchSong("7a", options)).toBe("d");
    expect(matchSong("Gâp tâm rnê păng", options)).toBe("d");
    expect(matchSong("Brah Yê-su kơ lơm ia", options)).toBe("a");
  });
  it("matches a part of a title only when it is unique, and never guesses otherwise", () => {
    expect(matchSong("tâm rnê", options)).toBe("d");
    expect(matchSong("Brah", options)).toBeUndefined();
    expect(matchSong("99. Something else", options)).toBeUndefined();
    expect(matchSong("", options)).toBeUndefined();
  });
});
