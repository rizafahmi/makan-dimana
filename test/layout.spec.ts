import { expect, test, type Locator, type Page } from "@playwright/test";
import { createSession, holdRelay } from "./browser.ts";

test.use({ viewport: { width: 390, height: 844 } });

const age = (minutes: number) =>
  new Promise<void>((resolve, reject) => {
    const request = indexedDB.open("makan", 1);
    request.onsuccess = () => {
      const tx = request.result.transaction("sessions", "readwrite");
      const store = tx.objectStore("sessions");
      const held = store.getAll();
      held.onsuccess = () => {
        const stamp = new Date(Date.now() - minutes * 60000)
          .toISOString()
          .slice(0, 19)
          .replace("T", " ");
        for (const session of held.result) {
          store.put({
            ...session,
            docs: session.docs.map((doc: { created_at: string | null }) =>
              doc.created_at === null ? doc : { ...doc, created_at: stamp },
            ),
          });
        }
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    };
    request.onerror = () => reject(request.error);
  });

const lines = (page: Page, selector: string) =>
  page.locator(selector).evaluate((node) => {
    const height = node.getBoundingClientRect().height;
    return Math.round(height / parseFloat(getComputedStyle(node).lineHeight));
  });

test("a title on the list reads as one line, not one letter per line", async ({
  page,
}) => {
  await holdRelay(page);
  await createSession(page, "Hidden Gem Kuliner");
  await page.evaluate(age, 55);

  await page.goto("/");
  await expect(page.locator("[data-sessions]")).toHaveAttribute(
    "data-state",
    "ready",
  );
  await expect(page.locator(".km-row-time")).toHaveText("55 menit lalu");

  expect(await lines(page, ".km-row-title")).toBe(1);
});

const unbroken = "RumahMakanPadangSederhanaBundoKanduangAsli";

const sideways = (page: Page) =>
  page.evaluate(() => {
    const doc = document.documentElement;
    return doc.scrollWidth - doc.clientWidth;
  });

test("no page scrolls sideways at a phone viewport, whatever it holds", async ({
  page,
}) => {
  await holdRelay(page);
  await createSession(page, unbroken, [unbroken, "Sate"]);
  const winner = page.locator("button.km-place", { hasText: unbroken });

  const spill: Record<string, number> = {};
  spill["/s/[id]"] = await sideways(page);

  await winner.click();
  await page.getByRole("button", { name: "Tutup sesi" }).click();
  await expect(page.getByText("Pemenang")).toBeVisible();
  spill["/s/[id] closed"] = await sideways(page);

  await page.goto("/");
  await expect(page.locator("[data-sessions]")).toHaveAttribute(
    "data-state",
    "ready",
  );
  spill["/"] = await sideways(page);

  await page.goto("/new");
  await page.getByLabel("Tempat 1").fill("W".repeat(61));
  await page.getByRole("button", { name: "Bikin sesi" }).click();
  await expect(page.locator("#place1-error")).toBeVisible();
  spill["/new"] = await sideways(page);

  expect(spill).toEqual({
    "/s/[id]": 0,
    "/s/[id] closed": 0,
    "/": 0,
    "/new": 0,
  });
});

const box = async (locator: Locator) => {
  const found = await locator.boundingBox();
  if (found === null) throw new Error("no box");
  return found;
};

test("the cancel control sits beside its row, not under it", async ({
  page,
}) => {
  await holdRelay(page);
  await createSession(page, "Makan malam tim");

  const warteg = page.locator("button.km-place", { hasText: "Warteg Bahari" });
  await warteg.click();
  await expect(warteg).toHaveAttribute("data-votes", "1");

  const row = await box(
    page.locator("button.km-place", { hasText: "Warteg Bahari" }),
  );
  const undo = await box(
    page.getByRole("button", { name: "Batalin vote Warteg Bahari" }),
  );

  expect(undo.x).toBeGreaterThanOrEqual(row.x + row.width - 1);
  expect(undo.y).toBeLessThan(row.y + row.height);
  expect(row.y).toBeLessThan(undo.y + undo.height);
  expect(undo.width).toBeGreaterThanOrEqual(44);
  expect(undo.height).toBeGreaterThanOrEqual(44);
});


test("the repository link lines up with the page, not the viewport edge", async ({
  page,
}) => {
  await page.goto("/");

  const heading = await box(page.getByRole("heading", { level: 1 }));
  const link = await box(page.locator(".km-foot a"));

  expect(Math.abs(link.x - heading.x)).toBeLessThanOrEqual(1);
});

test("the session id is a thumb-sized target, not a 13px sliver", async ({
  page,
}) => {
  await holdRelay(page);
  await createSession(page, "Makan malam tim");

  const id = await box(page.locator(".km-id"));

  expect(id.height).toBeGreaterThanOrEqual(44);
  expect(id.width).toBeGreaterThanOrEqual(44);
});
