import { expect, test } from "@playwright/test";

test("a real browser renders /new from the built server", async ({ page }) => {
  await page.goto("/new");

  await expect(page.locator("html")).toHaveAttribute("lang", "id");
  await expect(page.getByLabel("Judul")).toBeVisible();
  await expect(page.getByRole("button", { name: "Bikin sesi" })).toBeVisible();
});
