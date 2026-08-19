import { expect, test, type Page } from "@playwright/test";
import { createSession, holdRelay, revealControls } from "./browser.ts";

const pastTheSecondBoundary = 1100;

const titles = (page: Page) => page.locator("[data-sessions] .km-row-title");

const row = (page: Page, title: string) =>
  page.locator("[data-sessions] .km-row", { hasText: title });

test("a device that holds nothing says so, rather than staying blank", async ({
  page,
}) => {
  await page.goto("/");

  const root = page.locator("[data-sessions]");
  await expect(root).toHaveAttribute("data-state", "ready");
  await expect(root.getByRole("status")).toHaveText("Belum ada sesi.");
});

test("the sessions made on this device are listed newest first, and survive a reload", async ({
  page,
}) => {
  await createSession(page, "Makan siang tim");
  await page.waitForTimeout(pastTheSecondBoundary);
  await createSession(page, "Makan malam tim");

  await page.goto("/");

  await expect(page.locator("[data-sessions]")).toHaveAttribute(
    "data-state",
    "ready",
  );
  await expect(titles(page)).toHaveText(["Makan malam tim", "Makan siang tim"]);
  await expect(page.locator(".km-subhead")).toContainText("2 sesi");

  await page.reload();

  await expect(titles(page)).toHaveText(["Makan malam tim", "Makan siang tim"]);
});

test("a session closed on its own page is listed as closed, an untouched one as open", async ({
  page,
}) => {
  await holdRelay(page);
  await createSession(page, "Makan siang tim");
  await revealControls(page);
  await page.getByRole("button", { name: "Tutup sesi" }).click();
  await expect(page.getByText("Sudah ditutup")).toBeVisible();
  await createSession(page, "Makan malam tim");

  await page.goto("/");

  const closed = row(page, "Makan siang tim");
  const open = row(page, "Makan malam tim");
  await expect(closed).toHaveAttribute("data-open", "0");
  await expect(closed.locator(".km-row-state")).toHaveText(
    "Sesi sudah ditutup",
  );
  await expect(open).toHaveAttribute("data-open", "1");
  await expect(open.locator(".km-row-state")).toHaveText("Sesi masih buka");
});

test("the list renders with every data request refused, and says nothing about it", async ({
  page,
}) => {
  await createSession(page, "Makan siang tim");

  const complaints: string[] = [];
  page.on("pageerror", (error) => complaints.push(error.message));
  await page.route("**/*", (route) =>
    ["fetch", "xhr"].includes(route.request().resourceType())
      ? route.abort()
      : route.continue(),
  );

  await page.goto("/");

  await expect(titles(page)).toHaveText(["Makan siang tim"]);
  expect(complaints).toEqual([]);
});

test("the list holds no stream open, whatever it holds", async ({ page }) => {
  await createSession(page, "Makan siang tim");
  await createSession(page, "Makan malam tim");
  await page.goto("/");

  const streams: string[] = [];
  page.on("request", (request) => {
    if (request.resourceType() === "eventsource") streams.push(request.url());
  });

  await page.reload();
  await expect(titles(page)).toHaveCount(2);
  await page.waitForTimeout(pastTheSecondBoundary);

  expect(streams).toEqual([]);
});
