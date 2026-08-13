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

test("malformed mutation requests are rejected without changing any count", async () => {
  const path = await seedSession(server.origin);

  const cases: Record<string, string>[] = [
    {},
    { action: "bogus" },
    { action: "upvote" },
    { action: "upvote", place: "02" },
    { action: "upvote", place: "5" },
    { action: "upvote", place: " 2" },
  ];

  for (const fields of cases) {
    const label = JSON.stringify(fields);
    const res = await postForm(server.origin, path, fields);
    assert.equal(res.status, 400, `${label} gave ${res.status}`);
    const body = await res.text();
    assert.ok(body.includes("Permintaan tidak valid"), `message for ${label}`);
    assert.ok(body.includes(`href="${path}"`), `link for ${label}`);
  }
  const html = await (await fetch(`${server.origin}${path}`)).text();
  assert.match(html, /data-place="1"[^>]*data-votes="0"/);
  assert.match(html, /data-place="2"[^>]*data-votes="0"/);
});

test("mutations on malformed and unknown session ids return 404", async () => {
  for (const id of ["abc12!3", "zzzzzzz"]) {
    const res = await postForm(server.origin, `/s/${id}`, {
      action: "upvote",
      place: "1",
    });
    assert.equal(res.status, 404, `id ${id} gave ${res.status}`);
  }
});

test("detail page renders vote controls for each place", async () => {
  const path = await seedSession(server.origin);
  const html = await (await fetch(`${server.origin}${path}`)).text();

  assert.match(html, /<form[^>]*method="post"/i);
  assert.match(html, /<input[^>]*name="place"[^>]*value="1"/);
  assert.match(html, /<input[^>]*name="place"[^>]*value="2"/);
  assert.equal(/<input[^>]*name="place"[^>]*value="3"/.test(html), false);
  assert.match(html, /name="action"[^>]*value="upvote"/);
  assert.match(html, /name="action"[^>]*value="downvote"/);
});
