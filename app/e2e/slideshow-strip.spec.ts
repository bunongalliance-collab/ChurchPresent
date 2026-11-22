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
  await names.nth(0).click();
  const first = (await page.locator(".lv2-editor input").first().inputValue()).trim();
  await add.click();
  await expect(add).toHaveText("✓ Added");
  await openList();
  await names.nth(3).click();
  const second = (await page.locator(".lv2-editor input").first().inputValue()).trim();
  await add.click();
  await expect(add).toHaveText("✓ Added");

  const strip = page.locator(".lv2-show");
  for (const hash of ["#", "#scripture", "#readings-v2"]) {
    await page.goto(`/${hash}`);
    await expect(strip).toContainText(first);
    await expect(strip).toContainText(second);
  }

  // The Builder adds both waiting readings, not only the last one
  await page.goto("/#builder");
  const draftTitles = async () => page.evaluate(() => (JSON.parse(sessionStorage.getItem("builderDraft") || "{}").items ?? []).map((i: { title?: string }) => i.title));
  await expect.poll(draftTitles).toEqual(expect.arrayContaining([first, second]));
});
