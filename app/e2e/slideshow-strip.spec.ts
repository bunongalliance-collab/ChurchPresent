import { expect, test } from "@playwright/test";

// "Your slideshow" lists what was added on any page this session, and the Builder receives every added reading.
// (Readings can be added without signing in; songs and studies need a signed-in team member.)
test("added items follow you from page to page and all readings reach the Builder", async ({ page }) => {
  await page.goto("/#readings-v2");
  const toggle = page.locator(".lv2-lib-toggle");
  const openList = async () => { if (await toggle.isVisible() && (await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click(); };
  const add = page.locator(".lv2-add-head");
  const names = page.locator(".lv2-songs .lv2-song-name");

  await openList();
  // The list shows "01. TITLE"; the slideshow shows the title (in Title Case)
  const titleOf = async (i: number) => ((await names.nth(i).innerText()).replace(/^\s*\d+\.\s*/, "").trim());
  const first = await titleOf(0);
  await names.nth(0).click();
  await add.click();
  await expect(add).toHaveText("✓ Added");
  await openList();
  const second = await titleOf(3);
  await names.nth(3).click();
  await add.click();
  await expect(add).toHaveText("✓ Added");

  const strip = page.locator(".lv2-show");
  for (const hash of ["#", "#scripture", "#readings-v2"]) {
    await page.goto(`/${hash}`);
    await expect(strip).toContainText(first, { ignoreCase: true });
    await expect(strip).toContainText(second, { ignoreCase: true });
  }

  // The Builder adds both waiting readings, not only the last one
  await page.goto("/#builder");
  const draftTitles = async () => page.evaluate(() => (JSON.parse(sessionStorage.getItem("builderDraft") || "{}").items ?? []).map((i: { title?: string }) => i.title));
  const upper = async () => (await draftTitles()).map((t: string) => t.toLocaleUpperCase());
  await expect.poll(upper).toEqual(expect.arrayContaining([first.toLocaleUpperCase(), second.toLocaleUpperCase()]));
});
