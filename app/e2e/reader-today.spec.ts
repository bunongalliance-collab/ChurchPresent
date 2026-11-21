import { expect, test } from "@playwright/test";

// Today's service in the Nau Mpro App: the order published from the Program, with its songs at the top of the list.
// The published row is faked here (publishing needs a signed-in team member); the songs are the real library.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { try { localStorage.setItem("nmInstallSnooze", String(Date.now() + 864e5)); } catch { /* ignore */ } });
});

test("today's service shows the order and opens its songs", async ({ page }) => {
  const d = new Date();
  const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  await page.route("**/rest/v1/published_services*", (route) => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify([{
      service_date: iso, title: "Sunday Service", date_label: "Test Sunday", updated_at: "",
      items: [
        { name: "Prelude", subs: [] },
        { name: "Opening Song", subs: [{ text: "1", kind: "song" }] },
        { name: "Scripture Reading", subs: [{ text: "Psalm 23", kind: "scripture", body: "1 The Lord is my shepherd.\n\n2 He makes me lie down in green pastures." }] },
        { name: "Reading", subs: [{ text: "Responsive Reading", kind: "reading" }] },
        { name: "Children Choir", subs: [] },
        { name: "Message", subs: [{ text: "Walking In Faith", kind: "text" }] },
      ],
    }]),
  }));
  await page.goto("/nau-mpro/");
  // Phones and tablets keep the list in a drawer or its own screen; it shows first on load
  const today = page.locator(".nm-today");
  await expect(today).toBeVisible({ timeout: 15000 });
  await expect(today).toContainText("Today’s service");
  await expect(today).toContainText("Sunday Service · Test Sunday");
  // Until the song list loads, a song shows as plain text; then it becomes a button
  const song = today.locator(".nm-today-song:not(.nm-today-text)");
  await expect(song).toHaveCount(1, { timeout: 15000 });
  // Only filled-in songs, choirs, readings and scripture: the prelude, the empty choir and the message are left out
  await expect(today.locator(".nm-today-name")).toHaveText(["Opening Song", "Scripture Reading", "Reading"]);
  // A reading without its text stays plain; a passage with its text opens like a song
  await expect(today.locator(".nm-today-sub")).toHaveText("Responsive Reading");
  const passage = today.locator(".nm-today-text");
  await expect(passage).toContainText("Psalm 23");
  await passage.click();
  await expect(page.locator(".nm-htitle")).toContainText("Psalm 23");
  await expect(page.locator(".nm-lyrics")).toContainText("He makes me lie down in green pastures.");
  if ((page.viewportSize()?.width ?? 1000) <= 760) await page.goBack();
  await expect(song.locator(".nm-num")).toHaveText("1");
  await song.click();
  await expect(page).toHaveURL(/#song-/);
  await expect(page.locator(".nm-htitle")).toBeVisible();

  // Searching hides the card, so the results come first
  if ((page.viewportSize()?.width ?? 1000) <= 760) await page.goBack();
  const search = page.getByRole("searchbox");
  if (await search.isVisible()) {
    await search.fill("ndu");
    await expect(today).toHaveCount(0);
  }
});
