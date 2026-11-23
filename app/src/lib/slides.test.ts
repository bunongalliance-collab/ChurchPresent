import { describe, expect, it } from "vitest";
import { LYRIC_BOX_H, LYRIC_LH, LYRIC_PT, buildDeck, fitLyricSize, lyricLineHeight, lyricSlides } from "./slides";

const VERSE = [
  "Mâu dơi he chuêl ôh nau Păng rŏng, mâu dơi chuêl nau Păng yỗ.",
  "Kah gĭt ƀa-ƀơ tâm rnê lah ueh, yor lah Păng Brah toyh Ngăn.",
  "Kah gĭt ƀa-ƀơ tâm rnê lah ueh, Yor lah Păng Brah toyh Ngăn.",
];
const words = (t: string[]) => t.join(" ").split(/\s+/).filter(Boolean);
const H = LYRIC_BOX_H; // 10 px padding on every side plus the label band
const cap = Math.floor(H / (LYRIC_PT * LYRIC_LH));

describe("lyric slides", () => {
  it("gives fonts with tall accents more line spacing", () => {
    expect(lyricLineHeight("Arial")).toBe(LYRIC_LH);
    expect(lyricLineHeight("Georgia")).toBeGreaterThan(LYRIC_LH);
  });

  it("keeps every word, accent and diacritic, in order", () => {
    const { slides } = lyricSlides([VERSE], "Arial", LYRIC_PT);
    expect(slides.flatMap((s) => words([...s]))).toEqual(words(VERSE));
  });

  it("uses one fixed size on every slide and never holds more rows than fit", () => {
    const long = Array.from({ length: 9 }, (_, i) => `${VERSE[i % 3]}`);
    const { slides } = lyricSlides([long], "Arial", LYRIC_PT);
    expect(slides.length).toBeGreaterThan(1);
    for (const s of slides) {
      expect(s.size).toBe(LYRIC_PT);
      expect(s.lineH).toBe(LYRIC_LH);
      expect(s.left).toBe(true);
      expect(s.rows!).toBeLessThanOrEqual(cap);
    }
  });

  it("flows the lines of a verse together as one paragraph", () => {
    const { slides } = lyricSlides([["Brah Yê-su", "kơ lơm ia"]], "Arial", LYRIC_PT);
    expect(slides).toHaveLength(1);
    expect([...slides[0]]).toEqual(["Brah Yê-su kơ lơm ia"]);
  });

  it("starts every block at the top, short or long", () => {
    const short = lyricSlides([["Brah Yê-su"]], "Arial", LYRIC_PT).slides[0];
    expect(short.vcenter).toBe(false);
    const long = lyricSlides([[...VERSE, ...VERSE]], "Arial", LYRIC_PT).slides[0];
    expect(long.vcenter).toBe(false);
  });

  it("fills the height inside 10 px padding and the label band before starting a new slide", () => {
    // 70 pt at 1.15 line spacing: (540 - 16 - 24) / 80.5 = 6 rows per slide
    const { slides } = lyricSlides([[...VERSE, ...VERSE, ...VERSE, ...VERSE]], "Arial", LYRIC_PT);
    expect(slides.length).toBeGreaterThan(1);
    expect(Math.max(...slides.map((s) => (s as unknown as { rows: number }).rows))).toBe(Math.floor(LYRIC_BOX_H / (LYRIC_PT * 1.15)));
  });

  it("never leaves a single row alone on the last slide of a verse", () => {
    for (let n = 1; n <= 14; n++) {
      const lines = Array.from({ length: n }, (_, i) => VERSE[i % 3]);
      const { slides } = lyricSlides([lines], "Arial", LYRIC_PT);
      if (slides.length > 1) expect(slides[slides.length - 1].rows!).toBeGreaterThanOrEqual(2);
      expect(slides.flatMap((s) => words([...s]))).toEqual(words(lines));
    }
  });

  it("keeps a word that is wider than the slide, and warns", () => {
    const wide = "Ƀ".repeat(60);
    const { slides, tooWide } = lyricSlides([["Brah", wide, "Yê-su"]], "Arial", LYRIC_PT);
    expect(tooWide).toBe(true);
    expect(slides.flatMap((s) => words([...s]))).toEqual(["Brah", wide, "Yê-su"]);
  });

  it("keeps the title and number on their own lines of the title slide", () => {
    const deck = buildDeck({
      lyrics: "Verse 1\nBrah Yê-su kơ lơm ia\n\nChorus\nHơ-ngăn Brah", font: "Arial", perSlide: 4, removeRepeats: false,
      showTitle: true, songTitle: "Mât ton", songNumber: "4", customSize: 0, keepLines: true, fill: true,
    });
    expect([...deck.slides[0]]).toEqual(["Mât ton", "#4"]);
    expect(deck.slides.every((s) => s.size === LYRIC_PT)).toBe(true);
    expect(deck.slides.map((s) => s.label).filter(Boolean).length).toBeGreaterThan(0);
  });

  it("fit finds a size at which every verse is one slide, or 70 when they already are", () => {
    const small = fitLyricSize({ lyrics: "Verse 1\nBrah Yê-su kơ lơm ia", removeRepeats: false, font: "Arial" });
    expect(small).toBe(LYRIC_PT);
    const big = fitLyricSize({ lyrics: `Verse 1\n${[...VERSE, ...VERSE].join("\n")}`, removeRepeats: false, font: "Arial" });
    expect(big).toBeLessThan(LYRIC_PT);
    const deck = buildDeck({
      lyrics: `Verse 1\n${[...VERSE, ...VERSE].join("\n")}`, font: "Arial", perSlide: 4, removeRepeats: false,
      showTitle: false, songTitle: "", songNumber: "", customSize: big, keepLines: true, fill: true,
    });
    expect(deck.slides).toHaveLength(1);
  });
});
