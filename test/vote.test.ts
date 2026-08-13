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

test("an upvote increments one place and survives a refresh", async () => {
  const path = await seedSession(server.origin);

  const res = await postForm(server.origin, path, {
    action: "upvote",
    place: "2",
  });

  assert.equal(res.status, 303);
  assert.equal(res.headers.get("location"), path);

  const session = await readSession(server.origin, path);
  assert.equal(session.place1_votes, 0);
  assert.equal(session.place2_votes, 1);
});

test("a downvote decrements and stays at zero", async () => {
  const path = await seedSession(server.origin);
  await postForm(server.origin, path, { action: "upvote", place: "1" });
  await postForm(server.origin, path, { action: "downvote", place: "1" });

  assert.equal((await readSession(server.origin, path)).place1_votes, 0);

  const res = await postForm(server.origin, path, {
    action: "downvote",
    place: "1",
  });
  assert.equal(res.status, 303);

  const session = await readSession(server.origin, path);
  assert.equal(session.place1_votes, 0);
  assert.equal(session.place2_votes, 0);
});

test("voting for an empty place slot returns 400 and changes nothing", async () => {
  const path = await seedSession(server.origin);

  const res = await postForm(server.origin, path, {
    action: "upvote",
    place: "3",
  });
  assert.equal(res.status, 400);

  const session = await readSession(server.origin, path);
  assert.equal(session.place1_votes, 0);
  assert.equal(session.place2_votes, 0);
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

  const session = await readSession(server.origin, path);
  assert.equal(session.place1_votes, 0);
  assert.equal(session.place2_votes, 0);
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

test("a non-canonical id serves and votes on the same session", async () => {
  const path = await seedSession(server.origin);
  const id = path.slice(3);
  const shouty = `/s/${id.toUpperCase()}`;
  const lookalike = `/s/${id.replaceAll("0", "o").replaceAll("1", "l")}`;

  for (const variant of [shouty, lookalike]) {
    const res = await fetch(`${server.origin}${variant}`, {
      redirect: "manual",
    });
    assert.equal(res.status, 200, `${variant} gave ${res.status}`);
  }

  const vote = await postForm(server.origin, shouty, {
    action: "upvote",
    place: "1",
  });
  assert.equal(vote.status, 303);
  assert.equal(vote.headers.get("location"), path);

  assert.equal((await readSession(server.origin, path)).place1_votes, 1);
});

test("the detail page shows the canonical share url and a labelled QR", async () => {
  const path = await seedSession(server.origin);
  const html = await (await fetch(`${server.origin}${path}`)).text();
  assert.ok(html.includes(`${server.origin}${path}`));
  assert.match(html, /<svg/);
  assert.ok(html.includes("Kode QR untuk sesi ini"));
});
