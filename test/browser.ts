import { expect, type Page } from "@playwright/test";

export const createSession = async (
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
  return new URL(page.url()).pathname;
};

export const holdRelay = async (page: Page) => {
  let refuse = () => {};
  const refused = new Promise<void>((resolve) => {
    refuse = resolve;
  });
  await page.route("**/api/**", async (route) => {
    await refused;
    await route.abort();
  });
  return refuse;
};
