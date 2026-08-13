import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { postForm, readSession, seedSession, startServer } from "./harness.ts";

let server: Awaited<ReturnType<typeof startServer>>;

before(async () => {
  server = await startServer();
});
after(async () => {
  await server.stop();
});

test("closing a session marks it closed and is idempotent", async () => {
  const path = await seedSession(server.origin);
  const res = await postForm(server.origin, path, { action: "close" });

  assert.equal(res.status, 303);
  assert.equal(res.headers.get("location"), path);
  assert.equal((await readSession(server.origin, path)).is_open, 0);

  const again = await postForm(server.origin, path, { action: "close" });
  assert.equal(again.status, 303);
  assert.equal(again.headers.get("location"), path);
  assert.equal((await readSession(server.origin, path)).is_open, 0);
});

test("voting on a closed session returns 409 without changing counts", async () => {
  const path = await seedSession(server.origin);
  await postForm(server.origin, path, { action: "upvote", place: "1" });
  await postForm(server.origin, path, { action: "close" });

  const res = await postForm(server.origin, path, {
    action: "upvote",
    place: "1",
  });
  assert.equal(res.status, 409);

  const body = await res.text();
  assert.ok(body.includes("Sesi sudah ditutup"));
  assert.ok(body.includes(`href="${path}"`));

  assert.equal((await readSession(server.origin, path)).place1_votes, 1);
});

test("reopening restores voting with counts intact and is idempotent", async () => {
  const path = await seedSession(server.origin);
  await postForm(server.origin, path, { action: "upvote", place: "1" });
  await postForm(server.origin, path, { action: "close" });

  const res = await postForm(server.origin, path, { action: "reopen" });
  assert.equal(res.status, 303);
  assert.equal(res.headers.get("location"), path);

  const session = await readSession(server.origin, path);
  assert.equal(session.is_open, 1);
  assert.equal(session.place1_votes, 1);

  const vote = await postForm(server.origin, path, {
    action: "upvote",
    place: "1",
  });
  assert.equal(vote.status, 303);
  assert.equal((await readSession(server.origin, path)).place1_votes, 2);

  const again = await postForm(server.origin, path, { action: "reopen" });
  assert.equal(again.status, 303);
});

test("an error response titles itself by its message", async () => {
  const path = await seedSession(server.origin);
  await postForm(server.origin, path, { action: "close" });
  const res = await postForm(server.origin, path, {
    action: "upvote",
    place: "1",
  });

  assert.equal(res.status, 409);
  assert.match(await res.text(), /<title>Sesi sudah ditutup<\/title>/);
});
