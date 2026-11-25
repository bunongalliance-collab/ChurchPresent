import { describe, expect, it } from "vitest";
import { lostAccess, mayDeleteWork, shownInChurch } from "./access";

describe("shownInChurch", () => {
  it("lists the chosen church's work and your own with no church", () => {
    expect(shownInChurch("a", "a")).toBe(true);
    expect(shownInChurch(null, "a")).toBe(true);
    expect(shownInChurch("b", "a")).toBe(false);
  });
  it("lists everything when no church is chosen", () => expect(shownInChurch("b", null)).toBe(true));
});

describe("mayDeleteWork", () => {
  const admin = ["a"];
  it("lets the maker delete", () => expect(mayDeleteWork({ owner: "me", church: "b" }, "me", admin)).toBe(true));
  it("lets an admin of that church delete", () => expect(mayDeleteWork({ owner: "them", church: "a" }, "me", admin)).toBe(true));
  it("stops an editor deleting someone else's", () => expect(mayDeleteWork({ owner: "them", church: "b" }, "me", admin)).toBe(false));
  it("needs a signed-in account", () => expect(mayDeleteWork({ owner: "", church: null }, null, admin)).toBe(false));
});

describe("lostAccess", () => {
  it("is false while the open item is still listed, or nothing saved is open", () => {
    expect(lostAccess("1", "them", "me", ["1"])).toBe(false);
    expect(lostAccess("", "them", "me", [])).toBe(false);
  });
  it("is true when someone else's open item is no longer listed", () => expect(lostAccess("1", "them", "me", ["2"])).toBe(true));
  it("treats an unknown maker as someone else", () => expect(lostAccess("1", "", "me", [])).toBe(true));
  it("keeps your own open item (it may be waiting to upload, or was removed in another tab)", () => expect(lostAccess("1", "me", "me", [])).toBe(false));
});
