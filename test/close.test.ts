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

test("closing a session hides the vote controls and is idempotent", async () => {
  const path = await seedSession(server.origin);
  const res = await postForm(server.origin, path, { action: "close" });
  assert.equal(res.status, 303);
  assert.equal(res.headers.get("location"), path);

  const html = await (await fetch(`${server.origin}${path}`)).text();
  assert.equal(/name="action"[^>]*value="upvote"/.test(html), false);
  assert.equal(/name="action"[^>]*value="downvote"/.test(html), false);
  assert.match(html, /name="action"[^>]*value="reopen"/);
  const again = await postForm(server.origin, path, { action: "close" });
  assert.equal(again.status, 303);
  assert.equal(res.headers.get("location"), path);
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

  const html = await (await fetch(`${server.origin}${path}`)).text();
  assert.match(html, /data-place="1"[^>]*data-votes="1"/);
});

test("a closed session marks winners among populated places only", async () => {
  const leader = await seedSession(server.origin, { title: "Satu unggul" });
  await postForm(server.origin, leader, { action: "upvote", place: "2" });
  await postForm(server.origin, leader, { action: "close" });
  const leaderHtml = await (await fetch(`${server.origin}${leader}`)).text();
  assert.match(leaderHtml, /data-place="2"[^>]*data-winner="true"/);
  assert.equal(/data-place="1"[^>]*data-winner="true"/.test(leaderHtml), false);
  assert.ok(leaderHtml.includes("Pemenang"));
  const tie = await seedSession(server.origin, {
    title: "Seri",
  });
  await postForm(server.origin, tie, { action: "upvote", place: "1" });
  await postForm(server.origin, tie, { action: "upvote", place: "2" });
  await postForm(server.origin, tie, { action: "close" });
  const tieHtml = await (await fetch(`${server.origin}${tie}`)).text();
  assert.match(tieHtml, /data-place="1"[^>]*data-winner="true"/);
  assert.match(tieHtml, /data-place="2"[^>]*data-winner="true"/);
  assert.ok(tieHtml.includes("Seri!"));

  const empty = await seedSession(server.origin, { title: "Kosong" });
  await postForm(server.origin, empty, { action: "close" });
  const emptyHtml = await (await fetch(`${server.origin}${empty}`)).text();

  assert.equal(/data-winner="true"/.test(emptyHtml), false);
  assert.ok(emptyHtml.includes("Belum ada pemenang"));
});

test("reopening restores voting, hides the winner, and is idempotent", async () => {
  const path = await seedSession(server.origin);
  await postForm(server.origin, path, { action: "upvote", place: "1" });
  await postForm(server.origin, path, { action: "close" });
  const res = await postForm(server.origin, path, { action: "reopen" });
  assert.equal(res.status, 303);
  assert.equal(res.headers.get("location"), path);
  const html = await (await fetch(`${server.origin}${path}`)).text();
  assert.match(html, /data-place="1"[^>]*data-votes="1"/);
  assert.equal(/data-winner="true"/.test(html), false);
  assert.equal(html.includes("Pemenang"), false);
  assert.match(html, /name="action"[^>]*value="upvote"/);
  const vote = await postForm(server.origin, path, {
    action: "upvote",
    place: "1",
  });
  assert.equal(vote.status, 303);
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
  const html = await res.text();
  assert.match(html, /<title>Sesi sudah ditutup<\/title>/);
});
