import { expect, test, type Page } from "@playwright/test";

// The install offer is tested in reader-install.spec.ts; keep it out of the way here
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { try { localStorage.setItem("nmInstallSnooze", String(Date.now() + 864e5)); } catch { /* ignore */ } });
});

// Every way to move around the Nau Mpro reader, and every button, at desktop, tablet and phone sizes.
// Uses the real library: hymn 10 has a two-page score, hymn 1 is the first song.

const errorsOf = (page: Page) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  return errors;
};

// Open a hymn by typing its number and pressing Enter
async function openHymn(page: Page, n: string) {
  const search = page.getByRole("searchbox", { name: "Search songs" });
  await search.fill(n);
  await search.press("Enter");
  await expect(page.locator(".nm-hnum")).toHaveText(n);
  await search.fill("");
  // Typing while a song is open opens the drawer on tablets and phones: Escape closes it
  await search.press("Escape");
  await expect(page.locator(".nm-scrim")).toBeHidden();
}

// A list row by its hymn number (the row text runs the number into the title, so match the number cell)
const row = (page: Page, n: string) => page.locator(".nm-row").filter({ has: page.locator(".nm-num", { hasText: new RegExp(`^${n}$`) }) }).first();

// Swipe sideways on an element with real touch events
async function swipe(page: Page, selector: string, dx: number) {
  await page.locator(selector).evaluate((el, dx) => {
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const t = (cx: number) => new Touch({ identifier: 1, target: el, clientX: cx, clientY: y });
    el.dispatchEvent(new TouchEvent("touchstart", { touches: [t(x)], changedTouches: [t(x)], bubbles: true }));
    el.dispatchEvent(new TouchEvent("touchend", { touches: [], changedTouches: [t(x + dx)], bubbles: true }));
  }, dx);
}

async function start(page: Page) {
  await page.goto("/nau-mpro/");
  await expect(page.locator(".nm-row").first()).toBeVisible({ timeout: 15000 });
}

test.describe("desktop", () => {
  test.skip(({ isMobile }) => isMobile, "desktop only");
  test.use({ viewport: { width: 1400, height: 860 } });

  test("list, next and previous, keyboard, search", async ({ page }) => {
    const errors = errorsOf(page);
    await start(page);
    await openHymn(page, "10");
    // Three panes at once
    await expect(page.locator(".nm-side")).toBeVisible();
    await expect(page.locator(".nm-lyrics")).toBeVisible();
    await expect(page.locator(".nm-score")).toBeVisible();
    await expect(page.locator(".nm-row.sel")).toContainText("10");
    // Next and previous buttons
    await page.getByRole("button", { name: /^Next song/ }).click();
    await expect(page.locator(".nm-hnum")).toHaveText("11");
    await page.getByRole("button", { name: /^Previous song/ }).click();
    await expect(page.locator(".nm-hnum")).toHaveText("10");
    // Arrow keys
    await page.locator(".nm-lyrics").click({ position: { x: 5, y: 5 } });
    await page.keyboard.press("ArrowRight");
    await expect(page.locator(".nm-hnum")).toHaveText("11");
    await page.keyboard.press("ArrowLeft");
    await expect(page.locator(".nm-hnum")).toHaveText("10");
    // Picking from the list
    await row(page, "1").click();
    await expect(page.locator(".nm-hnum")).toHaveText("1");
    // The first song in the book has no previous song
    await page.locator(".nm-row").first().click();
    await expect(page.getByRole("button", { name: "No previous song" })).toBeDisabled();
    // Search by words, ignoring accents
    await page.getByRole("searchbox", { name: "Search songs" }).fill("gap tam rne pang");
    await expect(page.locator(".nm-row").first()).toContainText("GÂP TÂM RNÊ PĂNG");
    expect(errors).toEqual([]);
  });

  test("score images, play mode, zoom, systems, text size, dark mode", async ({ page }) => {
    const errors = errorsOf(page);
    await start(page);
    await openHymn(page, "10");
    // Two scan images, both loaded
    const imgs = page.locator(".nm-score img");
    await expect(imgs).toHaveCount(2);
    await expect.poll(() => imgs.first().evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)).toBe(true);
    // Key, time, chords shown
    await expect(page.locator(".nm-facts")).toContainText("Key");
    await expect(page.locator(".nm-chords span").first()).toBeVisible();
    // Text size buttons
    const before = await page.locator(".nm-song").evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    await page.getByRole("button", { name: "Bigger text" }).click();
    expect(await page.locator(".nm-song").evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThan(before);
    await page.getByRole("button", { name: "Smaller text" }).click();
    expect(await page.locator(".nm-song").evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBe(before);
    // Play mode hides the list and lyrics
    await page.getByRole("button", { name: /Play/ }).click();
    await expect(page.locator(".nm-side")).toBeHidden();
    await expect(page.locator(".nm-lyrics")).toBeHidden();
    const bar = page.getByRole("toolbar", { name: "Play controls" });
    await expect(bar).toBeVisible();
    // Zoom in, out, fit
    await bar.getByRole("button", { name: "Zoom in" }).click();
    await expect(bar.locator(".nm-zoom")).toHaveText("110%");
    await bar.getByRole("button", { name: "Zoom out" }).click();
    await bar.getByRole("button", { name: "Zoom out" }).click();
    await expect(bar.locator(".nm-zoom")).toHaveText("90%");
    await bar.getByRole("button", { name: "Fit" }).click();
    await expect(bar.locator(".nm-zoom")).toHaveText("100%");
    // Next and previous system scroll the score
    const score = page.locator(".nm-score");
    await bar.getByRole("button", { name: "Next system" }).click();
    await expect.poll(() => score.evaluate((el) => el.scrollTop)).toBeGreaterThan(50);
    const down = await score.evaluate((el) => el.scrollTop);
    await bar.getByRole("button", { name: "Previous system" }).click();
    await expect.poll(() => score.evaluate((el) => el.scrollTop)).toBeLessThan(down);
    // Keyboard in play mode: down moves a system, Escape leaves
    await page.keyboard.press("ArrowDown");
    await expect.poll(() => score.evaluate((el) => el.scrollTop)).toBeGreaterThan(20);
    await page.keyboard.press("Escape");
    await expect(bar).toBeHidden();
    await expect(page.locator(".nm-lyrics")).toBeVisible();
    // Done button also leaves play mode
    await page.getByRole("button", { name: /Play/ }).click();
    await bar.getByRole("button", { name: "Done" }).click();
    await expect(bar).toBeHidden();
    // Dark mode
    await page.getByRole("button", { name: "Dark mode" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.getByRole("button", { name: "Dark mode" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    expect(errors).toEqual([]);
  });
});

test.describe("tablet landscape", () => {
  test.skip(({ isMobile }) => isMobile, "run once, in the desktop project");
  test.use({ viewport: { width: 1180, height: 820 }, hasTouch: true });

  test("drawer, lyrics beside score, swipe", async ({ page }) => {
    const errors = errorsOf(page);
    await start(page);
    await openHymn(page, "10");
    await expect(page.locator(".nm-lyrics")).toBeVisible();
    await expect(page.locator(".nm-score")).toBeVisible();
    await expect(page.locator(".nm-tabs")).toBeHidden();
    // The list is a drawer: closed, then open, then closed by the scrim
    await expect(page.locator(".nm-side")).toBeHidden();
    await page.getByRole("button", { name: "Songs", exact: true }).click();
    await expect(page.locator(".nm-side")).toBeVisible();
    await expect(page.locator(".nm-row.sel")).toContainText("10");
    await page.mouse.click(1150, 400);
    await expect(page.locator(".nm-side")).toBeHidden();
    // Picking a song in the drawer closes it
    await page.getByRole("button", { name: "Songs", exact: true }).click();
    await row(page, "12").click();
    await expect(page.locator(".nm-hnum")).toHaveText("12");
    await expect(page.locator(".nm-side")).toBeHidden();
    // Swipe left = next song, right = previous
    await swipe(page, ".nm-lyrics", -200);
    await expect(page.locator(".nm-hnum")).toHaveText("13");
    await swipe(page, ".nm-score", 200);
    await expect(page.locator(".nm-hnum")).toHaveText("12");
    // A short or slow drag does not change song
    await swipe(page, ".nm-lyrics", -30);
    await expect(page.locator(".nm-hnum")).toHaveText("12");
    expect(errors).toEqual([]);
  });
});

test.describe("tablet portrait", () => {
  test.skip(({ isMobile }) => isMobile, "run once, in the desktop project");
  test.use({ viewport: { width: 820, height: 1180 }, hasTouch: true });

  test("tabs switch lyrics and score", async ({ page }) => {
    await start(page);
    await openHymn(page, "10");
    await expect(page.locator(".nm-tabs")).toBeVisible();
    await expect(page.locator(".nm-lyrics")).toBeVisible();
    await expect(page.locator(".nm-score")).toBeHidden();
    await page.getByRole("tab", { name: "Score" }).click();
    await expect(page.locator(".nm-score")).toBeVisible();
    await expect(page.locator(".nm-lyrics")).toBeHidden();
    await page.getByRole("tab", { name: "Lyrics" }).click();
    await expect(page.locator(".nm-lyrics")).toBeVisible();
    // Play from the Lyrics tab opens the score; Done keeps the score tab
    await page.getByRole("button", { name: /Play/ }).click();
    await expect(page.locator(".nm-score")).toBeVisible();
    await expect(page.locator(".nm-tabs")).toBeHidden();
    await page.getByRole("toolbar", { name: "Play controls" }).getByRole("button", { name: "Done" }).click();
    await expect(page.getByRole("tab", { name: "Score" })).toHaveAttribute("aria-selected", "true");
  });
});

test.describe("phone", () => {
  test.skip(({ isMobile }) => !isMobile, "phone only");

  test("open, back, tabs, next and previous, swipe, play controls fit", async ({ page }) => {
    const errors = errorsOf(page);
    await start(page);
    // The list fills the screen; tapping a song opens it
    await row(page, "10").click();
    await expect(page.locator(".nm-hnum")).toHaveText("10");
    await expect(page.locator(".nm-side")).toBeHidden();
    await expect(page.locator(".nm-htitle")).toBeVisible();
    // Tabs
    await page.getByRole("tab", { name: "Score" }).click();
    await expect(page.locator(".nm-score img").first()).toBeVisible();
    await page.getByRole("tab", { name: "Lyrics" }).click();
    // Next, previous, swipe
    await page.getByRole("button", { name: /^Next song/ }).click();
    await expect(page.locator(".nm-hnum")).toHaveText("11");
    await page.getByRole("button", { name: /^Previous song/ }).click();
    await expect(page.locator(".nm-hnum")).toHaveText("10");
    await swipe(page, ".nm-lyrics", -200);
    await expect(page.locator(".nm-hnum")).toHaveText("11");
    // Play controls fit inside the screen
    await page.getByRole("button", { name: /Play/ }).click();
    const bar = page.getByRole("toolbar", { name: "Play controls" });
    const box = await bar.boundingBox();
    const vw = page.viewportSize()!.width;
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(vw);
    // Zoomed in, swiping does not change song (it moves around the score instead)
    await bar.getByRole("button", { name: "Zoom in" }).click();
    await swipe(page, ".nm-score", -200);
    await expect(page.locator(".nm-hnum")).toHaveText("11");
    await bar.getByRole("button", { name: "Done" }).click();
    // Back returns to the list (the in-app button and the phone's Back)
    await page.getByRole("button", { name: "Back to songs" }).click();
    await expect(page.locator(".nm-side")).toBeVisible();
    await page.locator(".nm-row").first().click();
    await page.goBack();
    await expect(page.locator(".nm-side")).toBeVisible();
    // Nothing is wider than the screen
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  });
});
