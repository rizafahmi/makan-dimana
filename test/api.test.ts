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

test("GET /api/sessions returns an empty array for a fresh database", async () => {
  const res = await fetch(`${server.origin}/api/sessions`);
  assert.equal(res.status, 200);
  assert.match(String(res.headers.get("content-type")), /application\/json/);
  assert.deepEqual(await res.json(), []);
});

test("GET /api/sessions/[id] returns the session row as JSON", async () => {
  const path = await seedSession(server.origin, { title: "Sesi API" });
  const id = path.split("/").pop();

  const res = await fetch(`${server.origin}/api/sessions/${id}`);
  assert.equal(res.status, 200);
  assert.match(String(res.headers.get("content-type")), /application\/json/);

  const body = await res.json();
  assert.equal(body.id, id);
  assert.equal(body.title, "Sesi API");
  assert.equal(body.is_open, 1);
  assert.equal(body.place1_name, "Warteg");
  assert.equal(body.place2_name, "Padang");
  assert.equal(body.place1_votes, 0);
  assert.equal(body.place3_name, null);
});

test("GET /api/sessions/[id] resolves a lookalike-typo id", async () => {
  const path = await seedSession(server.origin, { title: "Sesi mirip" });
  const id = String(path.split("/").pop());
  const typo = id.replaceAll("1", "l").replaceAll("0", "O").toUpperCase();

  const res = await fetch(`${server.origin}/api/sessions/${typo}`);
  assert.equal(res.status, 200);
  assert.equal((await res.json()).id, id);
});

test("GET /api/sessions/[id] returns 404 for unknown and malformed ids", async () => {
  for (const id of ["zzzzzzz", "zzzzzz", "short", "abc12u3", "abc12!3"]) {
    const res = await fetch(`${server.origin}/api/sessions/${id}`);
    assert.equal(res.status, 404, `expected 404 for ${id}`);
  }
});

test("GET /api/sessions returns seeded sessions newest first", async () => {
  await seedSession(server.origin, { title: "Sesi lama" });
  await seedSession(server.origin, { title: "Sesi baru" });

  const body = await (await fetch(`${server.origin}/api/sessions`)).json();
  const titles = body.map((session: { title: string }) => session.title);

  assert.ok(titles.indexOf("Sesi baru") < titles.indexOf("Sesi lama"));
  assert.equal(body[0].place1_name, "Warteg");
  assert.ok(typeof body[0].created_at === "string");
});

