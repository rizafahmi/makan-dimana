import { expect, test, type Page } from "@playwright/test";
import { createSession, holdRelay } from "./browser.ts";

const caps = (page: Page) => page.locator("[data-session] .km-key");

const row = (page: Page, name: string) =>
  page.locator("button.km-place", { hasText: name });

test("a key cap marks the slot a key reaches, wherever the sort puts the row", async ({
  page,
}) => {
  await holdRelay(page);
  const link = await createSession(page, "Makan siang tim", [
    "Warteg Bahari",
    "Nasi Padang",
    "Sate Madura",
  ]);

  await expect(page.getByText("Warteg Bahari")).toBeVisible();
  await expect(caps(page)).toHaveCount(0);

  await page.goto(`${link}/board`);
  await expect(caps(page)).toHaveText(["1", "2", "3"]);

  await row(page, "Nasi Padang").click();
  await expect(row(page, "Nasi Padang")).toHaveAttribute("data-votes", "1");
  await expect(caps(page)).toHaveText(["2", "1", "3"]);

  await page.getByRole("button", { name: "Tutup sesi" }).click();
  await expect(page.getByText("Pemenang")).toBeVisible();
  await expect(caps(page)).toHaveCount(0);
});

test("a number key votes its own slot up, and only on the board", async ({
  page,
}) => {
  await holdRelay(page);
  const link = await createSession(page, "Makan malam tim");

  await expect(row(page, "Nasi Padang")).toHaveAttribute("data-votes", "0");
  await page.keyboard.press("Digit2");
  await expect(row(page, "Nasi Padang")).toHaveAttribute("data-votes", "0");

  await page.goto(`${link}/board`);
  await page.keyboard.press("Digit2");

  await expect(row(page, "Nasi Padang")).toHaveAttribute("data-votes", "1");
  await expect(row(page, "Warteg Bahari")).toHaveAttribute("data-votes", "0");
});

test("Shift and a number key takes that slot's vote back", async ({ page }) => {
  await holdRelay(page);
  const link = await createSession(page, "Makan pagi tim");
  await page.goto(`${link}/board`);

  await page.keyboard.press("Digit1");
  await expect(row(page, "Warteg Bahari")).toHaveAttribute("data-votes", "1");

  await page.keyboard.press("Shift+Digit1");
  await expect(row(page, "Warteg Bahari")).toHaveAttribute("data-votes", "0");
});

test("t closes the session from the board, with nothing to confirm", async ({
  page,
}) => {
  await holdRelay(page);
  const link = await createSession(page, "Makan sore tim");
  await page.goto(`${link}/board`);

  await page.keyboard.press("Digit1");
  await page.keyboard.press("KeyT");

  await expect(page.getByText("Sudah ditutup")).toBeVisible();
  await expect(page.getByText("Pemenang")).toBeVisible();
  await expect(page.getByRole("button", { name: "Tutup sesi" })).toHaveCount(0);
});

test("no key moves a closed session, because closing is permanent", async ({
  page,
}) => {
  await holdRelay(page);
  const link = await createSession(page, "Makan larut tim");
  await page.goto(`${link}/board`);

  await page.keyboard.press("Digit1");
  await expect(row(page, "Warteg Bahari")).toHaveAttribute("data-votes", "1");

  await page.keyboard.press("KeyT");
  await expect(page.getByText("Sudah ditutup")).toBeVisible();

  await page.keyboard.press("Digit1");
  await page.keyboard.press("Digit2");
  await page.keyboard.press("Shift+Digit2");
  await page.keyboard.press("KeyT");

  await page.reload();

  await expect(page.locator(".km-hero-sub")).toHaveText("1 dari 1 suara");
  await expect(page.locator('.km-place[data-place="2"]')).toHaveAttribute(
    "data-votes",
    "0",
  );
});

test("a key typed into a field is text, not a vote", async ({ page }) => {
  await holdRelay(page);
  const link = await createSession(page, "Makan bareng tim");
  await page.goto(`${link}/board`);

  await page.evaluate(() => {
    const field = document.createElement("input");
    field.id = "catatan";
    document.body.append(field);
    field.focus();
  });
  await page.keyboard.type("11t");

  await expect(page.locator("#catatan")).toHaveValue("11t");
  await expect(page.getByText("Masih buka")).toBeVisible();
  await expect(row(page, "Warteg Bahari")).toHaveAttribute("data-votes", "0");
});

test("the board's hint is the keyboard legend, not the phone's tap hint", async ({
  page,
}) => {
  await holdRelay(page);
  const link = await createSession(page, "Makan siang panitia");

  await expect(page.locator(".km-hint")).toHaveText(
    "Ketuk baris buat vote. Tahan atau Shift+klik buat batalin.",
  );

  await page.goto(`${link}/board`);

  await expect(page.locator(".km-hint")).toHaveText(
    "Pencet 1-4 buat vote. Shift+angka buat batalin. T buat tutup sesi.",
  );
});

const readType = () => {
  const pick = (selector: string) => {
    const node = document.querySelector(selector);
    if (node === null) throw new Error(`missing ${selector}`);
    return node;
  };
  const size = (selector: string) =>
    parseFloat(getComputedStyle(pick(selector)).fontSize);
  return {
    width: pick("main").getBoundingClientRect().width,
    qr: pick(".km-share-plate").getBoundingClientRect().width,
    h1: size("h1.km-h1"),
    name: size(".km-place-name"),
    votes: size(".km-place-votes"),
    key: size(".km-key"),
  };
};

const fit = () => {
  const doc = document.documentElement;
  return {
    sideways: doc.scrollWidth - doc.clientWidth,
    down: doc.scrollHeight - doc.clientHeight,
  };
};

test.describe("on a projector", () => {
  test.use({ viewport: { width: 1920, height: 1080 } });

  test("the board is at display scale and fits the screen whole", async ({
    page,
  }) => {
    await holdRelay(page);
    const link = await createSession(
      page,
      "Makan siang tim Kantin Malam bareng panitia konferensi",
      [
        "Warteg Bahari Pak Slamet",
        "Nasi Padang Sederhana Minang",
        "Sate Madura Pak Kumis",
        "Bakmi Gajah Mada Legendaris",
      ],
    );

    await page.goto(`${link}/board`);
    await expect(caps(page)).toHaveCount(4);

    const shown = await page.evaluate(readType);
    expect(shown.width).toBeGreaterThan(1400);
    expect(shown.qr).toBeGreaterThanOrEqual(320);
    expect(shown.h1).toBeGreaterThanOrEqual(72);
    expect(shown.name).toBeGreaterThanOrEqual(40);
    expect(shown.votes).toBeGreaterThanOrEqual(56);
    expect(shown.key).toBeGreaterThanOrEqual(28);

    expect(await page.evaluate(fit)).toEqual({ sideways: 0, down: 0 });

    await page.keyboard.press("Digit1");
    await page.keyboard.press("KeyT");
    await expect(page.getByText("Pemenang")).toBeVisible();

    expect(await page.evaluate(fit)).toEqual({ sideways: 0, down: 0 });

    await page.goto(link);
    await expect(page.getByText("Pemenang")).toBeVisible();
    const phone = await page.evaluate(() =>
      parseFloat(getComputedStyle(document.querySelector("h1.km-h1")!).fontSize),
    );
    expect(phone).toBe(44);
  });
});
