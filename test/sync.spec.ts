import { expect, test, type Page } from "@playwright/test";
import { createSession, cuttableStream, refuseSync } from "./browser.ts";

const settle = 1500;

const warteg = (page: Page) =>
  page.locator("button.km-place", { hasText: "Warteg Bahari" });

const isPull = (url: string) => {
  const { pathname } = new URL(url);
  return pathname.startsWith("/api/sessions/") && !pathname.endsWith("/events");
};

const afterSync = async <T>(page: Page, act: () => Promise<T>) => {
  const pulled = page.waitForResponse(
    (response) =>
      response.request().method() === "GET" && isPull(response.url()),
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
    if (isPull(request.url()) || request.method() === "POST") {
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

test("a sync that pulls nothing new leaves focus where the user put it", async ({
  page,
}) => {
  await afterSync(page, () => createSession(page, "Makan tenang"));

  await warteg(page).focus();
  await afterSync(page, () =>
    page.evaluate(() => window.dispatchEvent(new Event("online"))),
  );
  await page.waitForTimeout(settle);

  await expect(warteg(page)).toBeFocused();
});

test("a sync that pulls nothing new leaves the just-voted flash alone", async ({
  page,
}) => {
  await afterSync(page, () => createSession(page, "Makan kilat"));
  await warteg(page).click();
  await expect(warteg(page)).toHaveAttribute("data-voted", "true");

  await afterSync(page, () =>
    page.evaluate(() => window.dispatchEvent(new Event("online"))),
  );
  await page.waitForTimeout(settle);

  await expect(warteg(page)).toHaveAttribute("data-voted", "true");
});

test("a sync that brings a change repaints under the user without moving them", async ({
  browser,
}) => {
  const first = await browser.newContext();
  const second = await browser.newContext();
  const a = await first.newPage();
  const b = await second.newPage();

  const link = await afterSync(a, () => createSession(a, "Makan ramai"));
  await afterSync(b, () => b.goto(link));

  await warteg(a).focus();
  await warteg(b).click();
  await expect(warteg(b)).toHaveAttribute("data-votes", "1");

  await expect(warteg(a)).toHaveAttribute("data-votes", "1");
  await expect(warteg(a)).toBeFocused();

  await first.close();
  await second.close();
});

test("a sync that repeats the other device's document leaves the page alone", async ({
  browser,
}) => {
  const first = await browser.newContext();
  const second = await browser.newContext();
  const a = await first.newPage();
  const b = await second.newPage();

  const link = await afterSync(a, () => createSession(a, "Makan berulang"));
  await afterSync(b, () => b.goto(link));
  await warteg(b).click();
  await expect(warteg(b)).toHaveAttribute("data-votes", "1");
  await afterSync(b, () => b.reload());

  await expect(warteg(a)).toHaveAttribute("data-votes", "1");

  await warteg(a).click();
  await expect(warteg(a)).toHaveAttribute("data-voted", "true");

  await afterSync(a, () =>
    a.evaluate(() => window.dispatchEvent(new Event("online"))),
  );
  await a.waitForTimeout(settle);

  await expect(warteg(a)).toHaveAttribute("data-votes", "2");
  await expect(warteg(a)).toHaveAttribute("data-voted", "true");

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

test("a local write is published without waiting for the next sync", async ({
  page,
}) => {
  const link = await afterSync(page, () => createSession(page, "Makan tanggap"));
  const endpoint = link.replace("/s/", "/api/sessions/");

  const pushes = () =>
    page.waitForRequest(
      (request) =>
        request.method() === "POST" &&
        new URL(request.url()).pathname === endpoint,
      { timeout: 5_000 },
    );

  const voted = pushes();
  await warteg(page).click();
  await expect(warteg(page)).toHaveAttribute("data-votes", "1");
  await voted;

  const closed = pushes();
  await page.getByRole("button", { name: "Tutup sesi" }).click();
  await expect(page.getByText("Sudah ditutup")).toBeVisible();
  await closed;
});

test("a vote on one device shows up on the other with nobody touching it", async ({
  browser,
}) => {
  const first = await browser.newContext();
  const second = await browser.newContext();
  const a = await first.newPage();
  const b = await second.newPage();

  const link = await afterSync(a, () => createSession(a, "Makan serentak"));

  const live = b.waitForResponse((response) =>
    new URL(response.url()).pathname.endsWith("/events"),
  );
  await afterSync(b, () => b.goto(link));
  await live;
  await expect(warteg(b)).toHaveAttribute("data-votes", "0");

  await warteg(a).click();
  await expect(warteg(a)).toHaveAttribute("data-votes", "1");

  await expect(warteg(b)).toHaveAttribute("data-votes", "1");

  await first.close();
  await second.close();
});

test("a device told about its own write does not repaint under itself", async ({
  page,
}) => {
  await afterSync(page, () => createSession(page, "Makan sendiri"));

  await afterSync(page, () => warteg(page).click());

  await expect(warteg(page)).toHaveAttribute("data-votes", "1");
  await expect(warteg(page)).toHaveAttribute("data-voted", "true");
  await expect(warteg(page)).toBeFocused();

  await page.waitForTimeout(settle);

  await expect(warteg(page)).toHaveAttribute("data-voted", "true");
  await expect(warteg(page)).toBeFocused();
});

test("a device told about its own write stops after answering it once", async ({
  page,
}) => {
  const link = await afterSync(page, () => createSession(page, "Makan hemat"));
  const endpoint = link.replace("/s/", "/api/sessions/");
  await page.waitForTimeout(settle);

  const pushes: string[] = [];
  page.on("request", (request) => {
    if (
      request.method() === "POST" &&
      new URL(request.url()).pathname === endpoint
    ) {
      pushes.push(request.url());
    }
  });

  await warteg(page).click();
  await expect(warteg(page)).toHaveAttribute("data-votes", "1");
  await page.waitForTimeout(settle);

  expect(pushes.length).toBeLessThanOrEqual(2);
});

test("a device whose stream dropped picks up what it slept through", async ({
  browser,
}) => {
  const first = await browser.newContext();
  const second = await browser.newContext();
  const a = await first.newPage();
  const b = await second.newPage();

  const link = await afterSync(a, () => createSession(a, "Makan nyenyak"));
  const stream = await cuttableStream(b, new URL(a.url()).origin);

  const live = b.waitForResponse((response) =>
    new URL(response.url()).pathname.endsWith("/events"),
  );
  await afterSync(b, () => b.goto(link));
  await live;

  await warteg(a).click();
  await expect(warteg(b)).toHaveAttribute("data-votes", "1");

  stream.cut();

  await warteg(a).click();
  await expect(warteg(a)).toHaveAttribute("data-votes", "2");

  await expect(warteg(b)).toHaveAttribute("data-votes", "2", {
    timeout: 15_000,
  });

  await stream.stop();
  await first.close();
  await second.close();
});

test("a device whose first attempt after reconnecting is refused still converges", async ({
  browser,
}) => {
  const first = await browser.newContext();
  const second = await browser.newContext();
  const desktop = await first.newPage();
  const phone = await second.newPage();

  const link = await afterSync(desktop, () =>
    createSession(desktop, "Makan bergantian"),
  );
  await afterSync(phone, () => phone.goto(link));
  await expect(warteg(phone)).toHaveAttribute("data-votes", "0");

  await first.setOffline(true);
  await second.setOffline(true);

  await warteg(phone).click();
  await expect(warteg(phone)).toHaveAttribute("data-votes", "1");

  await second.setOffline(false);
  await phone.waitForTimeout(settle);

  await warteg(desktop).click();
  await expect(warteg(desktop)).toHaveAttribute("data-votes", "1");

  const refusals = await refuseSync(desktop, 1);
  await first.setOffline(false);

  await expect(warteg(desktop)).toHaveAttribute("data-votes", "2", {
    timeout: 20_000,
  });
  await expect(warteg(phone)).toHaveAttribute("data-votes", "2", {
    timeout: 20_000,
  });
  expect(refusals()).toBe(1);

  await first.close();
  await second.close();
});

test("a vote whose push was refused still reaches the relay, with nothing else touching the page", async ({
  page,
}) => {
  const link = await afterSync(page, () => createSession(page, "Makan ulang"));
  const endpoint = link.replace("/s/", "/api/sessions/");

  const refusals = await refuseSync(page, 1);
  await warteg(page).click();
  await expect(warteg(page)).toHaveAttribute("data-votes", "1");

  await expect
    .poll(
      async () => {
        const held = await page.request.get(endpoint);
        const docs = (await held.json()) as string[];
        return docs.reduce(
          (sum, doc) =>
            sum +
            ((JSON.parse(doc) as { up: Record<string, number> }).up["1"] ?? 0),
          0,
        );
      },
      { timeout: 15_000 },
    )
    .toBe(1);

  expect(refusals()).toBe(1);
});

test("a push the relay answers with an error is not mistaken for one that landed", async ({
  page,
}) => {
  const link = await afterSync(page, () => createSession(page, "Makan gagal"));
  const endpoint = link.replace("/s/", "/api/sessions/");

  let refused = 0;
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const { pathname } = new URL(request.url());
    if (request.method() === "POST" && pathname === endpoint && refused < 1) {
      refused += 1;
      return route.fulfill({
        status: 503,
        contentType: "application/json",
        body: '{"error":"down"}',
      });
    }
    return route.continue();
  });

  await warteg(page).click();
  await expect(warteg(page)).toHaveAttribute("data-votes", "1");

  await expect
    .poll(
      async () => {
        const held = await page.request.get(endpoint);
        const docs = (await held.json()) as string[];
        return docs.reduce(
          (sum, doc) =>
            sum +
            ((JSON.parse(doc) as { up: Record<string, number> }).up["1"] ?? 0),
          0,
        );
      },
      { timeout: 15_000 },
    )
    .toBe(1);

  expect(refused).toBe(1);
});

test("a device the relay refuses writes from still takes in everyone else's", async ({
  browser,
}) => {
  const first = await browser.newContext();
  const second = await browser.newContext();
  const a = await first.newPage();
  const b = await second.newPage();

  const link = await afterSync(a, () => createSession(a, "Makan sepihak"));
  await afterSync(b, () => b.goto(link));
  await expect(warteg(b)).toHaveAttribute("data-votes", "0");

  await b.route("**/api/**", async (route) =>
    route.request().method() === "POST"
      ? route.fulfill({
          status: 403,
          contentType: "application/json",
          body: '{"error":"forbidden"}',
        })
      : route.continue(),
  );

  await warteg(a).click();
  await expect(warteg(a)).toHaveAttribute("data-votes", "1");

  await expect(warteg(b)).toHaveAttribute("data-votes", "1", {
    timeout: 15_000,
  });

  await first.close();
  await second.close();
});

test("a device coming back to its tab picks up what it slept through", async ({
  browser,
}) => {
  const first = await browser.newContext();
  const second = await browser.newContext();
  const a = await first.newPage();
  const b = await second.newPage();

  const link = await afterSync(a, () => createSession(a, "Makan bangun"));
  await b.route("**/api/sessions/*/events", (route) => route.abort());
  await afterSync(b, () => b.goto(link));
  await expect(warteg(b)).toHaveAttribute("data-votes", "0");

  await warteg(a).click();
  await expect(warteg(a)).toHaveAttribute("data-votes", "1");

  await b.waitForTimeout(settle);
  await expect(warteg(b)).toHaveAttribute("data-votes", "0");

  await b.evaluate(() =>
    document.dispatchEvent(new Event("visibilitychange")),
  );

  await expect(warteg(b)).toHaveAttribute("data-votes", "1", {
    timeout: 10_000,
  });

  await first.close();
  await second.close();
});

test("a device whose stream was refused outright gets one back", async ({
  browser,
}) => {
  const first = await browser.newContext();
  const second = await browser.newContext();
  const a = await first.newPage();
  const b = await second.newPage();

  const link = await afterSync(a, () => createSession(a, "Makan pulih"));

  let down = true;
  let attempts = 0;
  await b.route("**/api/sessions/*/events", async (route) => {
    attempts += 1;
    return down
      ? route.fulfill({ status: 502, body: "down" })
      : route.continue();
  });

  await afterSync(b, () => b.goto(link));
  await expect(warteg(b)).toHaveAttribute("data-votes", "0");
  down = false;

  await warteg(a).click();
  await expect(warteg(a)).toHaveAttribute("data-votes", "1");

  await expect(warteg(b)).toHaveAttribute("data-votes", "1", {
    timeout: 20_000,
  });
  expect(attempts).toBeGreaterThan(1);

  await first.close();
  await second.close();
});
