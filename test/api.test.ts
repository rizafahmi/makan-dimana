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

