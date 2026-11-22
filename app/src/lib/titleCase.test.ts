import { describe, expect, it } from "vitest";
import { titleCase } from "../components/SlideshowStrip";

describe("titleCase", () => {
  it("capitalises each word and lowers the rest, keeping accents", () => {
    expect(titleCase("1. MÂT TON NAU BRAH AMOH YÊ-SU")).toBe("1. Mât Ton Nau Brah Amoh Yê-su");
    expect(titleCase("01. NƠM RHĂK NJÊNG NEH NTU")).toBe("01. Nơm Rhăk Njêng Neh Ntu");
    expect(titleCase("sunday thanksgiving")).toBe("Sunday Thanksgiving");
    expect(titleCase("“GIĂNG 3:16”")).toBe("“Giăng 3:16”");
  });
});
