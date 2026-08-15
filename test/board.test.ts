import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { seedSession, startServer } from "./harness.ts";

let server: Awaited<ReturnType<typeof startServer>>;

before(async () => {
  server = await startServer();
});

after(async () => {
  await server.stop();
});

test("/s/[id]/board ships the session shell flagged for the big screen", async () => {
  const path = await seedSession(server.origin, { title: "Rahasia sesi" });
  const res = await fetch(`${server.origin}${path}/board`);
  const html = await res.text();

  assert.equal(res.status, 200);
  assert.equal(html.includes("Rahasia sesi"), false);

  assert.match(html, /data-session="true"/);
  assert.match(html, /data-id="[0-9a-z]{7}"/);
  assert.match(html, /data-board="true"/);
  assert.match(html, /class="km-page km-board"/);
});

test("the board's QR sends the room to the voting page, not to the board", async () => {
  const path = await seedSession(server.origin);
  const html = await (await fetch(`${server.origin}${path}/board`)).text();

  assert.match(html, /data-share="true"/);
  assert.match(html, /<svg/);
  assert.ok(html.includes("Kode QR untuk sesi ini"));

  assert.ok(html.includes(`${server.origin}${path}<`));
  assert.equal(html.includes(`${server.origin}${path}/board`), false);
});

test("the board 404s a malformed id, like the page it mirrors", async () => {
  for (const id of ["zzzzzz", "short", "abc12u3", "abc12!3"]) {
    const res = await fetch(`${server.origin}/s/${id}/board`);
    assert.equal(res.status, 404, `id ${id} gave ${res.status}`);
  }
});
