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

test("the landing page renders the shell and a link to /new", async () => {
  const res = await fetch(server.origin);
  assert.equal(res.status, 200);
  const html = await res.text();

  assert.match(html, /<html lang="id"/);
  assert.match(html, /href="\/new"/);
});
