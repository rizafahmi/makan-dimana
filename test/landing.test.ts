import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { startServer, seedSession } from "./harness.ts";

let server: Awaited<ReturnType<typeof startServer>>;

before(async () => {
  server = await startServer();
});

after(async () => {
  await server.stop();
});

test("a fresh database shows the empty state and a link to /new", async () => {
  const res = await fetch(server.origin);
  assert.equal(res.status, 200);
  const html = await res.text();

  assert.match(html, /<html lang="id"/);
  assert.match(html, /href="\/new"/);
  assert.ok(html.includes("Belum ada sesi"));
});

test("created sessions appear on the landing list newest first with open state", async () => {
  const first = await seedSession(server.origin, { title: "Sesi pertama" });
  const second = await seedSession(server.origin, { title: "Sesi kedua" });

  const html = await (await fetch(server.origin)).text();

  assert.equal(html.includes("Belum ada sesi"), false);
  assert.ok(html.includes(`href="${first}"`));
  assert.ok(html.includes(`href="${second}"`));
  assert.ok(html.indexOf("Sesi kedua") < html.indexOf("Sesi pertama"));
  assert.match(html, /data-open="1"[^>]*>Masih buka/);
});

test("each listed session shows its Indonesian relative age", async () => {
  const html = await (await fetch(server.origin)).text();
  assert.match(html, /baru saja/);
});
