import { expect, test, type Page } from "@playwright/test";

const createSession = async (
  page: Page,
  title: string,
  places: string[] = ["Warteg Bahari", "Nasi Padang"],
) => {
  await page.goto("/new");
  await page.getByLabel("Judul").fill(title);
  for (const [index, place] of places.entries()) {
    await page.getByLabel(`Tempat ${index + 1}`).fill(place);
  }
  await page.getByRole("button", { name: "Bikin sesi" }).click();
  await expect(page).toHaveURL(/\/s\/[0-9a-hjkmnp-tv-z]{7}$/);
};

test("a session created on this device renders from the local store", async ({
  page,
}) => {
  await createSession(page, "Makan siang tim");

  await expect(page.locator("[data-session]")).toHaveAttribute(
    "data-state",
    "ready",
  );
  await expect(
    page.getByRole("heading", { name: "Makan siang tim" }),
  ).toBeVisible();
  await expect(page.getByText("Warteg Bahari")).toBeVisible();
  await expect(page.getByText("Nasi Padang")).toBeVisible();
  await expect(page.getByText("Masih buka")).toBeVisible();
});

test("a session this device does not hold reads as missing, not as loading", async ({
  page,
}) => {
  await page.goto("/s/zzzzzzz");

  const root = page.locator("[data-session]");
  await expect(root).toHaveAttribute("data-state", "missing");
  await expect(root.getByRole("status")).toHaveText("Sesi tidak ditemukan");
  await expect(page).toHaveTitle("Sesi tidak ditemukan");
  await expect(page.locator("[data-share]")).toBeHidden();
});
