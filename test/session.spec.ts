import { expect, test, type Page } from "@playwright/test";
import { createSession, holdRelay } from "./browser.ts";

const storedIds = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<string[]>((resolve, reject) => {
        const open = indexedDB.open("makan", 1);
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          if (!open.result.objectStoreNames.contains("sessions")) {
            return resolve([]);
          }
          const keys = open.result
            .transaction("sessions", "readonly")
            .objectStore("sessions")
            .getAllKeys();
          keys.onsuccess = () => resolve(keys.result.map(String));
          keys.onerror = () => reject(keys.error);
        };
      }),
  );

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

test("a vote survives a reload with the relay refusing every request", async ({
  page,
}) => {
  const complaints: string[] = [];
  page.on("pageerror", (error) => complaints.push(error.message));
  const refuse = await holdRelay(page);

  await createSession(page, "Makan malam tim");
  const warteg = () =>
    page.locator("button.km-place", { hasText: "Warteg Bahari" });

  await warteg().click();
  await expect(warteg()).toHaveAttribute("data-votes", "1");

  refuse();
  await page.reload();

  await expect(warteg()).toHaveAttribute("data-votes", "1");
  await expect(page.getByText("1 suara masuk · 2 tempat")).toBeVisible();
  expect(complaints).toEqual([]);
});

test("the flash lands on the row just voted, and only while it is fresh", async ({
  page,
}) => {
  await holdRelay(page);
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
  await holdRelay(page);
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
  await holdRelay(page);
  await createSession(page, "Makan larut tim");
  const warteg = () =>
    page.locator("button.km-place", { hasText: "Warteg Bahari" });

  await warteg().click();
  await warteg().click({ modifiers: ["Shift"] });

  await expect(warteg()).toHaveAttribute("data-votes", "0");

  await page.reload();

  await expect(warteg()).toHaveAttribute("data-votes", "0");
});

test("a long press on a row is just a slow vote, not a cancel", async ({
  page,
}) => {
  await holdRelay(page);
  await createSession(page, "Makan tengah malam");
  const warteg = () =>
    page.locator("button.km-place", { hasText: "Warteg Bahari" });

  await warteg().click();
  await expect(warteg()).toHaveAttribute("data-votes", "1");

  await warteg().hover();
  await page.mouse.down();
  await page.waitForTimeout(700);
  await page.mouse.up();

  await expect(warteg()).toHaveAttribute("data-votes", "2");
});

test("a row offers a way to take a vote back without a gesture", async ({
  page,
}) => {
  await holdRelay(page);
  await createSession(page, "Makan malam tim");
  const warteg = () =>
    page.locator("button.km-place", { hasText: "Warteg Bahari" });

  await warteg().click();
  await expect(warteg()).toHaveAttribute("data-votes", "1");

  const undo = page.getByRole("button", {
    name: "Batalin vote Warteg Bahari",
  });
  await expect(undo).toHaveText("Batalin");

  await undo.click();

  await expect(warteg()).toHaveAttribute("data-votes", "0");
});

test("closing is one-way: it survives a reload and offers no way back", async ({
  page,
}) => {
  await holdRelay(page);
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

test("opening a link records the session, so closing the tab cannot lose it", async ({
  page,
}) => {
  await page.goto("/s/zzzzzzz");
  await expect(page.locator("[data-session]")).toHaveAttribute(
    "data-state",
    "missing",
  );

  expect(await storedIds(page)).toEqual(["zzzzzzz"]);
});

test("a trailing slash on a session link still finds the session", async ({
  page,
}) => {
  await createSession(page, "Makan bareng tim");
  await page.goto(`${new URL(page.url()).pathname}/`);

  await expect(
    page.getByRole("heading", { name: "Makan bareng tim" }),
  ).toBeVisible();
});

test("a malformed id is refused by the client, not only by the page", async ({
  page,
}) => {
  await page.route("**/s/not-an-id", async (route) => {
    const shell = await page.request.get("/s/zzzzzzz");
    await route.fulfill({
      status: 200,
      contentType: "text/html",
      body: await shell.text(),
    });
  });

  await page.goto("/s/not-an-id");

  await expect(page.locator("[data-session]")).toHaveAttribute(
    "data-state",
    "missing",
  );
  expect(await storedIds(page)).toEqual([]);
});

test("a row that changes position slides there instead of jumping", async ({
  page,
}) => {
  await holdRelay(page);
  await createSession(page, "Makan malam tim");
  const first = () => page.locator("button.km-place").first();

  await expect(first()).toContainText("Warteg Bahari");
  await page.evaluate(() => {
    document.addEventListener("transitionstart", (event) => {
      if (event.propertyName !== "transform") return;
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const slot = target.dataset.place;
      if (slot === undefined) return;
      const seen = document.body.dataset.slid ?? "";
      document.body.dataset.slid = seen.includes(slot) ? seen : seen + slot;
    });
  });

  await page.locator("button.km-place", { hasText: "Nasi Padang" }).click();
  await expect(first()).toContainText("Nasi Padang");
  await expect(page.locator("body")).toHaveAttribute("data-slid", /^(12|21)$/);
});

test("a row hold its old position for a beat before it slides", async ({
  page,
}) => {
  await holdRelay(page);
  await createSession(page, "Makan malam tim");

  await expect(page.locator("button.km-place").first()).toContainText(
    "Warteg Bahari",
  );
  await page.evaluate(() => {
    document.addEventListener(
      "click",
      () => {
        document.body.dataset.tapped = String(performance.now());
      },
      true,
    );

    document.addEventListener("transitionstart", (event) => {
      if (event.propertyName !== "transform") return;
      if (document.body.dataset.waited !== undefined) return;
      const tapped = document.body.dataset.tapped;
      if (tapped === undefined) return;
      document.body.dataset.waited = String(
        Math.round(performance.now() - Number(tapped)),
      );
    });
  });
  await page.locator("button.km-place", { hasText: "Nasi Padang" }).click();

  await expect
    .poll(() =>
      page.evaluate(() => Number(document.body.dataset.waited ?? "-1")),
    )
    .toBeGreaterThanOrEqual(100);
});
