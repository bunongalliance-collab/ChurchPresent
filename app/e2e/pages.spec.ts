import { expect, test } from "@playwright/test";

// Each entry: the hash route and a heading the page should show
const pages: { hash: string; heading: RegExp }[] = [
  { hash: "#lyrics-v2", heading: /Lyrics/i },
  { hash: "#readings-v2", heading: /Readings/i },
  { hash: "#program", heading: /Service program/i },
];

for (const p of pages) {
  test(`${p.hash} opens without console errors`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => { if (m.type() === "error" && !/Keys should be unique/.test(m.text())) errors.push(m.text()); });
    await page.goto("/" + p.hash);
    await expect(page.getByRole("heading", { name: p.heading }).first()).toBeVisible();
    expect(errors).toEqual([]);
  });
}

test("the navbar links to every main page", async ({ page }) => {
  await page.goto("/");
  // On phones the links sit behind the hamburger menu
  const toggle = page.getByRole("button", { name: "Open menu" });
  if (await toggle.isVisible()) await toggle.click();
  for (const name of ["Lyric", "Readings", "Program", "Projector", "Notes"]) {
    await expect(page.getByRole("link", { name, exact: true })).toBeVisible();
  }
});
