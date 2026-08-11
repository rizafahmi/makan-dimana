import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { startServer } from "./harness.ts";

let server: Awaited<ReturnType<typeof startServer>>;

before(async () => {
  server = await startServer();
});

after(async () => {
  await server.stop();
});

test("creating a session redirects to a detail page showing it's title", async () => {
  const res = await fetch(`${server.origin}/new`, {
    method: "POST",
    headers: { origin: server.origin },
    body: new URLSearchParams({
      title: "Makan siang tim",
      place1: "Warteg",
      place2: "Padang",
      place3: "",
      place4: "",
    }),
    redirect: "manual",
  });
  assert.equal(res.status, 303);
  const location = String(res.headers.get("location"));
  assert.match(location, /^\/s\/[0-9abcdefghjkmnpqrstvwxyz]{7}$/);

  const page = await fetch(`${server.origin}${location}`);
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.match(html, /<html lang="id"/);
  assert.match(html, /<meta name="viewport"/);
  assert.ok(html.includes("Makan siang tim"));
});
