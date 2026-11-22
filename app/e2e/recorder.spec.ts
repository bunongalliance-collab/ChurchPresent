import { expect, test } from "@playwright/test";

// The Recorder's lower third follows the projector window: it shows the Program Order item of the current slide,
// title and sub-items, and hides on the black screen. A fake camera stands in for the capture card.
test.use({
  permissions: ["camera", "microphone"],
  launchOptions: { args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] },
});

const deck = {
  font: "Arial", size: 60, bg: "#0b2a4a", fg: "#ffffff", showLabels: true,
  slides: [{ rows: ["Welcome"] }, { rows: ["Hymn line one"] }, { rows: ["Hymn line two"] }, { rows: ["John 3:16"] }],
  outline: [
    { title: "Welcome: Sunday", first: 0, count: 1, item: "Welcome", detail: "Sunday" },
    { title: "Opening Song: 12. Amazing Grace", first: 1, count: 2, item: "Opening Song", detail: "12. Amazing Grace" },
    { title: "Scripture Reading: John 3:16", first: 3, count: 1, item: "Scripture Reading", detail: "John 3:16" },
  ],
};

test("lower third follows the presentation", async ({ context }) => {
  const audience = await context.newPage();
  await audience.goto("/");
  await audience.evaluate((d) => { localStorage.setItem("lyricsDeck", JSON.stringify(d)); sessionStorage.setItem("projectorIndex", "0"); }, deck);
  await audience.goto("/#projector");
  await expect(audience.locator(".counter")).toHaveText("1 / 4");

  const recorder = await context.newPage();
  const errors: string[] = [];
  recorder.on("pageerror", (e) => errors.push(e.message));
  await recorder.goto("/#recorder");
  await expect(recorder.getByRole("heading", { name: "Recorder" })).toBeVisible();
  const now = recorder.locator(".rc-now");
  await expect(recorder.getByText("Following the presentation.")).toBeVisible();
  await expect(now).toContainText("Welcome");

  await audience.keyboard.press("ArrowRight");
  await expect(now).toContainText("Opening Song");
  await expect(now).toContainText("12. Amazing Grace");
  await audience.keyboard.press("ArrowRight"); // second slide of the same song: same item
  await expect(now).toContainText("Opening Song");
  await audience.keyboard.press("ArrowRight");
  await expect(now).toContainText("Scripture Reading");
  await expect(now).toContainText("John 3:16");

  await audience.keyboard.press("b");
  await expect(now).toContainText("Nothing");
  await audience.keyboard.press("b");
  await expect(now).toContainText("Scripture Reading");

  await recorder.keyboard.press("h");
  await expect(now).toContainText("Nothing");
  expect(errors).toEqual([]);
});
