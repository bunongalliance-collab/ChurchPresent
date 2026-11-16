import { expect, test, type Page } from "@playwright/test";

// The Nau Mpro install offer and install count. Chrome only offers installs on the live HTTPS site,
// so these tests send the page the same "beforeinstallprompt" event Chrome sends.
test.skip(({ isMobile }) => isMobile, "run once, in the desktop project");

async function offerInstall(page: Page, outcome: "accepted" | "dismissed") {
  await page.evaluate((outcome) => {
    const e = new Event("beforeinstallprompt", { cancelable: true }) as Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
    e.prompt = async () => { (window as unknown as { prompted: boolean }).prompted = true; };
    e.userChoice = Promise.resolve({ outcome });
    window.dispatchEvent(e);
  }, outcome);
}
const dialog = (page: Page) => page.getByRole("dialog", { name: "Install Nau Mpro" });

test("Chrome: offer in the middle, Install opens the browser's install, then never again", async ({ page }) => {
  await page.goto("/nau-mpro/");
  await offerInstall(page, "accepted");
  await expect(dialog(page)).toBeVisible();
  // Centred on the screen
  const box = (await dialog(page).boundingBox())!;
  const vp = page.viewportSize()!;
  expect(Math.abs(box.x + box.width / 2 - vp.width / 2)).toBeLessThan(4);
  expect(Math.abs(box.y + box.height / 2 - vp.height / 2)).toBeLessThan(40);
  await dialog(page).getByRole("button", { name: "Install app" }).click();
  await expect(dialog(page)).toBeHidden();
  expect(await page.evaluate(() => (window as unknown as { prompted?: boolean }).prompted)).toBe(true);
  // Installed: the offer does not come back
  await page.reload();
  await offerInstall(page, "accepted");
  await page.waitForTimeout(1600);
  await expect(dialog(page)).toBeHidden();
});

test("Not now hides the offer, and Escape does too", async ({ page }) => {
  await page.goto("/nau-mpro/");
  await offerInstall(page, "dismissed");
  await page.getByRole("button", { name: "Not now" }).click();
  await expect(dialog(page)).toBeHidden();
  await page.reload();
  await offerInstall(page, "dismissed");
  await page.waitForTimeout(1600);
  await expect(dialog(page)).toBeHidden();
  // A new visitor: Escape also means Not now
  await page.evaluate(() => localStorage.removeItem("nmInstallSnooze"));
  await page.reload();
  await offerInstall(page, "dismissed");
  await expect(dialog(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog(page)).toBeHidden();
});

test.describe("iPhone", () => {
  test.use({ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1", viewport: { width: 390, height: 844 }, hasTouch: true });

  test("shows the Add to Home Screen steps; I added it hides it for good", async ({ page }) => {
    await page.goto("/nau-mpro/");
    await expect(dialog(page)).toBeVisible();
    await expect(dialog(page)).toContainText("Add to Home Screen");
    await page.getByRole("button", { name: "I added it" }).click();
    await expect(dialog(page)).toBeHidden();
    await page.reload();
    await page.waitForTimeout(1600);
    await expect(dialog(page)).toBeHidden();
  });
});

test.describe("opened from the home screen", () => {
  test("counts the install once, and shows no offer", async ({ page }) => {
    const posts: string[] = [];
    await page.route("**/api/install", async (route) => { posts.push(route.request().postData() ?? ""); await route.fulfill({ status: 204 }); });
    // Pretend the page runs as the installed app
    await page.addInitScript(() => {
      const real = window.matchMedia.bind(window);
      window.matchMedia = (q: string) => (q.includes("display-mode: standalone") ? { ...real(q), matches: true } as MediaQueryList : real(q));
    });
    await page.goto("/nau-mpro/");
    await expect.poll(() => posts.length).toBe(1);
    const sent = JSON.parse(posts[0]);
    expect(sent.how).toBe("home screen");
    expect(sent.installId).toMatch(/^[a-z0-9-]{8,64}$/i);
    await offerInstall(page, "accepted");
    await page.waitForTimeout(1600);
    await expect(dialog(page)).toBeHidden();
    // Opening the app again does not count again
    await page.reload();
    await page.waitForTimeout(800);
    expect(posts).toHaveLength(1);
  });
});
