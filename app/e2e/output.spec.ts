import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { PDFDocument } from "pdf-lib";

// The projector output window opens and shows content without errors
test("#projector opens without console errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/Keys should be unique/.test(m.text())) errors.push(m.text()); });
  await page.goto("/#projector");
  await page.waitForLoadState("networkidle");
  expect((await page.locator("body").innerText()).trim().length).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

// The program brochure downloads as a PDF and is exactly two pages (the layout rule in CLAUDE.md)
test("Download PDF makes a two-page brochure", async ({ page }) => {
  await page.goto("/#program");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download PDF" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/\.pdf$/);
  const doc = await PDFDocument.load(readFileSync(await file.path()));
  expect(doc.getPageCount()).toBe(2);
});
