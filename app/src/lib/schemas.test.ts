import { describe, expect, it } from "vitest";
import { parseRows, songRowSchema } from "./schemas";

describe("schemas", () => {
  it("fills missing text and drops rows without an id", () => {
    const { rows, dropped } = parseRows(songRowSchema, [
      { id: "a", title: "Hymn", song_number: null, owner_id: null, look: null, category: null, language: null },
      { title: "No id" },
    ]);
    expect(dropped).toBe(1);
    expect(rows[0].song_number).toBe("");
    expect(rows[0].look).toEqual({});
  });
});
