import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { seedSession, startServer } from "./harness.ts";

let server: Awaited<ReturnType<typeof startServer>>;

const sessionShell =
  /<div data-session="true" data-id="[0-9a-z]{7}" data-state="loading" role="status"><p>Memuat\.\.\.<\/p><\/div>/;

before(async () => {
  server = await startServer();
});

after(async () => {
  await server.stop();
});

test("/s/[id] ships a loading shell carrying no session data", async () => {
  const path = await seedSession(server.origin, { title: "Rahasia sesi" });
  const html = await (await fetch(`${server.origin}${path}`)).text();

  assert.equal(html.includes("Rahasia sesi"), false);
  assert.equal(html.includes("Warteg"), false);
  assert.equal(html.includes("Padang"), false);

  assert.match(html, sessionShell);
  assert.match(html, /<noscript>/);
});

test("/s/[id] serves a valid unknown id as a shell and 404s a malformed one", async () => {
  const unknown = await fetch(`${server.origin}/s/zzzzzzz`);
  assert.equal(unknown.status, 200);
  assert.match(await unknown.text(), sessionShell);

  for (const id of ["zzzzzz", "short", "abc12u3", "abc12!3"]) {
    const res = await fetch(`${server.origin}/s/${id}`);
    assert.equal(res.status, 404, `id ${id} gave ${res.status}`);
  }
});

