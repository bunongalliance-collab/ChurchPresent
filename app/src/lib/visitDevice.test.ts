import { describe, expect, it } from "vitest";
import { deviceName } from "../../api/_visit-core.js";

describe("deviceName", () => {
  it("names common phones and computers", () => {
    expect(deviceName("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1")).toBe("iPhone · Safari");
    expect(deviceName("Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36")).toBe("Android phone · Chrome");
    expect(deviceName("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36 Edg/120.0")).toBe("Windows · Edge");
    expect(deviceName("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) Gecko/20100101 Firefox/120.0")).toBe("Mac · Firefox");
    expect(deviceName("")).toBe("Unknown device · Browser");
  });
});
