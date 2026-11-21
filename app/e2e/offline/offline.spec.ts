import { expect, test } from "@playwright/test";

// Every page must open with no network: the app code comes from the service worker cache,
// and each page's data comes from the copy saved while online.
const routes = [
  "#lyrics-v2", "#readings-v2", "#program", "#program-simple", "#scripture", "#builder",
  "#presentations", "#projector", "#notes", "#thumbnail",
];

test("every page opens offline after one online visit", async ({ page, context }) => {
  test.setTimeout(180000);
  // 1. Online: load each page so the service worker and data caches are filled
  await page.goto("/");
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 30000 });
  for (const r of routes) {
    await page.goto("/" + r);
    await page.waitForLoadState("networkidle");
  }

  // 2. Offline: reload each page and check it still renders
  await context.setOffline(true);
  // Sanity check: the network really is off, so a page that loads has its own copy
  const reached = await page.evaluate(() => fetch("https://example.com/", { cache: "no-store" }).then(() => true, () => false));
  expect(reached).toBe(false);
  const failures: string[] = [];
  for (const r of routes) {
    const errors: string[] = [];
    const onErr = (e: Error) => errors.push(e.message);
    page.on("pageerror", onErr);
    try {
      await page.goto("/" + r, { waitUntil: "domcontentloaded", timeout: 20000 });
      // The projector output is a full-screen view with no navbar; every other page has one
      if (r !== "#projector") await expect(page.getByRole("navigation", { name: "Main" })).toBeVisible({ timeout: 10000 });
      const text = (await page.locator("#root").innerText()).trim();
      if (!text) failures.push(`${r}: blank page`);
      if (errors.length) failures.push(`${r}: ${errors.join("; ")}`);
    } catch (e) {
      failures.push(`${r}: ${(e as Error).message.split("\n")[0]}`);
    } finally {
      page.off("pageerror", onErr);
    }
  }
  expect(failures).toEqual([]);
});


// The Nau Mpro reader is its own page: it must open offline with the hymn book saved on the device
test('the Nau Mpro reader opens offline with saved songs', async ({ page, context }) => {
  test.setTimeout(120000);
  await page.goto('/nau-mpro/');
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 30000 });
  await expect(page.locator('.nm-list .nm-row').first()).toBeVisible({ timeout: 20000 });
  await expect(page.locator('.nm-saved')).toContainText('Saved for offline');
  await context.setOffline(true);
  await page.goto('/nau-mpro/', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveTitle('Nau Mpro');
  await expect(page.locator('.nm-list .nm-row').first()).toBeVisible({ timeout: 15000 });
  await page.locator('.nm-list .nm-row').first().click();
  await expect(page.locator('.nm-htitle')).toBeVisible();
});
