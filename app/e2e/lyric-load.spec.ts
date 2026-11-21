import { expect, test } from "@playwright/test";

// The Lyric page's song list must never stay on "Loading songs…": when the connection stalls,
// it falls back to the copy saved on this device after a short wait.
test("a stalled connection falls back to the saved song list", async ({ page }) => {
  test.setTimeout(60000);
  await page.goto("/#");
  // First visit: the list loads and is saved on the device
  const toggle = page.locator(".lv2-lib-toggle");
  if (await toggle.isVisible()) await toggle.click();
  await expect(page.locator(".lv2-songs .lv2-song-name").first()).toBeVisible({ timeout: 15000 });
  await page.waitForTimeout(1500); // let the saved copy finish writing

  // Now the song list request hangs (never answers)
  await page.route("**/rest/v1/lyric_songs*", () => { /* no reply */ });
  await page.reload();
  if (await toggle.isVisible() && (await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
  await expect(page.locator(".lv2-list-note", { hasText: "Loading songs" })).toBeHidden({ timeout: 20000 });
  await expect(page.locator(".lv2-songs .lv2-song-name").first()).toBeVisible();
});
