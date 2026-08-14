import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { seedSession, startServer } from "./harness.ts";

let server: Awaited<ReturnType<typeof startServer>>;

const sessionShell =
  /<div data-session="true" data-id="[0-9a-z]{7}" data-state="loading"><p role="status">Memuat\.\.\.<\/p><\/div>/;
const landingShell =
  /<div data-sessions="true" data-state="loading"><p role="status">Memuat\.\.\.<\/p><\/div>/;

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

test("/ ships a loading shell carrying no session data", async () => {
  await seedSession(server.origin, { title: "Judul rahasia" });
  const html = await (await fetch(server.origin)).text();

  assert.equal(html.includes("Judul rahasia"), false);

  assert.match(html, landingShell);
  assert.match(html, /href="\/new"/);
  assert.match(html, /<noscript>/);
});

test("a non-canonical id serves the same shell under its canonical id", async () => {
  const path = await seedSession(server.origin);
  const id = path.slice(3);

  for (const variant of [
    `/s/${id.toUpperCase()}`,
    `/s/${id.replaceAll("0", "o").replaceAll("1", "l")}`,
  ]) {
    const res = await fetch(`${server.origin}${variant}`, {
      redirect: "manual",
    });
    assert.equal(res.status, 200, `${variant} gave ${res.status}`);
    assert.match(await res.text(), new RegExp(`data-id="${id}"`));
  }
});

test("the detail shell shows the canonical share url and a labelled QR", async () => {
  const path = await seedSession(server.origin);
  const html = await (await fetch(`${server.origin}${path}`)).text();

  assert.ok(html.includes(`${server.origin}${path}`));
  assert.match(html, /<svg/);
  assert.ok(html.includes("Kode QR untuk sesi ini"));
  assert.match(html, /data-share="true"/);
});

test("the create and session pages link back to the session list", async () => {
  const path = await seedSession(server.origin);

  for (const route of ["/new", path]) {
    const html = await (await fetch(`${server.origin}${route}`)).text();
    assert.match(
      html,
      /<a[^>]+href="\/"[^>]*>Semua sesi<\/a>/,
      `back link on ${route}`,
    );
  }
});
