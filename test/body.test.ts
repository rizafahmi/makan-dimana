import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { readSession, seedSession, startServer } from "./harness.ts";

let server: Awaited<ReturnType<typeof startServer>>;

before(async () => {
  server = await startServer();
});
after(async () => {
  await server.stop();
});

test("a non-form body returns 400 on both POST endpoints", async () => {
  const path = await seedSession(server.origin);

  for (const target of ["/new", path]) {
    const res = await fetch(`${server.origin}${target}`, {
      method: "POST",
      headers: { origin: server.origin, "content-type": "application/json" },
      body: "{not json at all",
      redirect: "manual",
    });
    assert.equal(res.status, 400, `${target} gave ${res.status}`);
  }
  assert.equal((await readSession(server.origin, path)).place1_votes, 0);
});
