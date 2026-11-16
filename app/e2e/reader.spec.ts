import { expect, test } from "@playwright/test";

// The Nau Mpro reader: its own page, songs from the library, lyrics on tap.
test("the reader lists songs and opens one", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto("/nau-mpro/");
  await expect(page).toHaveTitle("Nau Mpro");
  const rows = page.locator(".nm-row");
  await expect(rows.first()).toBeVisible({ timeout: 15000 });
  await expect(page.locator(".nm-saved")).toContainText("song");
  await rows.first().click();
  await expect(page.locator(".nm-htitle")).toBeVisible();
  await expect(page).toHaveURL(/#song-/);
  // Phones: the lyrics replace the list, and Back returns to the list
  if ((page.viewportSize()?.width ?? 1000) <= 760) {
    await expect(page.locator(".nm-side")).toBeHidden();
    await page.goBack();
    await expect(page.locator(".nm-side")).toBeVisible();
  }
  expect(errors).toEqual([]);
});

test("search ignores accents", async ({ page }) => {
  await page.goto("/nau-mpro/");
  await expect(page.locator(".nm-row").first()).toBeVisible({ timeout: 15000 });
  const count = await page.locator(".nm-row").count();
  await page.getByRole("searchbox", { name: "Search songs" }).fill("zzqx-no-such-song");
  await expect(page.locator(".nm-empty")).toContainText("No songs match");
  await page.getByRole("searchbox", { name: "Search songs" }).fill("");
  await expect(page.locator(".nm-row")).toHaveCount(count);
});
