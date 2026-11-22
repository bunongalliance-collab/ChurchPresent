import { expect, test } from "@playwright/test";

// Add to Presentation on the Readings page (adding works without signing in there):
// the button says "✓ Added" for a moment and a "✓ Added" message shows at the top.
// On phones the button floats at the bottom right, clear of the edge.
test("adding a reading confirms on the button and at the top", async ({ page }) => {
  await page.goto("/#readings-v2");
  const toggle = page.locator(".lv2-lib-toggle");
  if (await toggle.isVisible() && (await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
  await page.locator(".lv2-songs .lv2-song-name").first().click();
  const add = page.locator(".lv2-add-head");
  await expect(add).toBeVisible();
  const phone = (page.viewportSize()?.width ?? 1000) <= 720;
  if (phone) {
    const box = (await add.boundingBox())!;
    const vp = page.viewportSize()!;
    expect(vp.width - (box.x + box.width)).toBeGreaterThanOrEqual(12);
    expect(vp.height - (box.y + box.height)).toBeGreaterThanOrEqual(24);
    expect(box.height).toBeGreaterThanOrEqual(34);
  }
  await add.click();
  await expect(add).toHaveText("✓ Added");
  await expect(page.locator(".toast").first()).toContainText("✓ Added");
  await expect(add).toHaveText("+ Add to Presentation", { timeout: 5000 });
});
