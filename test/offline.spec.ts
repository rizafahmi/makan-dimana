import { expect, test, type Page } from "@playwright/test";
import { createSession } from "./browser.ts";

const controlled = (page: Page) =>
  expect
    .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null))
    .toBe(true);

const titles = (page: Page) => page.locator("[data-sessions] .km-row-title");

test("the list still renders with the network gone and the page reloaded", async ({
  context,
  page,
}) => {
  await createSession(page, "Makan siang tim");
  await controlled(page);

  await page.goto("/");
  await expect(titles(page)).toHaveText(["Makan siang tim"]);

  await context.setOffline(true);
  await page.reload();

  await expect(titles(page)).toHaveText(["Makan siang tim"]);
});

test("the shell it serves offline is still the styled one", async ({
  context,
  page,
}) => {
  await page.goto("/");
  await controlled(page);
  await page.goto("/");

  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.clearBrowserCache");

  await context.setOffline(true);
  await page.reload();

  await expect(page.locator("h1.km-h1")).toHaveCSS("font-weight", "900");
});

test("a sync request is never cached, and never answered from a cache", async ({
  context,
  page,
}) => {
  const link = await createSession(page, "Makan sore tim");
  const endpoint = link.replace("/s/", "/api/sessions/");
  await controlled(page);

  const streamed: string[] = [];
  page.on("request", (request) => {
    const { pathname } = new URL(request.url());
    if (pathname.endsWith("/events")) streamed.push(pathname);
  });

  await page.goto(link);
  await expect.poll(() => streamed).toEqual([`${endpoint}/events`]);

  const pulled = await page.evaluate(
    (path) => fetch(path).then((response) => response.json()),
    endpoint,
  );
  expect(pulled).not.toEqual([]);

  await context.setOffline(true);

  const answer = await page.evaluate(
    (path) =>
      fetch(path).then(
        () => "answered",
        () => "refused",
      ),
    endpoint,
  );
  expect(answer).toBe("refused");

  const held = await page.evaluate(async () => {
    const names = await caches.keys();
    const kept = await Promise.all(
      names.map(async (name) => (await caches.open(name)).keys()),
    );
    return kept.flat().map((request) => new URL(request.url).pathname);
  });
  expect(held.filter((path) => path.startsWith("/api/"))).toEqual([]);
});

const forgetShell = (page: Page, path: string) =>
  page.evaluate(async (gone) => {
    for (const name of await caches.keys()) {
      await (await caches.open(name)).delete(gone);
    }
  }, path);

test("a session whose own shell was never cached still renders offline", async ({
  context,
  page,
}) => {
  const link = await createSession(page, "Makan pagi tim");
  await controlled(page);
  await page.goto(link);
  await forgetShell(page, link);

  await context.setOffline(true);
  await page.goto(link);

  await expect(
    page.getByRole("heading", { name: "Makan pagi tim" }),
  ).toBeVisible();
  await expect(page.getByText("Warteg Bahari")).toBeVisible();
});

test("a shell borrowed from another session shows its QR to nobody", async ({
  context,
  page,
}) => {
  const link = await createSession(page, "Makan larut tim");
  await controlled(page);
  await page.goto(link);
  await forgetShell(page, link);

  await context.setOffline(true);
  await page.goto(link);

  const share = page.locator("[data-share]");
  await expect(share).toBeVisible();
  await expect(share.locator(".km-share-plate")).toHaveCount(0);
  await expect(share.locator(".km-share-url")).toHaveText(page.url());
});
