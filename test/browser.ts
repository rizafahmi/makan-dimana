import { expect, type Page } from "@playwright/test";
import { createServer, type ServerResponse } from "node:http";
import { once } from "node:events";
import type { AddressInfo } from "node:net";

export const createSession = async (
  page: Page,
  title: string,
  places: string[] = ["Warteg Bahari", "Nasi Padang"],
) => {
  await page.goto("/new");
  await page.getByLabel("Judul").fill(title);
  for (const [index, place] of places.entries()) {
    await page.getByLabel(`Tempat ${index + 1}`).fill(place);
  }
  await page.getByRole("button", { name: "Bikin sesi" }).click();
  await expect(page).toHaveURL(/\/s\/[0-9a-hjkmnp-tv-z]{7}$/);
  return new URL(page.url()).pathname;
};

export const cuttableStream = async (page: Page, origin: string) => {
  const open = new Set<ServerResponse>();

  const proxy = createServer((request, response) => {
    const control = new AbortController();
    open.add(response);
    response.on("close", () => {
      open.delete(response);
      control.abort();
    });

    void (async () => {
      try {
        const upstream = await fetch(`${origin}${request.url}`, {
          signal: control.signal,
        });
        response.writeHead(upstream.status, {
          "content-type": "text/event-stream",
          "cache-control": "no-store",
          "access-control-allow-origin": "*",
        });
        for await (const chunk of upstream.body ?? []) response.write(chunk);
        response.end();
      } catch {
        response.destroy();
      }
    })();
  });

  proxy.listen(0, "127.0.0.1");
  await once(proxy, "listening");
  const { port } = proxy.address() as AddressInfo;

  await page.route("**/api/sessions/*/events", (route) =>
    route.continue({
      url: `http://127.0.0.1:${port}${new URL(route.request().url()).pathname}`,
    }),
  );

  const cut = () => {
    for (const response of open) response.destroy();
  };

  return {
    cut,
    stop: async () => {
      cut();
      proxy.close();
      await once(proxy, "close");
    },
  };
};

export const refuseSync = async (page: Page, times: number) => {
  let refused = 0;
  await page.route("**/api/**", async (route) => {
    const { pathname } = new URL(route.request().url());
    if (pathname.endsWith("/events") || refused >= times) {
      return route.continue();
    }
    refused += 1;
    return route.abort("internetdisconnected");
  });
  return () => refused;
};

export const holdRelay = async (page: Page) => {
  let refuse = () => {};
  const refused = new Promise<void>((resolve) => {
    refuse = resolve;
  });
  await page.route("**/api/**", async (route) => {
    await refused;
    await route.abort();
  });
  return refuse;
};
