import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { startServer, postForm } from "./harness.ts";

let server: Awaited<ReturnType<typeof startServer>>;

before(async () => {
  server = await startServer();
});

after(async () => {
  await server.stop();
});

test("creating a session redirects to a detail page showing its title", async () => {
  const res = await postForm(server.origin, "/new", {
    title: "Makan siang tim",
    place1: "Warteg",
    place2: "Padang",
    place3: "",
    place4: "",
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

test("GET /new renders the create form fields", async () => {
  const res = await fetch(`${server.origin}/new`);
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /<form[^>]*method="post"/i);

  for (const name of ["title", "place1", "place2", "place3", "place4"]) {
    assert.match(html, new RegExp(`<input[^>]*name="${name}"`));
  }
  assert.match(html, /<button[^>]*>/);
});

test("unknown and malformed session IDs return 404", async () => {
  for (const id of ["zzzzzzz", "zzzzzz", "short", "abc12u3", "abc12!3"]) {
    const res = await fetch(`${server.origin}/s/${id}`);
    assert.equal(res.status, 404, `id ${id} gave ${res.status}`);
  }
});

test("the detail page lists each filled place at zero votes and skips empty slots", async () => {
  const res = await postForm(server.origin, "/new", {
    title: "Dua tempat",
    place1: "Warteg",
    place2: "Padang",
    place3: "",
    place4: "",
  });

  const location = String(res.headers.get("location"));

  const html = await (await fetch(`${server.origin}${location}`)).text();

  assert.match(html, /data-place="1"[^>]*data-votes="0"/);
  assert.match(html, /data-place="2"[^>]*data-votes="0"/);
  assert.equal(html.includes('data-place="3"'), false);
  assert.equal(html.includes('data-place="4"'), false);
  assert.ok(html.includes("Warteg"));
  assert.ok(html.includes("Padang"));
});

test("invalid create input returns 422 with errors and submitted values preserved", async () => {
  const res = await postForm(server.origin, "/new", {
    title: "",
    place1: "Warteg Bahari",
    place2: "  ",
    place3: "",
    place4: "",
  });
  assert.equal(res.status, 422);
  const html = await res.text();
  assert.ok(html.includes("Judul wajib diisi"));
  assert.ok(html.includes("Isi minimal 2 tempat"));
  assert.ok(html.includes('value="Warteg Bahari"'));
});
