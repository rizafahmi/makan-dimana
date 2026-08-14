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

const settle = 1500;

const warteg = (page: Page) =>
  page.locator("button.km-place", { hasText: "Warteg Bahari" });

const afterSync = async <T>(page: Page, act: () => Promise<T>) => {
  const pulled = page.waitForResponse(
    (response) =>
      response.request().method() === "GET" &&
      new URL(response.url()).pathname.startsWith("/api/sessions/"),
  );
  const value = await act();
  await pulled;
  return value;
};

test("a device pushes its own document before it pulls anyone else's", async ({
  page,
}) => {
  const calls: string[] = [];
  page.on("request", (request) => {
    const { pathname } = new URL(request.url());
    if (pathname.startsWith("/api/")) calls.push(`${request.method()} ${pathname}`);
  });

  const link = await createSession(page, "Makan siang tim");
  const endpoint = link.replace("/s/", "/api/sessions/");

  await expect.poll(() => calls).toEqual([`POST ${endpoint}`, `GET ${endpoint}`]);

  await page.waitForTimeout(settle);
  expect(calls).toHaveLength(2);
});

test("two devices each keep the other's vote, and their own", async ({
  browser,
}) => {
  const first = await browser.newContext();
  const second = await browser.newContext();
  const a = await first.newPage();
  const b = await second.newPage();

  const link = await createSession(a, "Makan siang tim");
  await warteg(a).click();
  await expect(warteg(a)).toHaveAttribute("data-votes", "1");
  await afterSync(a, () => a.reload());

  await afterSync(b, () => b.goto(link));

  await expect(b.getByRole("heading", { name: "Makan siang tim" })).toBeVisible();
  await expect(warteg(b)).toHaveAttribute("data-votes", "1");

  await warteg(b).click();
  await expect(warteg(b)).toHaveAttribute("data-votes", "2");
  await afterSync(b, () => b.reload());
  await expect(warteg(b)).toHaveAttribute("data-votes", "2");

  await afterSync(a, () => a.reload());

  await expect(warteg(a)).toHaveAttribute("data-votes", "2");
  await expect(a.getByText("2 suara masuk · 2 tempat")).toBeVisible();

  await first.close();
  await second.close();
});

test("a vote cast offline reaches the other device once the network is back", async ({
  browser,
}) => {
  const first = await browser.newContext();
  const second = await browser.newContext();
  const a = await first.newPage();
  const b = await second.newPage();

  const link = await afterSync(a, () => createSession(a, "Makan malam tim"));
  await afterSync(b, () => b.goto(link));
  await expect(warteg(b)).toHaveAttribute("data-votes", "0");

  await second.setOffline(true);
  await warteg(b).click();
  await expect(warteg(b)).toHaveAttribute("data-votes", "1");

  await afterSync(b, () => second.setOffline(false));

  await afterSync(a, () => a.reload());
  await expect(warteg(a)).toHaveAttribute("data-votes", "1");

  await first.close();
  await second.close();
});

test("coming back to the tab picks up what changed, with no reload", async ({
  browser,
}) => {
  const first = await browser.newContext();
  const second = await browser.newContext();
  const a = await first.newPage();
  const b = await second.newPage();

  const link = await afterSync(a, () => createSession(a, "Makan pagi tim"));
  await afterSync(b, () => b.goto(link));
  await warteg(b).click();
  await expect(warteg(b)).toHaveAttribute("data-votes", "1");
  await afterSync(b, () => b.reload());

  await expect(warteg(a)).toHaveAttribute("data-votes", "0");

  await afterSync(a, () =>
    a.evaluate(() => document.dispatchEvent(new Event("visibilitychange"))),
  );

  await expect(warteg(a)).toHaveAttribute("data-votes", "1");

  await first.close();
  await second.close();
});

test("the list picks up a session this device only had the link for", async ({
  browser,
}) => {
  const first = await browser.newContext();
  const second = await browser.newContext();
  const a = await first.newPage();
  const b = await second.newPage();

  const link = await afterSync(a, () => createSession(a, "Makan sore tim"));

  await b.route("**/api/**", (route) => route.abort());
  await b.goto(link);
  await expect(b.locator("[data-session]")).toHaveAttribute(
    "data-state",
    "missing",
  );
  await b.unroute("**/api/**");

  await afterSync(b, () => b.goto("/"));

  await expect(b.locator("[data-sessions] .km-row-title")).toHaveText([
    "Makan sore tim",
  ]);

  await first.close();
  await second.close();
});
