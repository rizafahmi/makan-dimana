import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { postForm, startServer } from "./harness.ts";

let server: Awaited<ReturnType<typeof startServer>>;

before(async () => {
  server = await startServer();
});

after(async () => {
  await server.stop();
});

test("GET /new renders a labelled create form", async () => {
  const res = await fetch(`${server.origin}/new`);
  assert.equal(res.status, 200);
  const html = await res.text();

  for (const name of ["title", "place1", "place2", "place3", "place4"]) {
    assert.match(html, new RegExp(`<label for="${name}">`), `label ${name}`);
    assert.match(html, new RegExp(`<input[^>]*id="${name}"`), `id ${name}`);
    assert.match(html, new RegExp(`<input[^>]*name="${name}"`), `name ${name}`);
  }
  assert.match(html, /<button[^>]*>/);
});

test("POST /new answers 405, because creating is client-side", async () => {
  const res = await postForm(server.origin, "/new", {
    title: "Makan siang tim",
    place1: "Warteg",
    place2: "Padang",
  });

  assert.equal(res.status, 405);
  assert.equal(res.headers.get("allow"), "GET");
});
