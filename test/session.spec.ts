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

test("a vote survives a reload, with no server in it", async ({ page }) => {
  const calls: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/")) calls.push(request.url());
  });

  await createSession(page, "Makan malam tim");
  const warteg = () =>
    page.locator("button.km-place", { hasText: "Warteg Bahari" });

  await warteg().click();
  await expect(warteg()).toHaveAttribute("data-votes", "1");

  await page.reload();

  await expect(warteg()).toHaveAttribute("data-votes", "1");
  await expect(page.getByText("1 suara masuk · 2 tempat")).toBeVisible();
  expect(calls).toEqual([]);
});

test("the flash lands on the row just voted, and only while it is fresh", async ({
  page,
}) => {
  await createSession(page, "Makan pagi tim");
  const warteg = () =>
    page.locator("button.km-place", { hasText: "Warteg Bahari" });
  const padang = () =>
    page.locator("button.km-place", { hasText: "Nasi Padang" });

  await warteg().click();

  await expect(warteg()).toHaveAttribute("data-voted", "true");
  await expect(padang()).not.toHaveAttribute("data-voted");

  await padang().click();

  await expect(padang()).toHaveAttribute("data-voted", "true");
  await expect(warteg()).not.toHaveAttribute("data-voted");
});

test("focus survives the re-render a vote causes", async ({ page }) => {
  await createSession(page, "Makan sore tim");
  const warteg = () =>
    page.locator("button.km-place", { hasText: "Warteg Bahari" });

  await warteg().press("Enter");

  await expect(warteg()).toHaveAttribute("data-votes", "1");
  await expect(warteg()).toBeFocused();
});

test("Shift+click cancels a vote instead of stacking another", async ({
  page,
}) => {
  await createSession(page, "Makan larut tim");
  const warteg = () =>
    page.locator("button.km-place", { hasText: "Warteg Bahari" });

  await warteg().click();
  await warteg().click({ modifiers: ["Shift"] });

  await expect(warteg()).toHaveAttribute("data-votes", "0");

  await page.reload();

  await expect(warteg()).toHaveAttribute("data-votes", "0");
});

test("holding a row cancels a vote, and letting go does not add one back", async ({
  page,
}) => {
  await createSession(page, "Makan tengah malam");
  const warteg = () =>
    page.locator("button.km-place", { hasText: "Warteg Bahari" });

  await warteg().click();
  await expect(warteg()).toHaveAttribute("data-votes", "1");

  await warteg().hover();
  await page.mouse.down();
  await page.waitForTimeout(700);
  await page.mouse.up();

  await expect(warteg()).toHaveAttribute("data-votes", "0");
});

test("closing is one-way: it survives a reload and offers no way back", async ({
  page,
}) => {
  await createSession(page, "Makan siang Jumat");
  await page.locator("button.km-place", { hasText: "Warteg Bahari" }).click();

  await page.getByRole("button", { name: "Tutup sesi" }).click();

  await expect(page.getByText("Sudah ditutup")).toBeVisible();
  await expect(page.getByText("Pemenang")).toBeVisible();

  await page.reload();

  await expect(page.getByText("Sudah ditutup")).toBeVisible();
  await expect(page.getByRole("button", { name: "Buka lagi" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Tutup sesi" })).toHaveCount(0);
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
