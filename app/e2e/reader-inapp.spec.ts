import { expect, test } from "@playwright/test";

// Opening the Nau Mpro link from Facebook, Messenger or Instagram (their in-app browser cannot install apps).
test.skip(({ isMobile }) => isMobile, "run once, in the desktop project");

const FB_ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/460.0.0.0;]";
const MESSENGER_IOS = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/MessengerForiOS;FBAV/450.0;FBBV/1;FBDV/iPhone15,2;FBMD/iPhone;FBSN/iOS;FBSV/17.4;FBSS/3;FBCR/;FBID/phone;FBLC/en_US;FBOP/5]";
const dialog = (page: import("@playwright/test").Page) => page.getByRole("dialog", { name: "Open in your browser" });

test.describe("Facebook on Android", () => {
  test.use({ userAgent: FB_ANDROID, viewport: { width: 412, height: 915 }, hasTouch: true });

  test("tries Chrome once by itself, and offers an Open in Chrome button", async ({ page }) => {
    await page.goto("/nau-mpro/");
    await expect(dialog(page)).toBeVisible();
    expect(await page.evaluate(() => sessionStorage.getItem("nmOpenedInChrome"))).toBe("1");
    const link = dialog(page).getByRole("link", { name: "Open in Chrome" });
    const href = (await link.getAttribute("href"))!;
    expect(href).toMatch(/^intent:\/\/localhost:5173\/nau-mpro\/#Intent;scheme=http;package=com\.android\.chrome;/);
    expect(href).toContain("S.browser_fallback_url=" + encodeURIComponent("http://localhost:5173/nau-mpro/"));
    // The install offer does not show inside Facebook
    await expect(page.getByRole("dialog", { name: "Install Nau Mpro" })).toHaveCount(0);
    // Keep reading here closes it for this visit
    await dialog(page).getByRole("button", { name: "Keep reading here" }).click();
    await expect(dialog(page)).toBeHidden();
    await page.reload();
    await page.waitForTimeout(800);
    await expect(dialog(page)).toBeHidden();
  });
});

test.describe("Messenger on iPhone", () => {
  test.use({ userAgent: MESSENGER_IOS, viewport: { width: 390, height: 844 }, hasTouch: true });

  test("shows the Open in Safari steps and a Copy link button", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto("/nau-mpro/");
    await expect(dialog(page)).toBeVisible();
    await expect(dialog(page)).toContainText("inside Facebook");
    await expect(dialog(page)).toContainText("Open in Safari");
    await expect(page.getByRole("dialog", { name: "Install Nau Mpro" })).toHaveCount(0);
    await dialog(page).getByRole("button", { name: "Copy link" }).click();
    await expect(dialog(page).getByRole("button", { name: /Link copied/ })).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("http://localhost:5173/nau-mpro/");
    await page.keyboard.press("Escape");
    await expect(dialog(page)).toBeHidden();
  });
});

test("a normal browser never sees the notice", async ({ page }) => {
  await page.goto("/nau-mpro/");
  await expect(page.locator(".nm-list .nm-row").first()).toBeVisible({ timeout: 15000 });
  await page.waitForTimeout(800);
  await expect(dialog(page)).toHaveCount(0);
});
