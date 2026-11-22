import { expect, test } from "@playwright/test";

// Only one screen window is live. Each Present (or Show on second screen) opens a new one; the newest takes over
// and older ones stop, so the presenter view, the phone and the Recorder all follow the same slide.
const deck = {
  font: "Arial", size: 60, bg: "#0b2a4a", fg: "#ffffff", showLabels: true,
  slides: [{ rows: ["Welcome"] }, { rows: ["Hymn line one"] }, { rows: ["Hymn line two"] }, { rows: ["John 3:16"] }],
  outline: [{ title: "Welcome", first: 0, count: 1 }, { title: "12. Hymn", first: 1, count: 2 }, { title: "Scripture", first: 3, count: 1 }],
};

test("the newest screen window takes over and the presenter follows it both ways", async ({ context }) => {
  const old = await context.newPage();
  await old.goto("/");
  await old.evaluate((d) => { localStorage.setItem("lyricsDeck", JSON.stringify(d)); sessionStorage.setItem("projectorIndex", "0"); }, deck);
  await old.goto("/#projector");
  await expect(old.locator(".counter")).toHaveText("1 / 4");

  const screen = await context.newPage();
  await screen.goto("/");
  await screen.evaluate(() => sessionStorage.setItem("projectorIndex", "1"));
  await screen.goto("/#projector");
  await expect(screen.locator(".counter")).toHaveText("2 / 4");
  await expect(old.getByText(/showing in another window/)).toBeVisible();

  const presenter = await context.newPage();
  await presenter.goto("/#projector:presenter");
  const nav = presenter.getByRole("navigation", { name: "Order of worship" });
  await expect(nav.getByRole("button", { name: /12\. Hymn/ })).toHaveAttribute("aria-current", "true");

  // Presenter → screen
  await presenter.getByRole("button", { name: "Next →" }).click();
  await expect(screen.locator(".counter")).toHaveText("3 / 4");
  // Screen (keys or clicks there) → presenter, and it stays there across several check-ins
  await screen.keyboard.press("ArrowRight");
  await expect(nav.getByRole("button", { name: /Scripture/ })).toHaveAttribute("aria-current", "true");
  await presenter.waitForTimeout(4500);
  await expect(nav.getByRole("button", { name: /Scripture/ })).toHaveAttribute("aria-current", "true");

  // The Recorder's lower third follows the live window too, not the old one
  const recorder = await context.newPage();
  await recorder.goto("/#recorder");
  const now = recorder.locator(".rc-now");
  await expect(now).toContainText("Scripture");
  await presenter.getByRole("button", { name: "← Previous" }).click();
  await expect(screen.locator(".counter")).toHaveText("3 / 4");
  await expect(now).toContainText("12. Hymn");
  await recorder.waitForTimeout(4500);
  await expect(now).toContainText("12. Hymn");
});
