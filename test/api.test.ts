import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import {
  postForm,
  readSession,
  readSessions,
  seedSession,
  sessionId,
  startServer,
} from "./harness.ts";

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
  assert.deepEqual(await readSessions(server.origin), []);
});

test("GET /api/sessions/[id] returns the session row as JSON", async () => {
  const path = await seedSession(server.origin, { title: "Sesi API" });
  const id = sessionId(path);

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
  const id = sessionId(path);
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

  const body = await readSessions(server.origin);
  const titles = body.map((session: { title: string }) => session.title);

  assert.ok(titles.indexOf("Sesi baru") < titles.indexOf("Sesi lama"));
  assert.equal(body[0].place1_name, "Warteg");
  assert.ok(typeof body[0].created_at === "string");
});

const seedId = async (title: string) =>
  sessionId(await seedSession(server.origin, { title }));

const mutate = (id: string, fields: Record<string, string>) =>
  postForm(server.origin, `/api/sessions/${id}`, fields);

const read = (id: string) => readSession(server.origin, id);

test("POST /api/sessions/[id] upvote returns the incremented session", async () => {
  const id = await seedId("Sesi vote");
  const res = await mutate(id, { action: "upvote", place: "1" });

  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.place1_votes, 1);
  assert.equal(body.place2_votes, 0);
});

test("POST /api/sessions/[id] downvote clamps at zero", async () => {
  const id = await seedId("Sesi turun");
  const res = await mutate(id, { action: "downvote", place: "1" });

  assert.equal(res.status, 200);
  assert.equal((await res.json()).place1_votes, 0);
});

test("POST /api/sessions/[id] rejects a vote for an empty slot", async () => {
  const id = await seedId("Sesi dua tempat");
  assert.equal((await mutate(id, { action: "upvote", place: "3" })).status, 400);
});

test("POST /api/sessions/[id] rejects malformed requests", async () => {
  const id = await seedId("Sesi salah");

  const malformed: Record<string, string>[] = [
    {},
    { action: "bogus" },
    { action: "upvote" },
    { action: "upvote", place: "02" },
    { action: "upvote", place: "5" },
    { action: "upvote", place: " 2" },
  ];

  for (const fields of malformed) {
    const res = await mutate(id, fields);
    assert.equal(res.status, 400, `expected 400 for ${JSON.stringify(fields)}`);
  }

  const state = await read(id);
  assert.equal(state.place1_votes, 0);
  assert.equal(state.place2_votes, 0);
});

test("POST /api/sessions/[id] close and reopen are idempotent", async () => {
  const id = await seedId("Sesi tutup");

  const closed = await mutate(id, { action: "close" });
  assert.equal(closed.status, 200);
  assert.equal((await closed.json()).is_open, 0);

  const again = await mutate(id, { action: "close" });
  assert.equal(again.status, 200);
  assert.equal((await again.json()).is_open, 0);

  const reopened = await mutate(id, { action: "reopen" });
  assert.equal(reopened.status, 200);
  assert.equal((await reopened.json()).is_open, 1);

  const reopenedAgain = await mutate(id, { action: "reopen" });
  assert.equal(reopenedAgain.status, 200);
  assert.equal((await reopenedAgain.json()).is_open, 1);
});

test("POST /api/sessions/[id] returns 409 for a vote on a closed session", async () => {
  const id = await seedId("Sesi sudah ditutup");
  await mutate(id, { action: "upvote", place: "1" });
  await mutate(id, { action: "close" });

  assert.equal((await mutate(id, { action: "upvote", place: "1" })).status, 409);
  assert.equal((await read(id)).place1_votes, 1);
});

test("POST /api/sessions/[id] returns 400 for a non-form body", async () => {
  const id = await seedId("Sesi body");
  const res = await fetch(`${server.origin}/api/sessions/${id}`, {
    method: "POST",
    headers: { origin: server.origin, "content-type": "application/json" },
    body: "{not json at all",
    redirect: "manual",
  });

  assert.equal(res.status, 400);

  const state = await read(id);
  assert.equal(state.place1_votes, 0);
  assert.equal(state.place2_votes, 0);
});

test("POST /api/sessions/[id] returns 404 for unknown and malformed ids", async () => {
  for (const id of ["zzzzzzz", "short", "abc12!3"]) {
    const res = await mutate(id, { action: "upvote", place: "1" });
    assert.equal(res.status, 404, `expected 404 for ${id}`);
  }
});

test("GET /api/sessions reports open and closed state", async () => {
  const id = await seedId("Sesi status");
  await mutate(id, { action: "close" });

  const body = await readSessions(server.origin);
  const row = body.find((session: { id: string }) => session.id === id);

  assert.equal(row.is_open, 0);
});

test("POST /api/sessions/[id] accepts a non-canonical id", async () => {
  const id = await seedId("Sesi non-kanonik");
  const shouty = id.replaceAll("1", "l").replaceAll("0", "o").toUpperCase();

  const res = await mutate(shouty, { action: "upvote", place: "1" });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).id, id);
  assert.equal((await read(id)).place1_votes, 1);
});
