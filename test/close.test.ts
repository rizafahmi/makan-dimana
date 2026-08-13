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
