import { expect, test, type Page } from "@playwright/test";

const createSession = async (page: Page, title: string) => {
  await page.goto("/new");
  await page.getByLabel("Judul").fill(title);
  await page.getByLabel("Tempat 1").fill("Warteg Bahari");
  await page.getByLabel("Tempat 2").fill("Nasi Padang");
  await page.getByRole("button", { name: "Bikin sesi" }).click();
  await expect(page).toHaveURL(/\/s\/[0-9a-hjkmnp-tv-z]{7}$/);
  return new URL(page.url()).pathname;
};

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
  await page.goto(link);

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
