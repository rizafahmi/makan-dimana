import { expect, test, type Page } from "@playwright/test";
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
