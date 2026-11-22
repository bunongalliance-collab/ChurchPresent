import { expect, test } from "@playwright/test";

// Person A presents on one computer; person B records on another, and OBS shows the lower third. B's Recorder and
// the OBS overlay follow A's slides through the pairing code over Supabase Realtime (broadcast only; nothing stored).
const deck = {
  font: "Arial", size: 60, bg: "#0b2a4a", fg: "#ffffff", showLabels: true,
  slides: [{ rows: ["Welcome"] }, { rows: ["Hymn line one"] }, { rows: ["Hymn line two"] }, { rows: ["John 3:16"] }],
  outline: [
    { title: "Welcome: Sunday", first: 0, count: 1, item: "Welcome", detail: "Sunday" },
    { title: "Opening Song: 12. Amazing Grace", first: 1, count: 2, item: "Opening Song", detail: "12. Amazing Grace" },
    { title: "Scripture Reading: John 3:16", first: 3, count: 1, item: "Scripture Reading", detail: "John 3:16" },
  ],
};
const CODE = "FOLLOW" + String.fromCharCode(65 + Math.floor(Math.random() * 20)) + String.fromCharCode(65 + Math.floor(Math.random() * 20));

test.use({ permissions: ["camera", "microphone"], launchOptions: { args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] } });

test("a Recorder and the OBS overlay on other computers follow the presenter", async ({ browser }) => {
  test.setTimeout(90_000);
  const a = await browser.newContext();
  const screen = await a.newPage();
  await screen.goto("/");
  await screen.evaluate(([d, code]) => {
    localStorage.setItem("lyricsDeck", JSON.stringify(d));
    localStorage.setItem("remoteCode", code as string);
    sessionStorage.setItem("projectorIndex", "0");
  }, [deck, CODE] as const);
  await screen.goto("/#projector");
  await expect(screen.locator(".counter")).toHaveText("1 / 4");

  // Person B: nothing saved on this computer; the Program Order comes with the updates
  const b = await browser.newContext({ permissions: ["camera", "microphone"] });
  const recorder = await b.newPage();
  await recorder.goto("/#recorder");
  await recorder.getByLabel("Another computer").check();
  await recorder.getByLabel("Presenter's pairing code").fill(CODE.toLowerCase());
  const now = recorder.locator(".rc-now");
  await expect(recorder.getByText("Following the presentation.")).toBeVisible({ timeout: 20000 });
  await expect(now).toContainText("Welcome");
  await expect(recorder.getByLabel("Lower-third address for OBS")).toHaveValue(new RegExp(`#lowerthird:${CODE}$`));

  // OBS: its own browser, so a third context
  const obs = await (await browser.newContext({ viewport: { width: 960, height: 540 } })).newPage();
  await obs.goto(`/#lowerthird:${CODE}`);
  const bar = obs.locator(".lt-canvas");
  await expect(obs.locator(".lt-setup")).toHaveCount(0, { timeout: 20000 });
  await expect(bar).toHaveAttribute("aria-label", /Welcome/);
  expect(await obs.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe("rgba(0, 0, 0, 0)");

  await screen.keyboard.press("ArrowRight");
  await expect(now).toContainText("12. Amazing Grace", { timeout: 10000 });
  await expect(bar).toHaveAttribute("aria-label", /Opening Song/, { timeout: 10000 });
  await screen.keyboard.press("End");
  await expect(now).toContainText("Scripture Reading", { timeout: 10000 });
  await expect(bar).toHaveAttribute("aria-label", /Scripture Reading/, { timeout: 10000 });
  await screen.keyboard.press("b");
  await expect(now).toContainText("Nothing", { timeout: 10000 });
  await expect(bar).toHaveAttribute("aria-label", "Lower third", { timeout: 10000 });

  // Following never counts as a phone in the presenter's panel
  const presenter = await a.newPage();
  await presenter.goto("/#projector:presenter");
  await expect(presenter.getByRole("button", { name: "Phone remote" })).toBeVisible();
  await presenter.waitForTimeout(3500); // past a follower hello (every 3 s)
  await expect(presenter.getByRole("button", { name: "Phone remote" })).toBeVisible();
  await expect(presenter.getByText("Phone connected")).toHaveCount(0);
});
