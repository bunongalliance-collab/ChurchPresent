import { describe, expect, it } from "vitest";
import { parseRich, stripMarkers } from "./richtext";

describe("richtext", () => {
  it("parses bold markers into a bold segment", () => {
    const segs = parseRich("**hello** world");
    expect(segs.find((s) => s.text === "hello")?.bold).toBe(true);
  });

  it("strips formatting markers from plain text", () => {
    expect(stripMarkers("**hi** ~~there~~")).toBe("hi there");
  });
});
