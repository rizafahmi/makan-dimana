import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { postForm, seedSession, startServer } from "./harness.ts";

let server: Awaited<ReturnType<typeof startServer>>;

before(async () => {
  server = await startServer();
});
after(async () => {
  await server.stop();
});

test("an upvote increments one place and survives a refresh", async () => {
  const path = await seedSession(server.origin);

  const res = await postForm(server.origin, path, {
    action: "upvote",
    place: "2",
  });

  assert.equal(res.status, 303);
  assert.equal(res.headers.get("location"), path);

  const html = await (await fetch(`${server.origin}${path}`)).text();
  assert.match(html, /data-place="1"[^>]*data-votes="0"/);
  assert.match(html, /data-place="2"[^>]*data-votes="1"/);
});

test("a downvote decrements and stays at zero", async () => {
  const path = await seedSession(server.origin);
  await postForm(server.origin, path, { action: "upvote", place: "1" });
  await postForm(server.origin, path, { action: "downvote", place: "1" });

  let html = await (await fetch(`${server.origin}${path}`)).text();
  assert.match(html, /data-place="1"[^>]*data-votes="0"/);

  const res = await postForm(server.origin, path, {
    action: "downvote",
    place: "1",
  });
  assert.equal(res.status, 303);
  html = await (await fetch(`${server.origin}${path}`)).text();
  assert.match(html, /data-place="1"[^>]*data-votes="0"/);
  assert.match(html, /data-place="2"[^>]*data-votes="0"/);
});

test("voting for an empty place slot returns 400 and changes nothing", async () => {
  const path = await seedSession(server.origin);

  const res = await postForm(server.origin, path, {
    action: "upvote",
    place: "3",
  });
  assert.equal(res.status, 400);

  const html = await (await fetch(`${server.origin}${path}`)).text();
  assert.match(html, /data-place="1"[^>]*data-votes="0"/);
  assert.match(html, /data-place="2"[^>]*data-votes="0"/);
});
