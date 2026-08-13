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

test("an unknown url renders the custom Indonesian 404 page", async () => {
  const res = await fetch(`${server.origin}/tidak-ada`, { redirect: "manual" });

  assert.equal(res.status, 404);
  const html = await res.text();
  assert.ok(html.includes("Nyasar, ya?"));
  assert.match(html, /href="\/"/);
  assert.match(html, /<html lang="id"/);
});
