import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { startServer } from "./harness.ts";

let server: Awaited<ReturnType<typeof startServer>>;

before(async () => {
  server = await startServer();
});
after(async () => {
  await server.stop();
});

test("a non-form body returns 400 on /new", async () => {
  const res = await fetch(`${server.origin}/new`, {
    method: "POST",
    headers: { origin: server.origin, "content-type": "application/json" },
    body: "{not json at all",
    redirect: "manual",
  });

  assert.equal(res.status, 400);
});
