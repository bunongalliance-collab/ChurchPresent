import { expect, test } from "@playwright/test";

// The presenter window drives the audience window: Next, jumping to an item, Logo screen and Clear text
const deck = {
  font: "Arial", size: 60, bg: "#0b2a4a", fg: "#ffffff", showLabels: true,
  slides: [{ rows: ["Welcome"] }, { rows: ["Hymn line one"] }, { rows: ["Hymn line two"] }, { rows: ["John 3:16"], ref: "John 3:16" }],
  outline: [{ title: "Welcome", first: 0, count: 1 }, { title: "12. Hymn", first: 1, count: 2 }, { title: "Scripture", first: 3, count: 1 }],
};

test("presenter controls the audience window", async ({ context }) => {
  const audience = await context.newPage();
  await audience.goto("/");
  await audience.evaluate((d) => { localStorage.setItem("lyricsDeck", JSON.stringify(d)); sessionStorage.setItem("projectorIndex", "0"); }, deck);
  await audience.goto("/#projector");
  await expect(audience.locator(".counter")).toHaveText("1 / 4");

  const presenter = await context.newPage();
  await presenter.goto("/#projector:presenter");
  await expect(presenter.getByText("Screen connected")).toBeVisible();
  await expect(presenter.getByRole("navigation", { name: "Order of worship" }).getByRole("button", { name: /Welcome/ })).toHaveAttribute("aria-current", "true");

  await presenter.getByRole("button", { name: "Next →" }).click();
  await expect(audience.locator(".counter")).toHaveText("2 / 4");
  await expect(presenter.getByRole("navigation", { name: "Order of worship" }).getByRole("button", { name: /12\. Hymn/ })).toHaveAttribute("aria-current", "true");
  await expect(presenter.locator(".prv-thumb")).toHaveCount(2);

  await presenter.getByRole("navigation", { name: "Order of worship" }).getByRole("button", { name: /Scripture/ }).click();
  await expect(audience.locator(".counter")).toHaveText("4 / 4");

  await presenter.getByRole("button", { name: "Logo screen (L)" }).click();
  await expect(audience.locator(".projector-logo")).toBeVisible();
  await presenter.getByRole("button", { name: "Logo screen (L)" }).click();

  await presenter.getByRole("button", { name: "Clear text (C)" }).click();
  await expect(audience.locator(".stage .text")).toHaveText("");
  await expect(audience.locator(".ref-tag")).toHaveCount(0);
  await presenter.getByRole("button", { name: "Clear text (C)" }).click();
  await expect(audience.locator(".stage .text")).toContainText("John 3:16");

  // Clicker extras: "." blanks the screen; the scroll wheel moves back and forward
  await presenter.keyboard.press(".");
  await expect(audience.locator(".projector-blackout")).toBeVisible();
  await presenter.keyboard.press(".");
  await presenter.locator(".prv-now").hover();
  await presenter.mouse.wheel(0, -120);
  await expect(audience.locator(".counter")).toHaveText("3 / 4");
  await presenter.waitForTimeout(700);
  await presenter.mouse.wheel(0, 120);
  await expect(audience.locator(".counter")).toHaveText("4 / 4");
});
