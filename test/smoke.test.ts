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

test("GET / returns 200 from the spawned production server", async () => {
  const res = await fetch(server.origin, { redirect: "manual" });
  assert.equal(res.status, 200);
});
