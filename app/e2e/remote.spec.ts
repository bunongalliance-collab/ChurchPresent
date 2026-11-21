import { expect, test } from "@playwright/test";

// Phone remote: the phone page (#remote:<code>) controls the screen window through Supabase Realtime.
// This goes over the internet to the real Supabase project (broadcast only; nothing is stored).
const deck = {
  font: "Arial", size: 60, bg: "#0b2a4a", fg: "#ffffff", showLabels: true,
  slides: [{ rows: ["Welcome"] }, { rows: ["Hymn line one"] }, { rows: ["Hymn line two"] }],
  outline: [{ title: "Welcome", first: 0, count: 1 }, { title: "12. Hymn", first: 1, count: 2 }],
};
const CODE = "TESTE2E" + String.fromCharCode(65 + Math.floor(Math.random() * 20));

test("a phone controls the screen window", async ({ browser }) => {
  // The screen and the phone are separate devices: separate browser contexts share nothing but the channel
  const computer = await browser.newContext();
  const screen = await computer.newPage();
  await screen.goto("/");
  await screen.evaluate(([d, code]) => {
    localStorage.setItem("lyricsDeck", JSON.stringify(d));
    localStorage.setItem("remoteCode", code as string);
    sessionStorage.setItem("projectorIndex", "0");
  }, [deck, CODE] as const);
  await screen.goto("/#projector");
  await expect(screen.locator(".counter")).toHaveText("1 / 3");

  const phoneCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const phone = await phoneCtx.newPage();
  await phone.goto(`/#remote:${CODE}`);
  await expect(phone.getByText("Connected to the screen")).toBeVisible({ timeout: 20000 });
  await expect(phone.locator(".rm-text")).toHaveText("Welcome");
  await expect(phone.locator(".rm-next")).toContainText("Hymn line one");

  await phone.getByRole("button", { name: "Next ›" }).click();
  await expect(screen.locator(".counter")).toHaveText("2 / 3", { timeout: 10000 });
  await expect(phone.locator(".rm-cap")).toContainText("12. Hymn · slide 2 of 3");

  await phone.getByRole("button", { name: "Black screen" }).click();
  await expect(screen.locator(".projector-blackout")).toBeVisible({ timeout: 10000 });
  await expect(phone.getByRole("button", { name: "Black screen" })).toHaveAttribute("aria-pressed", "true");
  await phone.getByRole("button", { name: "Black screen" }).click();

  await phone.getByRole("button", { name: "Jump to an item" }).click();
  await phone.getByRole("button", { name: /Welcome/ }).last().click();
  await expect(screen.locator(".counter")).toHaveText("1 / 3", { timeout: 10000 });

  await computer.close();
  await phoneCtx.close();
});
