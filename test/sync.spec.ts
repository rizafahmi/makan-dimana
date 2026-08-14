import { expect, test, type Page } from "@playwright/test";
import { createSession } from "./browser.ts";

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
    if (pathname.startsWith("/api/")) {
      calls.push(`${request.method()} ${pathname}`);
    }
  });

  const link = await createSession(page, "Makan siang tim");
  const endpoint = link.replace("/s/", "/api/sessions/");

  await expect
    .poll(() => calls)
    .toEqual([`POST ${endpoint}`, `GET ${endpoint}`]);

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

  const link = await afterSync(a, () => createSession(a, "Makan siang tim"));
  await warteg(a).click();
  await expect(warteg(a)).toHaveAttribute("data-votes", "1");
  await afterSync(a, () => a.reload());

  await afterSync(b, () => b.goto(link));

  await expect(
    b.getByRole("heading", { name: "Makan siang tim" }),
  ).toBeVisible();
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

test("a close made on one device wins on a device that was still voting", async ({
  browser,
}) => {
  const first = await browser.newContext();
  const second = await browser.newContext();
  const a = await first.newPage();
  const b = await second.newPage();

  const link = await afterSync(a, () => createSession(a, "Makan bareng tim"));
  await afterSync(b, () => b.goto(link));

  await second.setOffline(true);
  await warteg(b).click();
  await expect(warteg(b)).toHaveAttribute("data-votes", "1");

  await a.getByRole("button", { name: "Tutup sesi" }).click();
  await expect(a.getByText("Sudah ditutup")).toBeVisible();
  await afterSync(a, () => a.reload());

  await afterSync(b, () => second.setOffline(false));

  await expect(b.getByText("Sudah ditutup")).toBeVisible();
  await expect(b.getByRole("button", { name: "Tutup sesi" })).toHaveCount(0);
  await expect(b.locator(".km-hero-who")).toHaveText("Warteg Bahari");
  await expect(b.locator(".km-hero-sub")).toHaveText("1 dari 1 suara");

  await first.close();
  await second.close();
});

test("the session paints from the store while the relay is still thinking", async ({
  page,
}) => {
  const link = await afterSync(page, () => createSession(page, "Makan cepat"));

  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/**", async (route) => {
    await held;
    await route.continue();
  });

  await page.goto(link);

  await expect(
    page.getByRole("heading", { name: "Makan cepat" }),
  ).toBeVisible();
  await expect(page.locator("[data-session]")).toHaveAttribute(
    "data-state",
    "ready",
  );
  await expect(warteg(page)).toBeVisible();

  release();
});

test("a document the relay never validated costs no one else their merge", async ({
  browser,
}) => {
  const first = await browser.newContext();
  const second = await browser.newContext();
  const a = await first.newPage();
  const b = await second.newPage();

  const complaints: string[] = [];
  a.on("pageerror", (error) => complaints.push(error.message));

  const link = await afterSync(a, () => createSession(a, "Makan aman"));
  const origin = new URL(a.url()).origin;
  const endpoint = link.replace("/s/", "/api/sessions/");

  for (const doc of ["not json at all {{{", '{"title":"Sesi palsu"}']) {
    const posted = await a.request.post(endpoint, {
      headers: { origin },
      form: { device: `hantu-${doc.length}`, doc },
    });
    expect(posted.status()).toBe(204);
  }

  await afterSync(b, () => b.goto(link));
  await warteg(b).click();
  await expect(warteg(b)).toHaveAttribute("data-votes", "1");
  await afterSync(b, () => b.reload());

  await afterSync(a, () => a.reload());

  await expect(a.getByRole("heading", { name: "Makan aman" })).toBeVisible();
  await expect(warteg(a)).toHaveAttribute("data-votes", "1");
  expect(complaints).toEqual([]);

  await first.close();
  await second.close();
});

test("a vote cast while the relay is answering survives the answer", async ({
  page,
}) => {
  const link = await afterSync(page, () => createSession(page, "Makan lambat"));
  await warteg(page).click();
  await expect(warteg(page)).toHaveAttribute("data-votes", "1");
  await afterSync(page, () => page.reload());

  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/**", async (route) => {
    await held;
    await route.continue();
  });

  await page.goto(link);
  await warteg(page).click();
  await expect(warteg(page)).toHaveAttribute("data-votes", "2");

  await afterSync(page, async () => release());

  await expect(warteg(page)).toHaveAttribute("data-votes", "2");

  await page.unroute("**/api/**");
  await afterSync(page, () => page.reload());
  await expect(warteg(page)).toHaveAttribute("data-votes", "2");
});
