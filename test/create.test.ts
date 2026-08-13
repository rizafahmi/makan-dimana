import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { postForm, readSession, startServer } from "./harness.ts";

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

  assert.equal(
    (await readSession(server.origin, location)).title,
    "Makan siang tim",
  );
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

test("a created session stores filled places at zero votes and nulls empty slots", async () => {
  const res = await postForm(server.origin, "/new", {
    title: "Dua tempat",
    place1: "Warteg",
    place2: "Padang",
    place3: "",
    place4: "",
  });

  const location = String(res.headers.get("location"));
  const session = await readSession(server.origin, location);

  assert.equal(session.place1_name, "Warteg");
  assert.equal(session.place2_name, "Padang");
  assert.equal(session.place1_votes, 0);
  assert.equal(session.place2_votes, 0);
  assert.equal(session.place3_name, null);
  assert.equal(session.place4_name, null);
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

test("the create form labels every control and links its errors", async () => {
  const html = await (await fetch(`${server.origin}/new`)).text();

  for (const name of ["title", "place1", "place2", "place3", "place4"]) {
    assert.match(
      html,
      new RegExp(`<label for="${name}">`),
      `label for ${name}`,
    );
    assert.match(html, new RegExp(`<input[^>]*id="${name}"`), `id on ${name}`);
  }
  const res = await postForm(server.origin, "/new", {
    title: "",
    place1: "Warteg",
    place2: "",
    place3: "",
    place4: "",
  });
  assert.equal(res.status, 422);

  const invalid = await res.text();
  assert.match(
    invalid,
    /<input[^>]*id="title"[^>]*aria-describedby="title-error"/,
  );
  assert.match(invalid, /id="title-error"/);
});
